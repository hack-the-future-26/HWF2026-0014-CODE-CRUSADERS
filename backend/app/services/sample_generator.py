import io
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from typing import Dict, Any, List
from backend.app.models.schemas import SampleDocument, RiskLevel

class SampleGenerator:
    @staticmethod
    def _draw_guilloche(draw: ImageDraw.ImageDraw, width: int, height: int):
        """Draw decorative security wave lines simulating security paper."""
        for i in range(12):
            y_offset = 120 + i * 24
            points = []
            for x in range(0, width, 10):
                y = y_offset + int(12 * math.sin(x * 0.035 + i * 0.5))
                points.append((x, y))
            draw.line(points, fill=(215, 235, 250), width=1)

    @staticmethod
    def _draw_synthetic_portrait(draw: ImageDraw.ImageDraw, x: int, y: int, w: int, h: int, tamper: bool = False):
        """Draw a synthetic stylized portrait vector silhouette to avoid real human PII."""
        # Background of photo
        bg_color = (220, 230, 242) if not tamper else (240, 205, 205)
        draw.rectangle([x, y, x + w, y + h], fill=bg_color, outline=(120, 150, 180), width=2)
        
        cx = x + w // 2
        cy = y + h // 2
        
        # Head
        head_r = int(w * 0.22)
        head_cy = y + int(h * 0.38)
        head_color = (130, 160, 190) if not tamper else (180, 110, 110)
        draw.ellipse([cx - head_r, head_cy - head_r, cx + head_r, head_cy + head_r], fill=head_color)
        
        # Shoulders/torso
        torso_y = head_cy + head_r + 4
        torso_w = int(w * 0.38)
        draw.polygon([
            (cx - torso_w, y + h - 2),
            (cx - head_r, torso_y),
            (cx + head_r, torso_y),
            (cx + torso_w, y + h - 2)
        ], fill=(90, 120, 150) if not tamper else (140, 80, 80))
        
        # Watermark on photo
        draw.text((x + 8, y + h - 22), "SYNTHETIC AVATAR", fill=(80, 100, 120))

    @classmethod
    def generate_sample(
        cls,
        sample_id: str,
        name: str,
        id_num: str,
        dob: str,
        issue_date: str,
        expiry_date: str,
        tamper_photo: bool = False,
        blur_level: float = 0.0,
        expected_risk: RiskLevel = RiskLevel.LOW,
        desc: str = ""
    ) -> Dict[str, Any]:
        """Generate a complete high-definition synthetic sample ID card."""
        W, H = 860, 540  # Close to ISO-1 standard aspect ratio (~1.59)
        img = Image.new("RGB", (W, H), color=(250, 253, 255))
        draw = ImageDraw.Draw(img)

        # Card outer border with rounded simulated edge
        draw.rectangle([4, 4, W - 5, H - 5], outline=(186, 215, 238), width=3)
        draw.rectangle([10, 10, W - 11, H - 11], outline=(224, 242, 254), width=2)

        # Security guilloche pattern
        cls._draw_guilloche(draw, W, H)

        # Top Banner: Header
        draw.rectangle([10, 10, W - 11, 85], fill=(2, 132, 199))  # Sky/Cyan blue 600
        draw.text((30, 22), "IDSHIELD SYNTHETIC TEST SPECIMEN", fill=(255, 255, 255))
        draw.text((30, 48), "STANDARDIZED NON-GOVERNMENT DEMO CREDENTIAL - ISO/IEC 7810 ID-1", fill=(186, 230, 253))

        # Prominent Watermark Notice
        draw.text((W - 310, 32), "[DEMO SPECIMEN ONLY]", fill=(254, 240, 138))

        # Photo Box (Left flank)
        photo_x, photo_y, photo_w, photo_h = 45, 115, 230, 290
        cls._draw_synthetic_portrait(draw, photo_x, photo_y, photo_w, photo_h, tamper=tamper_photo)

        # Demographic Fields (Right flank)
        text_x = 320
        fields = [
            ("FULL NAME", name, (photo_y + 10)),
            ("DOCUMENT NO.", id_num, (photo_y + 65)),
            ("DATE OF BIRTH", dob, (photo_y + 120)),
            ("ISSUE DATE", issue_date, (photo_y + 175)),
            ("EXPIRY DATE", expiry_date, (photo_y + 230)),
        ]

        for label, val, y_pos in fields:
            draw.text((text_x, y_pos), label, fill=(100, 116, 139))  # Slate 500
            draw.text((text_x, y_pos + 18), val, fill=(15, 23, 42))   # Slate 900
            # Underline line
            draw.line([(text_x, y_pos + 42), (W - 50, y_pos + 42)], fill=(241, 245, 249), width=1)

        # Bottom MRZ / Machine-Readable Zone Strip
        draw.rectangle([10, H - 90, W - 11, H - 11], fill=(241, 245, 249))
        draw.line([(10, H - 90), (W - 11, H - 90)], fill=(203, 213, 225), width=2)
        
        # Clean synthetic MRZ lines
        clean_name = name.replace(" ", "<<").upper().ljust(30, '<')
        mrz_line1 = f"I<SPEC{clean_name[:24]}"
        mrz_line2 = f"{id_num.replace('-', '')}8SPEC9406154M3104107<<<<<<<<<<<2"
        draw.text((30, H - 75), mrz_line1, fill=(51, 65, 85))
        draw.text((30, H - 48), mrz_line2, fill=(51, 65, 85))

        # If tamper_photo is true, inject artificial localized noise and harsh border cutline
        if tamper_photo:
            # Crop photo area, degrade with distinct high-compression JPEG artifact
            photo_box = (photo_x, photo_y, photo_x + photo_w, photo_y + photo_h)
            photo_patch = img.crop(photo_box)
            
            # Re-compress patch with low quality
            buf = io.BytesIO()
            photo_patch.save(buf, 'JPEG', quality=25)
            buf.seek(0)
            spliced_patch = Image.open(buf).convert('RGB')

            # Inject localized sensor noise variance characteristic of a secondary camera source
            patch_arr = np.array(spliced_patch, dtype=np.int16)
            noise = np.random.RandomState(42).randint(-22, 23, patch_arr.shape, dtype=np.int16)
            noisy_arr = np.clip(patch_arr + noise, 0, 255).astype(np.uint8)
            spliced_patch = Image.fromarray(noisy_arr)
            img.paste(spliced_patch, (photo_x, photo_y))
            
            # Redraw harsh unnatural border cutline on fresh image canvas
            tamper_draw = ImageDraw.Draw(img)
            tamper_draw.rectangle([photo_x - 1, photo_y - 1, photo_x + photo_w + 1, photo_y + photo_h + 1],
                                  outline=(220, 38, 38), width=3)

        # If blur is specified, apply Gaussian blur
        if blur_level > 0.0:
            img = img.filter(ImageFilter.GaussianBlur(radius=blur_level))

        # Encode to base64 data URL
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        b64_str = buf.getvalue()
        import base64
        data_url = f"data:image/png;base64,{base64.b64encode(b64_str).decode('utf-8')}"

        return {
            "sample_id": sample_id,
            "name": f"Specimen: {name}",
            "category": "Synthetic Demo",
            "description": desc,
            "expected_risk": expected_risk,
            "image_data_url": data_url,
            "metadata_hint": {
                "fields": [
                    {"name": "Full Name", "value": name, "confidence": 98.2, "bbox": [text_x, photo_y + 10, 300, 35]},
                    {"name": "ID Number", "value": id_num, "confidence": 98.9, "bbox": [text_x, photo_y + 65, 250, 35]},
                    {"name": "Date of Birth", "value": dob, "confidence": 97.4, "bbox": [text_x, photo_y + 120, 200, 35]},
                    {"name": "Issue Date", "value": issue_date, "confidence": 96.8, "bbox": [text_x, photo_y + 175, 200, 35]},
                    {"name": "Expiry Date", "value": expiry_date, "confidence": 96.8, "bbox": [text_x, photo_y + 230, 200, 35]},
                ]
            }
        }

    @classmethod
    def get_all_samples(cls) -> List[Dict[str, Any]]:
        """Returns all 4 pre-configured synthetic specimen cards."""
        return [
            cls.generate_sample(
                sample_id="clean_valid",
                name="ALEX MORGAN CHEN",
                id_num="SPEC-8921-2034",
                dob="1994-06-15",
                issue_date="2021-04-10",
                expiry_date="2031-04-10",
                tamper_photo=False,
                expected_risk=RiskLevel.LOW,
                desc="Valid synthetic specimen with consistent fonts, aligned portrait, valid chronological dates, and uniform ELA residuals."
            ),
            cls.generate_sample(
                sample_id="tampered_photo",
                name="JORDAN TAYLOR REED",
                id_num="SPEC-4491-8832",
                dob="1991-03-22",
                issue_date="2020-08-15",
                expiry_date="2030-08-15",
                tamper_photo=True,
                expected_risk=RiskLevel.HIGH,
                desc="Spliced portrait specimen: photo box contains distinct JPEG compression disparity and sharp perimeter cutline edge gradients."
            ),
            cls.generate_sample(
                sample_id="inconsistent_dates",
                name="MORGAN D. BLAKE",
                id_num="SPEC-1029-7744",
                dob="2028-11-12",  # Future DOB
                issue_date="2025-10-01",
                expiry_date="2021-05-15",  # Inverted dates (Issue > Expiry)
                tamper_photo=False,
                expected_risk=RiskLevel.HIGH,
                desc="Chronological anomaly specimen: issue date (2025) is after expiry date (2021) and date of birth is in the future."
            ),
            cls.generate_sample(
                sample_id="blurry_capture",
                name="SAMANTHA A. CRUZ",
                id_num="SPEC-6632-1109",
                dob="1988-12-04",
                issue_date="2019-02-18",
                expiry_date="2029-02-18",
                tamper_photo=False,
                blur_level=2.8,
                expected_risk=RiskLevel.MEDIUM,
                desc="Low optical sharpness specimen: simulated camera motion blur obscuring micro-text and edge contours."
            )
        ]
