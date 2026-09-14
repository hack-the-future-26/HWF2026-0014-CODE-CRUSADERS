from enum import Enum
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field

class RiskLevel(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"

class FindingSeverity(str, Enum):
    INFO = "INFO"
    WARNING = "WARNING"
    DANGER = "DANGER"

class CheckStatus(str, Enum):
    PASS = "PASS"
    WARNING = "WARNING"
    FAIL = "FAIL"

class BoundingBox(BaseModel):
    x: int
    y: int
    width: int
    height: int

class ExtractedField(BaseModel):
    field_name: str
    value: str
    confidence: float = Field(ge=0.0, le=100.0)
    bounding_box: Optional[BoundingBox] = None
    is_validated: bool = True

class Finding(BaseModel):
    id: str
    category: str  # TAMPER, STRUCTURE, OCR, CONSISTENCY
    title: str
    description: str
    severity: FindingSeverity
    confidence: float = Field(ge=0.0, le=100.0)
    signal_source: str

class ConsistencyCheck(BaseModel):
    check_name: str
    status: CheckStatus
    details: str

class ProcessingSummary(BaseModel):
    processing_time_ms: int
    image_resolution: str
    signals_evaluated: int
    ocr_engine: str

class CategoryScores(BaseModel):
    tamper_score: float = Field(ge=0.0, le=100.0)
    structure_score: float = Field(ge=0.0, le=100.0)
    consistency_score: float = Field(ge=0.0, le=100.0)
    ocr_score: float = Field(ge=0.0, le=100.0)

class AnomalyOverlays(BaseModel):
    ela_overlay_base64: Optional[str] = None
    zones_overlay_base64: Optional[str] = None

class AnalyzeResponse(BaseModel):
    risk_score: float = Field(ge=0.0, le=100.0)
    risk_level: RiskLevel
    recommendation: str
    category_scores: CategoryScores
    extracted_fields: List[ExtractedField]
    findings: List[Finding]
    consistency_checks: List[ConsistencyCheck]
    processing_summary: ProcessingSummary
    anomaly_overlays: Optional[AnomalyOverlays] = None
    processed_preview_base64: Optional[str] = None

class SampleDocument(BaseModel):
    sample_id: str
    name: str
    category: str
    description: str
    expected_risk: RiskLevel
    image_data_url: str

class HistoryItem(BaseModel):
    id: str
    timestamp: str
    risk_score: float
    risk_level: str
    document_type: str
    summary_findings: str
    recommendation: str

class AnalyzeRequest(BaseModel):
    image_base64: Optional[str] = None

class DocumentQualityMetrics(BaseModel):
    blur_score: float = 0.0
    is_blurry: bool = False
    brightness: float = 0.0
    is_too_dark: bool = False
    is_too_bright: bool = False
    glare_percentage: float = 0.0
    glare_detected: bool = False
    coverage_percentage: float = 0.0
    is_too_far: bool = False
    is_too_close: bool = False
    is_partially_out: bool = False
    aspect_ratio: float = 1.586
    quality_status: str = "SEARCHING"
    quality_message: str = "Searching for document..."

class ScanDetectRequest(BaseModel):
    image_base64: str

class ScanDetectResponse(BaseModel):
    detected: bool
    confidence: float
    corners: List[List[int]]
    image_width: int
    image_height: int
    quality: Optional[DocumentQualityMetrics] = None

class ScanWarpRequest(BaseModel):
    image_base64: str
    corners: List[List[float]]

class ScanWarpResponse(BaseModel):
    warped_image_base64: str
    width: int
    height: int

