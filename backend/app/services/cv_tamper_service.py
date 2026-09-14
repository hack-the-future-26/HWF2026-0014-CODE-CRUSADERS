import cv2
import numpy as np
import io
from PIL import Image, ImageChops, ImageEnhance
from typing import Dict, Any, List, Tuple
from backend.app.models.schemas import Finding, FindingSeverity
from backend.app.services.image_processor import ImageProcessor

class CVTamperService:
    @staticmethod
    def compute_ela(img_rgb: np.ndarray, quality: int = 90, scale: int = 15) -> Tuple[float, np.ndarray]:
        """
        Perform Error Level Analysis (ELA).
        Re-compresses the image at given JPEG quality and computes pixel-by-pixel difference.
        Returns: (mean_ela_diff, ela_heatmap_rgb)
        """
        orig_pil = Image.fromarray(img_rgb)
        
        # Save to buffer at specified JPEG quality
        buffer = io.BytesIO()
        orig_pil.save(buffer, 'JPEG', quality=quality)
        buffer.seek(0)
        
        resaved_pil = Image.open(buffer)
        
        # Compute absolute difference
        diff = ImageChops.difference(orig_pil, resaved_pil)
        
        # Calculate statistics
        diff_np = np.array(diff)
        mean_diff = float(np.mean(diff_np))
        
        # Enhance for visual display
        extrema = diff.getextrema()
        max_diff = max([ex[1] for ex in extrema]) if extrema else 1
        scale_factor = 255.0 / max(1, max_diff) if max_diff > 0 else 1.0
        # Use controlled scale
        enhanced = ImageEnhance.Brightness(diff).enhance(scale_factor * 0.75)
        enhanced_np = np.array(enhanced)
        
        # Apply false color heatmap for clear visual cues (blue=low error, red=high error)
        gray_diff = cv2.cvtColor(enhanced_np, cv2.COLOR_RGB2GRAY)
        heatmap = cv2.applyColorMap(gray_diff, cv2.COLORMAP_JET)
        heatmap_rgb = cv2.cvtColor(heatmap, cv2.COLOR_BGR2RGB)
        
        # Blend 60% heatmap with 40% original image for context
        blended = cv2.addWeighted(img_rgb, 0.40, heatmap_rgb, 0.60, 0)
        
        return mean_diff, blended

    @staticmethod
    def compute_blur_metrics(img_rgb: np.ndarray) -> float:
        """Compute Laplacian variance of the image (higher = sharper, lower = blurry)."""
        gray = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2GRAY)
        lap = cv2.Laplacian(gray, cv2.CV_64F)
        variance = float(lap.var())
        return variance

    @staticmethod
    def compute_noise_variance(img_rgb: np.ndarray) -> float:
        """Compute high-frequency noise variance by subtracting median filtered image."""
        gray = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2GRAY)
        median = cv2.medianBlur(gray, 3)
        noise = cv2.absdiff(gray, median)
        return float(np.var(noise))

    @staticmethod
    def analyze_photo_borders(img_rgb: np.ndarray, photo_bbox: List[int]) -> float:
        """
        Analyze gradient discontinuities along the outer perimeter boundary of the photo box.
        High abnormal edge spikes along straight cut lines indicate copy-pasting.
        """
        x, y, w, h = photo_bbox
        img_h, img_w = img_rgb.shape[:2]
        
        mask = np.zeros((img_h, img_w), dtype=np.uint8)
        cv2.rectangle(mask, (x, y), (x + w, y + h), 255, thickness=4)
        
        gray = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2GRAY)
        sobelx = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=3)
        sobely = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=3)
        mag = np.sqrt(sobelx**2 + sobely**2)
        
        border_pixels = mag[mask > 0]
        if len(border_pixels) == 0:
            return 0.0
            
        return float(np.mean(border_pixels))

    @classmethod
    def analyze(cls, img_rgb: np.ndarray, zones: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
        """
        Run full computer vision tamper screening.
        Returns:
            - tamper_score (0-100)
            - findings (List[Finding])
            - ela_overlay_base64 (str)
        """
        findings: List[Finding] = []
        tamper_penalty = 0.0

        # 1. Error Level Analysis (ELA)
        overall_mean_ela, ela_overlay = cls.compute_ela(img_rgb)
        ela_overlay_base64 = ImageProcessor.encode_to_base64(ela_overlay)

        # Check ELA difference between photo zone and text zone
        photo_crop = zones["photo"]["crop"]
        text_crop = zones["text"]["crop"]
        
        photo_ela, _ = cls.compute_ela(photo_crop)
        text_ela, _ = cls.compute_ela(text_crop)
        
        ela_disparity = abs(photo_ela - text_ela)
        
        if ela_disparity > 4.5:
            tamper_penalty += 35.0
            findings.append(Finding(
                id="tamper_ela_disparity",
                category="TAMPER",
                title="Photo-Region Compression Disparity",
                description=(f"Error Level Analysis indicates localized compression variance "
                             f"between photo ({photo_ela:.1f}) and text zone ({text_ela:.1f}). "
                             f"This signal frequently appears when a portrait is digitally spliced into a pre-existing template."),
                severity=FindingSeverity.DANGER,
                confidence=min(96.0, 70.0 + ela_disparity * 4.0),
                signal_source="CV_ELA_COMPRESSION_DISPARITY"
            ))
        elif ela_disparity > 2.2:
            tamper_penalty += 18.0
            findings.append(Finding(
                id="tamper_ela_mild_disparity",
                category="TAMPER",
                title="Mild Compression Disparity in Photo Region",
                description=(f"Moderate difference in compression residual levels between portrait and background "
                             f"(delta: {ela_disparity:.1f})."),
                severity=FindingSeverity.WARNING,
                confidence=78.0,
                signal_source="CV_ELA_COMPRESSION_MILD"
            ))
        else:
            findings.append(Finding(
                id="tamper_ela_uniform",
                category="TAMPER",
                title="Uniform Compression Residuals",
                description="Error Level Analysis demonstrates uniform compression behavior across all card quadrants.",
                severity=FindingSeverity.INFO,
                confidence=91.0,
                signal_source="CV_ELA_UNIFORMITY"
            ))

        # 2. Laplacian Blur & Focal Plane Consistency
        overall_blur = cls.compute_blur_metrics(img_rgb)
        photo_blur = cls.compute_blur_metrics(photo_crop)
        text_blur = cls.compute_blur_metrics(text_crop)

        if overall_blur < 45.0:
            tamper_penalty += 20.0
            findings.append(Finding(
                id="tamper_overall_blur",
                category="TAMPER",
                title="Sub-Optimal Capture Sharpness",
                description=f"Overall card sharpness is low (score: {overall_blur:.1f}). May obscure microtext and security guilloche lines.",
                severity=FindingSeverity.WARNING,
                confidence=85.0,
                signal_source="CV_LAPLACIAN_LOW_SHARPNESS"
            ))
        else:
            findings.append(Finding(
                id="tamper_sharpness_pass",
                category="TAMPER",
                title="Adequate Image Sharpness",
                description=f"Document image exhibits adequate optical sharpness (score: {overall_blur:.1f}).",
                severity=FindingSeverity.INFO,
                confidence=92.0,
                signal_source="CV_LAPLACIAN_SHARPNESS_OK"
            ))

        # Focal plane mismatch (e.g. sharp photo on blurry card or vice versa)
        blur_ratio = max(photo_blur, text_blur) / (min(photo_blur, text_blur) + 1e-5)
        if blur_ratio > 8.0 and (photo_blur > 100 or text_blur > 100):
            tamper_penalty += 25.0
            findings.append(Finding(
                id="tamper_focal_mismatch",
                category="TAMPER",
                title="Focal Plane Inconsistency Detected",
                description=(f"Significant sharpness divergence between portrait (sharpness {photo_blur:.1f}) "
                             f"and textual fields (sharpness {text_blur:.1f}). Suggests elements were captured with differing optical depths."),
                severity=FindingSeverity.DANGER,
                confidence=89.0,
                signal_source="CV_FOCAL_PLANE_MISMATCH"
            ))

        # 3. Noise Variance Consistency
        photo_noise = cls.compute_noise_variance(photo_crop)
        text_noise = cls.compute_noise_variance(text_crop)
        noise_ratio = max(photo_noise, text_noise) / (min(photo_noise, text_noise) + 1e-5)

        if noise_ratio > 4.5:
            tamper_penalty += 20.0
            findings.append(Finding(
                id="tamper_noise_disparity",
                category="TAMPER",
                title="High-Frequency Noise Floor Disparity",
                description=f"Localized noise variance shows sensor disparity (ratio: {noise_ratio:.2f}) between regions.",
                severity=FindingSeverity.WARNING,
                confidence=82.0,
                signal_source="CV_NOISE_FLOOR_DISPARITY"
            ))

        # 4. Photo Border Boundary Analysis
        photo_border_gradient = cls.analyze_photo_borders(img_rgb, zones["photo"]["bbox"])
        if photo_border_gradient > 110.0:
            tamper_penalty += 25.0
            findings.append(Finding(
                id="tamper_photo_border_cut",
                category="TAMPER",
                title="Hard Edge Discontinuity at Photo Boundary",
                description=(f"High-intensity edge gradients (gradient {photo_border_gradient:.1f}) detected at photo perimeter. "
                             f"Consistent with physical or digital paste cutlines."),
                severity=FindingSeverity.DANGER,
                confidence=90.0,
                signal_source="CV_PHOTO_BORDER_CUTLINE"
            ))

        tamper_score = float(np.clip(tamper_penalty, 0.0, 100.0))

        return {
            "tamper_score": tamper_score,
            "findings": findings,
            "ela_overlay_base64": ela_overlay_base64,
            "metrics": {
                "overall_ela": overall_mean_ela,
                "ela_disparity": ela_disparity,
                "overall_blur": overall_blur,
                "photo_border_gradient": photo_border_gradient
            }
        }
