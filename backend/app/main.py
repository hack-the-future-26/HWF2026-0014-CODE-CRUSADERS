import time
import uuid
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from backend.app.config import settings
from backend.app.database.connection import init_db, get_db
from backend.app.database.models import AuditLog
from backend.app.models.schemas import (
    AnalyzeResponse, SampleDocument, HistoryItem, AnalyzeRequest,
    ScanDetectRequest, ScanDetectResponse, ScanWarpRequest, ScanWarpResponse
)
from backend.app.services.image_processor import ImageProcessor
from backend.app.services.cv_tamper_service import CVTamperService
from backend.app.services.structure_service import StructureService
from backend.app.services.ocr_service import OCRService
from backend.app.services.consistency_service import ConsistencyService
from backend.app.services.risk_engine import RiskEngine
from backend.app.services.sample_generator import SampleGenerator

# Initialize database tables
init_db()

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Explainable AI-Assisted Identity Document Risk Screening API"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health", summary="Health Check")
def health_check(db: Session = Depends(get_db)):
    """Health check reporting backend uptime and database connectivity."""
    db_ok = True
    try:
        db.query(AuditLog).first()
    except Exception:
        db_ok = False

    return {
        "status": "healthy" if db_ok else "degraded",
        "app": settings.app_name,
        "version": settings.app_version,
        "database": "connected" if db_ok else "unavailable",
        "disclaimer": "Hackathon Prototype - Non-Government Screening Tool"
    }

@app.get("/api/samples", response_model=List[SampleDocument], summary="Get Synthetic Specimen Presets")
def get_synthetic_samples():
    """Retrieve pre-bundled synthetic specimen test cards for zero-risk demonstration."""
    raw_samples = SampleGenerator.get_all_samples()
    results = []
    for s in raw_samples:
        results.append(SampleDocument(
            sample_id=s["sample_id"],
            name=s["name"],
            category=s["category"],
            description=s["description"],
            expected_risk=s["expected_risk"],
            image_data_url=s["image_data_url"]
        ))
    return results

@app.get("/api/history", response_model=List[HistoryItem], summary="Get Audit Screening History")
def get_audit_history(limit: int = 15, db: Session = Depends(get_db)):
    """Retrieve recent screening sessions from local SQLite database."""
    logs = db.query(AuditLog).order_by(AuditLog.timestamp.desc()).limit(limit).all()
    items = []
    for log in logs:
        items.append(HistoryItem(
            id=log.id,
            timestamp=log.timestamp.strftime("%Y-%m-%d %H:%M:%S"),
            risk_score=log.risk_score,
            risk_level=log.risk_level,
            document_type=log.document_type,
            summary_findings=log.summary_findings,
            recommendation=log.recommendation
        ))
    return items

@app.delete("/api/history", summary="Clear Audit Logs")
def clear_audit_history(db: Session = Depends(get_db)):
    """Clear screening history."""
    db.query(AuditLog).delete()
    db.commit()
    return {"message": "Audit history cleared successfully."}

