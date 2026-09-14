import os
from pathlib import Path
from pydantic import BaseModel

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)

class Settings(BaseModel):
    app_name: str = "IDShield AI"
    app_version: str = "1.0.0"
    debug: bool = True
    
    # Database
    database_url: str = f"sqlite:///{DATA_DIR / 'idshield.db'}"
    
    # Scoring weights (sum to 1.0)
    weight_tamper: float = 0.35
    weight_structure: float = 0.25
    weight_consistency: float = 0.25
    weight_ocr: float = 0.15
    
    # Risk score thresholds (0-100)
    threshold_low: float = 35.0
    threshold_medium: float = 70.0
    
    # ISO/IEC 7810 ID-1 standard card aspect ratio
    iso_id1_aspect_ratio: float = 1.58577  # 85.60 mm / 53.98 mm
    aspect_ratio_tolerance: float = 0.15

settings = Settings()
