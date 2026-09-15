import cv2
import numpy as np
import base64
import io
from PIL import Image, ImageOps
from typing import Tuple, Dict, Any, Optional, List

class ImageProcessor:
    @staticmethod
    def decode_image(image_bytes: bytes) -> np.ndarray:
        """Decode raw image bytes into an RGB OpenCV numpy array with EXIF orientation correction."""
        try:
            # Use PIL to safely handle EXIF orientation
            pil_img = Image.open(io.BytesIO(image_bytes))
            pil_img = ImageOps.exif_transpose(pil_img)
            if pil_img.mode != 'RGB':
                pil_img = pil_img.convert('RGB')
            img_np = np.array(pil_img)
            return img_np
        except Exception as e:
            # Fallback to cv2.imdecode
            nparr = np.frombuffer(image_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if img is None:
                raise ValueError(f"Failed to decode image: {str(e)}")
            return cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

    @staticmethod
    def decode_base64(data_url_or_b64: str) -> np.ndarray:
        """Decode base64 data URL or raw base64 string to RGB image array."""
        if "," in data_url_or_b64:
            header, encoded = data_url_or_b64.split(",", 1)
        else:
            encoded = data_url_or_b64
        image_bytes = base64.b64decode(encoded)
        return ImageProcessor.decode_image(image_bytes)

    @staticmethod
    def encode_to_base64(img_rgb: np.ndarray, format: str = "PNG") -> str:
        """Encode an RGB numpy array to a base64 data URL."""
        pil_img = Image.fromarray(img_rgb)
        buffered = io.BytesIO()
        pil_img.save(buffered, format=format)
        img_str = base64.b64encode(buffered.getvalue()).decode("utf-8")
        return f"data:image/{format.lower()};base64,{img_str}"

    @staticmethod
    def get_document_zones(img_rgb: np.ndarray) -> Dict[str, Dict[str, Any]]:
        """
        Segment the document into expected functional regions:
        - header: top 20%
        - photo: left 35%, middle vertical span
        - text: right 60%, middle vertical span
        - footer: bottom 20% (MRZ / barcode area)
        """
        h, w = img_rgb.shape[:2]
        
        photo_x1 = int(w * 0.05)
        photo_x2 = int(w * 0.33)
        photo_y1 = int(h * 0.21)
        photo_y2 = int(h * 0.76)
        
        text_x1 = int(w * 0.36)
        text_x2 = int(w * 0.95)
        text_y1 = int(h * 0.21)
        text_y2 = int(h * 0.76)
        
        zones = {
            "header": {
                "bbox": [0, 0, w, int(h * 0.22)],
                "crop": img_rgb[0:int(h * 0.22), 0:w]
            },
            "photo": {
                "bbox": [photo_x1, photo_y1, photo_x2 - photo_x1, photo_y2 - photo_y1],
                "crop": img_rgb[photo_y1:photo_y2, photo_x1:photo_x2]
            },
            "text": {
                "bbox": [text_x1, text_y1, text_x2 - text_x1, text_y2 - text_y1],
                "crop": img_rgb[text_y1:text_y2, text_x1:text_x2]
            },
            "footer": {
                "bbox": [0, int(h * 0.82), w, h - int(h * 0.82)],
                "crop": img_rgb[int(h * 0.82):h, 0:w]
            }
        }
        return zones

    @staticmethod
    def create_zone_overlay(img_rgb: np.ndarray, zones: Dict[str, Dict[str, Any]]) -> str:
        """Create a visual overlay showing labeled bounding zones with clean cyan/amber guides."""
        overlay = img_rgb.copy()
        
        # Color specs (RGB):
        colors = {
            "header": (14, 165, 233),   # Cyan/Sky
            "photo": (16, 185, 129),    # Emerald
            "text": (59, 130, 246),     # Blue
            "footer": (139, 92, 246)    # Purple
        }
        
        for name, data in zones.items():
            bbox = data["bbox"]
            x, y, w, h = bbox
            color = colors.get(name, (200, 200, 200))
            
            # Semi-transparent rectangle fill
            sub_img = overlay[y:y+h, x:x+w]
            color_rect = np.full(sub_img.shape, color, dtype=np.uint8)
            res = cv2.addWeighted(sub_img, 0.85, color_rect, 0.15, 1.0)
            overlay[y:y+h, x:x+w] = res
            
            # Border
            cv2.rectangle(overlay, (x, y), (x + w, y + h), color, 2)
            # Label
            cv2.putText(overlay, f"ZONE: {name.upper()}", (x + 8, y + 20),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.45, color, 1, cv2.LINE_AA)
            
        return ImageProcessor.encode_to_base64(overlay)

    @staticmethod
    def detect_document_corners(img_rgb: np.ndarray) -> Dict[str, Any]:
        """
        Detect the 4 corners of an ID document/card within an image using multi-strategy edge,
        adaptive thresholding, and geometric contour analysis.
        Computes real-time image quality metrics (sharpness, blur, brightness, glare, coverage, skew).
        """
        h, w = img_rgb.shape[:2]
        default_corners = [
            [int(w * 0.08), int(h * 0.08)],
            [int(w * 0.92), int(h * 0.08)],
            [int(w * 0.92), int(h * 0.92)],
            [int(w * 0.08), int(h * 0.92)]
        ]

        # Quality metrics defaults
        quality = {
            "blur_score": 0.0,
            "is_blurry": False,
            "brightness": 0.0,
            "is_too_dark": False,
            "is_too_bright": False,
            "glare_percentage": 0.0,
            "glare_detected": False,
            "coverage_percentage": 0.0,
            "is_too_far": False,
            "is_too_close": False,
            "is_partially_out": False,
            "aspect_ratio": 1.586,
            "quality_status": "SEARCHING",
            "quality_message": "Searching for document..."
        }

        try:
            # Downscale preview frame for ultra-fast, non-blocking CV processing
            max_dim = 800
            scale = 1.0
            if max(h, w) > max_dim:
                scale = max_dim / float(max(h, w))
                small = cv2.resize(img_rgb, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
            else:
                small = img_rgb.copy()

            sh, sw = small.shape[:2]
            gray = cv2.cvtColor(small, cv2.COLOR_RGB2GRAY)

            # 1. Optical Quality Metrics
            # Blur / Sharpness via Laplacian variance
            lap_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
            quality["blur_score"] = round(lap_var, 1)
            quality["is_blurry"] = lap_var < 35.0

            # Brightness via mean grayscale intensity
            brightness = float(np.mean(gray))
            quality["brightness"] = round(brightness, 1)
            quality["is_too_dark"] = brightness < 45.0
            quality["is_too_bright"] = brightness > 228.0

            # Glare detection via high-intensity saturated highlight clusters
            # Real glare is a localized specular hotspot (>252), distinct from uniform white document paper
            _, thresh_glare = cv2.threshold(gray, 252, 255, cv2.THRESH_BINARY)
            glare_pixels = int(np.count_nonzero(thresh_glare))
            total_pixels = sw * sh
            glare_pct = round((glare_pixels / max(1, total_pixels)) * 100.0, 2)
            quality["glare_percentage"] = glare_pct
            quality["glare_detected"] = (glare_pct > 12.0 and brightness < 220.0) or (glare_pct > 28.0)

            # 2. Multi-Strategy Candidate Extraction
            candidates = []

            # Strategy A: Median Canny Edge Detection
            blurred_canny = cv2.GaussianBlur(gray, (5, 5), 0)
            v = np.median(blurred_canny)
            lower = int(max(0, (1.0 - 0.33) * v))
            upper = int(min(255, (1.0 + 0.33) * v))
            edged_canny = cv2.Canny(blurred_canny, lower, upper)
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7))
            closed_canny = cv2.morphologyEx(edged_canny, cv2.MORPH_CLOSE, kernel)
            cnts_canny, _ = cv2.findContours(closed_canny, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
            candidates.extend(cnts_canny)

            # Strategy B: Adaptive Gaussian Thresholding (robust against shadows & gradients)
            adaptive = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 15, 4)
            closed_adapt = cv2.morphologyEx(adaptive, cv2.MORPH_CLOSE, kernel)
            cnts_adapt, _ = cv2.findContours(closed_adapt, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
            candidates.extend(cnts_adapt)

            # Filter candidates for valid quadrilaterals
            best_quad = None
            best_score = -1.0

            for cnt in candidates:
                area = cv2.contourArea(cnt)
                if area < (sw * sh * 0.12) or area > (sw * sh * 0.95):
                    continue

                peri = cv2.arcLength(cnt, True)
                approx = cv2.approxPolyDP(cnt, 0.025 * peri, True)

                if len(approx) == 4 and cv2.isContourConvex(approx):
                    pts = approx.reshape(4, 2).astype(np.float32)

                    # Compute approximate aspect ratio
                    d01 = np.linalg.norm(pts[0] - pts[1])
                    d12 = np.linalg.norm(pts[1] - pts[2])
                    d23 = np.linalg.norm(pts[2] - pts[3])
                    d30 = np.linalg.norm(pts[3] - pts[0])
                    dim_a = (d01 + d23) / 2.0
                    dim_b = (d12 + d30) / 2.0
                    w_est = max(dim_a, dim_b)
                    h_est = max(1.0, min(dim_a, dim_b))
                    ratio = w_est / h_est

                    # ID-1 standard ratio ~1.586 (cards generally fall between 1.25 and 1.95)
                    ratio_score = 100.0 - min(100.0, abs(ratio - 1.586) * 45.0)

                    # Center proximity score
                    center_cnt = np.mean(pts, axis=0)
                    center_frame = np.array([sw / 2.0, sh / 2.0])
                    dist_from_center = np.linalg.norm(center_cnt - center_frame)
                    center_score = 100.0 - min(100.0, (dist_from_center / sw) * 80.0)

                    # Area coverage score
                    coverage_pct = (area / (sw * sh)) * 100.0
                    coverage_score = 100.0 - abs(coverage_pct - 60.0)

                    total_score = ratio_score * 0.45 + center_score * 0.35 + coverage_score * 0.20
                    if total_score > best_score:
                        best_score = total_score
                        best_quad = pts

            if best_quad is not None:
                # Order corners: TL, TR, BR, BL
                s = best_quad.sum(axis=1)
                tl = best_quad[np.argmin(s)]
                br = best_quad[np.argmax(s)]

                diff = np.diff(best_quad, axis=1)
                tr = best_quad[np.argmin(diff)]
                bl = best_quad[np.argmax(diff)]

                ordered = np.array([tl, tr, br, bl], dtype=np.float32)
                original_corners = [[int(pt[0] / scale), int(pt[1] / scale)] for pt in ordered]

                # Geometry metrics on full-size scale
                doc_area = cv2.contourArea(np.array(original_corners, dtype=np.int32))
                cov_pct = round((doc_area / max(1, w * h)) * 100.0, 1)
                quality["coverage_percentage"] = cov_pct
                quality["is_too_far"] = cov_pct < 20.0
                quality["is_too_close"] = cov_pct > 86.0

                # Margin check: is any corner touching outer 2.5% frame margin?
                margin_x = w * 0.025
                margin_y = h * 0.025
                is_out = any(
                    c[0] <= margin_x or c[0] >= (w - margin_x) or c[1] <= margin_y or c[1] >= (h - margin_y)
                    for c in original_corners
                )
                quality["is_partially_out"] = is_out

                # Card aspect ratio
                width_top = np.linalg.norm(np.array(original_corners[1]) - np.array(original_corners[0]))
                width_bot = np.linalg.norm(np.array(original_corners[2]) - np.array(original_corners[3]))
                height_left = np.linalg.norm(np.array(original_corners[3]) - np.array(original_corners[0]))
                height_right = np.linalg.norm(np.array(original_corners[2]) - np.array(original_corners[1]))
                avg_width = max(width_top, width_bot)
                avg_height = max(1.0, max(height_left, height_right))
                card_ar = round(max(avg_width, avg_height) / max(1.0, min(avg_width, avg_height)), 2)
                quality["aspect_ratio"] = card_ar

                # Resolve concrete Quality Status & Message
                if quality["is_too_dark"]:
                    quality["quality_status"] = "TOO_DARK"
                    quality["quality_message"] = "Low lighting — increase illumination"
                elif quality["is_blurry"]:
                    quality["quality_status"] = "TOO_BLURRY"
                    quality["quality_message"] = "Camera out of focus — hold steady"
                elif quality["glare_detected"]:
                    quality["quality_status"] = "GLARE_DETECTED"
                    quality["quality_message"] = "Reflection detected — tilt document slightly"
                elif quality["is_too_far"]:
                    quality["quality_status"] = "TOO_FAR"
                    quality["quality_message"] = "Move camera closer to document"
                elif quality["is_too_close"]:
                    quality["quality_status"] = "TOO_CLOSE"
                    quality["quality_message"] = "Move camera slightly back"
                elif quality["is_partially_out"]:
                    quality["quality_status"] = "OUT_OF_FRAME"
                    quality["quality_message"] = "Document partially out of frame"
                elif card_ar < 1.15 or card_ar > 2.2:
                    quality["quality_status"] = "ROTATE_DOCUMENT"
                    quality["quality_message"] = "Align document inside frame"
                else:
                    quality["quality_status"] = "GOOD_CAPTURE"
                    quality["quality_message"] = "Ready to capture"

                confidence = max(70.0, min(96.0, best_score))
                if quality["quality_status"] != "GOOD_CAPTURE":
                    confidence = max(60.0, confidence - 15.0)

                return {
                    "detected": True,
                    "confidence": round(confidence, 1),
                    "corners": original_corners,
                    "image_width": w,
                    "image_height": h,
                    "quality": quality
                }

        except Exception as e:
            print(f"[ImageProcessor] detect_document_corners exception: {e}")

        # Fallback when no document contour is detected
        return {
            "detected": False,
            "confidence": 35.0,
            "corners": default_corners,
            "image_width": w,
            "image_height": h,
            "quality": quality
        }

    @staticmethod
    def warp_perspective(img_rgb: np.ndarray, corners: List[List[float]], safety_margin_pct: float = 0.015) -> np.ndarray:
        """
        Warp an arbitrary quadrilateral document into a normalized flat rectangular image.
        Corners format: [[x_tl, y_tl], [x_tr, y_tr], [x_br, y_br], [x_bl, y_bl]]
        Expands corners slightly outward by safety_margin_pct (1.5%) to guarantee that
        text, seals, MRZ lines, and demographic fields at the perimeter are never clipped.
        """
        img_h, img_w = img_rgb.shape[:2]
        pts = np.array(corners, dtype=np.float32)

        # Centroid of quadrilateral
        centroid = np.mean(pts, axis=0)

        # Apply subtle outward safety margin to preserve borders completely
        if safety_margin_pct > 0.0:
            expanded_pts = []
            for pt in pts:
                vec = pt - centroid
                expanded_pt = centroid + vec * (1.0 + safety_margin_pct)
                # Clamp within image bounds
                clamped_x = max(0.0, min(float(img_w - 1), float(expanded_pt[0])))
                clamped_y = max(0.0, min(float(img_h - 1), float(expanded_pt[1])))
                expanded_pts.append([clamped_x, clamped_y])
            pts = np.array(expanded_pts, dtype=np.float32)

        tl, tr, br, bl = pts[0], pts[1], pts[2], pts[3]

        # Compute width of new image
        width_a = np.sqrt(((br[0] - bl[0]) ** 2) + ((br[1] - bl[1]) ** 2))
        width_b = np.sqrt(((tr[0] - tl[0]) ** 2) + ((tr[1] - tl[1]) ** 2))
        max_width = max(int(width_a), int(width_b))

        # Compute height of new image
        height_a = np.sqrt(((tr[0] - br[0]) ** 2) + ((tr[1] - br[1]) ** 2))
        height_b = np.sqrt(((tl[0] - bl[0]) ** 2) + ((tl[1] - bl[1]) ** 2))
        max_height = max(int(height_a), int(height_b))

        # Maintain high crisp resolution suitable for OCR without overscaling
        max_width = max(800, min(max_width, 1600))
        max_height = max(500, min(max_height, 1200))

        # Preserve natural aspect ratio if reasonably within ID card specifications
        aspect_ratio = max_width / max(1.0, float(max_height))
        if 1.25 <= aspect_ratio <= 1.95:
            # Preserve natural aspect ratio
            max_height = int(max_width / aspect_ratio)
        elif aspect_ratio < 1.0:
            # Portrait orientation
            max_width = max(500, min(max_width, 1200))
            max_height = max(800, min(max_height, 1600))
        else:
            # Standard ID-1 default fallback
            max_height = int(max_width / 1.586)

        dst = np.array([
            [0, 0],
            [max_width - 1, 0],
            [max_width - 1, max_height - 1],
            [0, max_height - 1]
        ], dtype=np.float32)

        M = cv2.getPerspectiveTransform(pts, dst)
        warped = cv2.warpPerspective(img_rgb, M, (max_width, max_height), flags=cv2.INTER_LANCZOS4)
        return warped