@app.post("/api/analyze", response_model=AnalyzeResponse, summary="Analyze Document for Risk Signals")
async def analyze_document(
    file: Optional[UploadFile] = File(None),
    image_base64: Optional[str] = Form(None),
    sample_id: Optional[str] = Form(None),
    db: Session = Depends(get_db)
):
    """
    Core document screening pipeline:
    1. Decode & normalize image
    2. Segment card zones (photo, demographic text, header, MRZ)
    3. Computer vision tamper detection (ELA, Laplacian blur, noise variance, cutlines)
    4. Structural compliance check (ISO/IEC 7810 ID-1 aspect ratio, zone geometry)
    5. Multi-engine OCR field extraction
    6. Cross-field logical consistency verification
    7. Multi-signal risk fusion & explainable report formulation
    """
    start_time = time.time()
    img_rgb = None
    metadata_hint = None
    source_mode = "Unknown"

    # Handle input modes: uploaded file, base64 payload, or synthetic sample_id
    if sample_id:
        source_mode = f"Synthetic Specimen Demo ({sample_id})"
        samples = SampleGenerator.get_all_samples()
        matching = next((s for s in samples if s["sample_id"] == sample_id), None)
        if not matching:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Synthetic sample '{sample_id}' not found."
            )
        img_rgb = ImageProcessor.decode_base64(matching["image_data_url"])
        metadata_hint = matching.get("metadata_hint")
    elif file:
        source_mode = f"Uploaded File ({file.filename})"
        if not file.content_type or not file.content_type.startswith("image/"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported file type '{file.content_type}'. Please upload a standard image (PNG, JPG, WEBP)."
            )
        contents = await file.read()
        if len(contents) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Uploaded file is empty (0 bytes)."
            )
        try:
            img_rgb = ImageProcessor.decode_image(contents)
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Image decoding failed: {str(e)}"
            )
    elif image_base64:
        source_mode = "Captured Image / Base64"
        try:
            img_rgb = ImageProcessor.decode_base64(image_base64)
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Base64 image decoding failed: {str(e)}"
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No document provided. Supply either an uploaded file, 'image_base64', or 'sample_id'."
        )

    print(f"[Analyze API] Processing request: mode={source_mode}, image_shape={img_rgb.shape if img_rgb is not None else None}")

    if img_rgb is None or img_rgb.size == 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid image dimensions."
        )

    # 1. Functional zone segmentation
    zones = ImageProcessor.get_document_zones(img_rgb)
    zones_overlay_base64 = ImageProcessor.create_zone_overlay(img_rgb, zones)

    # 2. Computer Vision Tamper Analysis
    tamper_data = CVTamperService.analyze(img_rgb, zones)
    tamper_data["zones_overlay_base64"] = zones_overlay_base64

    # 3. Structural & Layout Verification
    structure_data = StructureService.analyze(img_rgb, zones)

    # 4. OCR Field Parsing
    ocr_data = OCRService.parse_document_fields(img_rgb, metadata_hint=metadata_hint)

    # 5. Cross-field Logical Consistency
    consistency_data = ConsistencyService.analyze(ocr_data.get("fields", []))

    # Total processing duration
    processing_time_ms = int((time.time() - start_time) * 1000)

    # 6. Risk Engine Evaluation
    preview_base64 = ImageProcessor.encode_to_base64(img_rgb)
    response = RiskEngine.evaluate(
        tamper_data=tamper_data,
        structure_data=structure_data,
        ocr_data=ocr_data,
        consistency_data=consistency_data,
        image_shape=img_rgb.shape,
        processing_time_ms=processing_time_ms,
        processed_preview_base64=preview_base64
    )

    print(f"[STAGE 3: API JSON Response] Mode='{source_mode}', Risk={response.risk_score} ({response.risk_level.value})")
    print(f"[STAGE 3: API JSON Response] Extracted Fields: {[(f.field_name, f.value, f'{f.confidence:.1f}%') for f in response.extracted_fields]}")

    # 7. Record Anonymous Audit Log in SQLite (Privacy mandate: raw image is NOT stored)
    try:
        primary_finding = response.findings[0].title if response.findings else "Screening Completed"
        audit = AuditLog(
            id=str(uuid.uuid4()),
            risk_score=response.risk_score,
            risk_level=response.risk_level.value,
            document_type="Synthetic Specimen Demo" if sample_id else ("Uploaded File" if file else "Camera/Gallery Image"),
            summary_findings=primary_finding,
            recommendation=response.recommendation
        )
        db.add(audit)
        db.commit()
    except Exception as e:
        print(f"Warning: Failed to save audit log: {e}")

    return response

@app.post("/api/scan/detect-document", response_model=ScanDetectResponse, summary="Detect Document Contour Corners")
def detect_document(payload: ScanDetectRequest):
    """Detect quadrilateral document corners for interactive scanning & cropping."""
    try:
        img_rgb = ImageProcessor.decode_base64(payload.image_base64)
        result = ImageProcessor.detect_document_corners(img_rgb)
        return ScanDetectResponse(
            detected=result["detected"],
            confidence=result["confidence"],
            corners=result["corners"],
            image_width=result["image_width"],
            image_height=result["image_height"],
            quality=result.get("quality")
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Document corner detection failed: {str(e)}"
        )

@app.post("/api/scan/warp-document", response_model=ScanWarpResponse, summary="Perspective Transform & Crop Document")
def warp_document(payload: ScanWarpRequest):
    """Apply perspective warp on user-selected or auto-detected corners."""
    try:
        img_rgb = ImageProcessor.decode_base64(payload.image_base64)
        warped_rgb = ImageProcessor.warp_perspective(img_rgb, payload.corners)
        warped_b64 = ImageProcessor.encode_to_base64(warped_rgb, format="JPEG")
        h, w = warped_rgb.shape[:2]
        return ScanWarpResponse(
            warped_image_base64=warped_b64,
            width=w,
            height=h
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Perspective warp failed: {str(e)}"
        )

