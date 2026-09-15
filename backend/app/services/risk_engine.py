from typing import Dict, Any, List
import numpy as np
from backend.app.config import settings
from backend.app.models.schemas import (
    RiskLevel, Finding, FindingSeverity, CategoryScores, AnalyzeResponse,
    ExtractedField, ConsistencyCheck, ProcessingSummary, AnomalyOverlays
)

class RiskEngine:
    @classmethod
    def evaluate(
        cls,
        tamper_data: Dict[str, Any],
        structure_data: Dict[str, Any],
        ocr_data: Dict[str, Any],
        consistency_data: Dict[str, Any],
        image_shape: tuple,
        processing_time_ms: int,
        processed_preview_base64: str = None
    ) -> AnalyzeResponse:
        """
        Synthesizes multi-domain signals into a unified risk assessment.
        """
        tamper_score = tamper_data.get("tamper_score", 0.0)
        structure_score = structure_data.get("structure_score", 0.0)
        consistency_score = consistency_data.get("consistency_score", 0.0)
        ocr_score = ocr_data.get("ocr_score", 0.0)

        # Multi-signal weighted calculation
        raw_score = (
            tamper_score * settings.weight_tamper +
            structure_score * settings.weight_structure +
            consistency_score * settings.weight_consistency +
            ocr_score * settings.weight_ocr
        )

        # Collect all findings
        all_findings: List[Finding] = (
            tamper_data.get("findings", []) +
            structure_data.get("findings", []) +
            consistency_data.get("findings", []) +
            ocr_data.get("findings", [])
        )

        # Check for critical danger triggers that mandate high risk
        danger_count = sum(1 for f in all_findings if f.severity == FindingSeverity.DANGER)
        warning_count = sum(1 for f in all_findings if f.severity == FindingSeverity.WARNING)

        if danger_count >= 1:
            # At least one severe anomaly (e.g. date inversion, hard photo cutline)
            raw_score = max(raw_score, 72.0 + min(25.0, danger_count * 10.0))
        elif warning_count >= 2:
            raw_score = max(raw_score, 45.0 + min(20.0, warning_count * 6.0))

        risk_score = float(np.clip(round(raw_score, 1), 0.0, 100.0))

        # Classify risk level
        if risk_score <= settings.threshold_low:
            risk_level = RiskLevel.LOW
            recommendation = (
                "PASS - Standard Automated Screening Satisfied. "
                "Document exhibits uniform compression, valid layout geometry, and sound field chronology. "
                "No manual intervention required."
            )
        elif risk_score <= settings.threshold_medium:
            risk_level = RiskLevel.MEDIUM
            recommendation = (
                "ESCALATE FOR SECONDARY MANUAL REVIEW. "
                "Moderate variances detected in capture quality, layout margins, or demographic token consistency. "
                "Reviewer should inspect original credential or request re-capture."
            )
        else:
            risk_level = RiskLevel.HIGH
            recommendation = (
                "HIGH RISK ANOMALY DETECTED - REJECT OR LEVEL-3 AUDIT. "
                "Critical signals detected such as localized photo compression disparity, cutline boundaries, "
                "or logical date contradictions. Automated processing should halt."
            )

        # Sort findings: DANGER first, then WARNING, then INFO
        severity_order = {
            FindingSeverity.DANGER: 0,
            FindingSeverity.WARNING: 1,
            FindingSeverity.INFO: 2
        }
        sorted_findings = sorted(all_findings, key=lambda f: severity_order.get(f.severity, 3))

        fields: List[ExtractedField] = ocr_data.get("fields", [])
        checks: List[ConsistencyCheck] = consistency_data.get("checks", [])

        h, w = image_shape[:2]
        res_str = f"{w}x{h}"

        return AnalyzeResponse(
            risk_score=risk_score,
            risk_level=risk_level,
            recommendation=recommendation,
            category_scores=CategoryScores(
                tamper_score=round(tamper_score, 1),
                structure_score=round(structure_score, 1),
                consistency_score=round(consistency_score, 1),
                ocr_score=round(ocr_score, 1)
            ),
            extracted_fields=fields,
            findings=sorted_findings,
            consistency_checks=checks,
            processing_summary=ProcessingSummary(
                processing_time_ms=processing_time_ms,
                image_resolution=res_str,
                signals_evaluated=len(all_findings) + len(checks),
                ocr_engine=ocr_data.get("engine_used", "IDShield-AdaptiveOCR")
            ),
            anomaly_overlays=AnomalyOverlays(
                ela_overlay_base64=tamper_data.get("ela_overlay_base64"),
                zones_overlay_base64=tamper_data.get("zones_overlay_base64")
            ),
            processed_preview_base64=processed_preview_base64
        )
