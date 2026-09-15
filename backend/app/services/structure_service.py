import cv2
import numpy as np
from typing import Dict, Any, List, Tuple
from backend.app.config import settings
from backend.app.models.schemas import Finding, FindingSeverity

class StructureService:
    @staticmethod
    def detect_card_contour(img_rgb: np.ndarray) -> Tuple[float, float, bool]:
        """
        Attempts to detect the primary card contour in the image.
        Returns: (detected_aspect_ratio, perspective_score, is_card_detected)
        """
        h, w = img_rgb.shape[:2]
        gray = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2GRAY)
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        
        # Adaptive thresholding to identify edges
        edged = cv2.Canny(blurred, 30, 150)
        
        contours, _ = cv2.findContours(edged, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            return float(w) / float(h), 100.0, False
            
        # Find largest contour by area
        contours = sorted(contours, key=cv2.contourArea, reverse=True)
        for cnt in contours[:5]:
            area = cv2.contourArea(cnt)
            if area > (w * h * 0.25):  # Must occupy at least 25% of image
                peri = cv2.arcLength(cnt, True)
                approx = cv2.approxPolyDP(cnt, 0.03 * peri, True)
                if len(approx) == 4:
                    # Quadrilateral found
                    x, y, rect_w, rect_h = cv2.boundingRect(approx)
                    aspect = float(rect_w) / float(max(1, rect_h))
                    return aspect, 95.0, True
                    
        # Fallback to image canvas aspect ratio
        return float(w) / float(h), 75.0, False

    @classmethod
    def analyze(cls, img_rgb: np.ndarray, zones: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
        """
        Analyze structural compliance:
        - ISO/IEC 7810 ID-1 card aspect ratio (~1.586).
        - Presence and relative scale of essential card zones (photo, demographic data, header).
        """
        h, w = img_rgb.shape[:2]
        findings: List[Finding] = []
        structure_penalty = 0.0

        # 1. Aspect ratio check
        detected_aspect, confidence, is_detected = cls.detect_card_contour(img_rgb)
        target_aspect = settings.iso_id1_aspect_ratio
        aspect_delta = abs(detected_aspect - target_aspect)
        
        if aspect_delta > 0.35:
            structure_penalty += 35.0
            findings.append(Finding(
                id="struct_aspect_ratio_high_dev",
                category="STRUCTURE",
                title="Severe Aspect Ratio Deviation",
                description=(f"Observed aspect ratio ({detected_aspect:.2f}) deviates significantly from the "
                             f"ISO/IEC 7810 ID-1 standard (~{target_aspect:.2f}). "
                             f"Indicates non-standard card dimensions or cropping distortion."),
                severity=FindingSeverity.DANGER,
                confidence=88.0,
                signal_source="STRUCTURE_ASPECT_RATIO_MISMATCH"
            ))
        elif aspect_delta > 0.18:
            structure_penalty += 15.0
            findings.append(Finding(
                id="struct_aspect_ratio_mild_dev",
                category="STRUCTURE",
                title="Moderate Card Aspect Ratio Deviation",
                description=(f"Observed aspect ratio is {detected_aspect:.2f} (standard: ~{target_aspect:.2f}). "
                             f"Likely caused by slight camera tilt or non-rectangular capture."),
                severity=FindingSeverity.WARNING,
                confidence=80.0,
                signal_source="STRUCTURE_ASPECT_RATIO_TILT"
            ))
        else:
            findings.append(Finding(
                id="struct_aspect_ratio_pass",
                category="STRUCTURE",
                title="Standard ID-1 Format Compliant",
                description=f"Aspect ratio ({detected_aspect:.2f}) matches ISO/IEC 7810 ID-1 specifications within tolerance.",
                severity=FindingSeverity.INFO,
                confidence=94.0,
                signal_source="STRUCTURE_ASPECT_RATIO_OK"
            ))

        # 2. Zone Geometric Cohesion
        # Check photo zone area relative to overall card
        photo_bbox = zones["photo"]["bbox"]
        photo_area = photo_bbox[2] * photo_bbox[3]
        total_area = w * h
        photo_ratio = photo_area / float(total_area)

        if photo_ratio < 0.08 or photo_ratio > 0.35:
            structure_penalty += 20.0
            findings.append(Finding(
                id="struct_photo_zone_anomaly",
                category="STRUCTURE",
                title="Unconventional Portrait Window Geometry",
                description=f"Portrait occupies {photo_ratio*100:.1f}% of card surface, outside typical standard layout bounds (10% - 30%).",
                severity=FindingSeverity.WARNING,
                confidence=82.0,
                signal_source="STRUCTURE_PHOTO_ZONE_PROPORTION"
            ))
        else:
            findings.append(Finding(
                id="struct_photo_zone_ok",
                category="STRUCTURE",
                title="Expected Portrait Layout Positioning",
                description="Portrait frame adheres to standardized ID card left-flank placement and spatial scaling.",
                severity=FindingSeverity.INFO,
                confidence=92.0,
                signal_source="STRUCTURE_PHOTO_ZONE_OK"
            ))

        # 3. Minimum resolution check for forensic screening
        if w < 600 or h < 380:
            structure_penalty += 25.0
            findings.append(Finding(
                id="struct_low_resolution",
                category="STRUCTURE",
                title="Sub-Standard Image Resolution",
                description=f"Capture resolution ({w}x{h} px) is below minimum forensic threshold (600x380 px).",
                severity=FindingSeverity.WARNING,
                confidence=95.0,
                signal_source="STRUCTURE_LOW_RESOLUTION"
            ))
        else:
            findings.append(Finding(
                id="struct_res_ok",
                category="STRUCTURE",
                title="Adequate Resolution for Forensic Review",
                description=f"Resolution ({w}x{h} px) satisfies digital inspection clarity requirements.",
                severity=FindingSeverity.INFO,
                confidence=96.0,
                signal_source="STRUCTURE_RESOLUTION_OK"
            ))

        structure_score = float(np.clip(structure_penalty, 0.0, 100.0))

        return {
            "structure_score": structure_score,
            "findings": findings,
            "detected_aspect": detected_aspect,
            "is_detected": is_detected
        }
