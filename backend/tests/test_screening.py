import pytest
import io
import numpy as np
from PIL import Image
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.services.sample_generator import SampleGenerator

client = TestClient(app)

def test_health_check():
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] in ["healthy", "degraded"]
    assert "IDShield AI" in data["app"]

def test_get_synthetic_samples():
    response = client.get("/api/samples")
    assert response.status_code == 200
    samples = response.json()
    assert len(samples) >= 4
    sample_ids = [s["sample_id"] for s in samples]
    assert "clean_valid" in sample_ids
    assert "tampered_photo" in sample_ids
    assert "inconsistent_dates" in sample_ids

# ---------------------------------------------------------------------------
# Test Case A: Explicit demo specimen -> demo fields appear.
# ---------------------------------------------------------------------------
def test_testcase_a_explicit_demo_specimen():
    response = client.post("/api/analyze", data={"sample_id": "clean_valid"})
    assert response.status_code == 200
    result = response.json()
    assert result["risk_level"] == "LOW"
    field_map = {f["field_name"]: f["value"] for f in result["extracted_fields"]}
    assert "ALEX MORGAN" in field_map["Full Name"]
    assert "SPEC-8921-2034" in field_map["ID Number"]
    assert "1994-06-15" in field_map["Date of Birth"]

# ---------------------------------------------------------------------------
# Test Case B: New synthetic document with different name/ID/DOB
# Uploaded as a file/base64 (NOT using sample_id)
# Extracted fields MUST come from OCR of the current document.
# ---------------------------------------------------------------------------
def test_testcase_b_custom_uploaded_document_matching_ocr():
    custom_doc = SampleGenerator.generate_sample(
        sample_id="custom_eleanor",
        name="ELEANOR VANCE",
        id_num="SPEC-9988-7711",
        dob="1985-11-20",
        issue_date="2018-05-12",
        expiry_date="2028-05-12"
    )
    # Post as image_base64 (live upload simulation)
    response = client.post("/api/analyze", data={"image_base64": custom_doc["image_data_url"]})
    assert response.status_code == 200
    result = response.json()
    field_map = {f["field_name"]: f["value"] for f in result["extracted_fields"]}

    # Extracted fields MUST match the uploaded document, NEVER default demo values
    assert "ALEX MORGAN" not in field_map["Full Name"]
    assert "ELEANOR" in field_map["Full Name"].upper()
    assert "VANCE" in field_map["Full Name"].upper()
    assert field_map["ID Number"] == "SPEC-9988-7711"
    assert field_map["Date of Birth"] == "1985-11-20"
    assert field_map["Issue Date"] == "2018-05-12"
    assert field_map["Expiry Date"] == "2028-05-12"

# ---------------------------------------------------------------------------
# Test Case C: OCR cannot read a field -> show "Not detected", NEVER demo data.
# ---------------------------------------------------------------------------
def test_testcase_c_blank_image_shows_not_detected():
    # Create an image with no text (e.g. solid neutral color)
    blank_img = Image.new("RGB", (860, 540), color=(235, 240, 245))
    buf = io.BytesIO()
    blank_img.save(buf, format="PNG")
    buf.seek(0)

    response = client.post(
        "/api/analyze",
        files={"file": ("blank_doc.png", buf.getvalue(), "image/png")}
    )
    assert response.status_code == 200
    result = response.json()
    field_map = {f["field_name"]: f["value"] for f in result["extracted_fields"]}

    # All fields must be "Not detected"
    for field_name, value in field_map.items():
        assert value in ["Not detected", "Low OCR confidence"], f"Field {field_name} had unexpected value: {value}"
        assert "ALEX MORGAN" not in value
        assert "SPEC-8921" not in value

# ---------------------------------------------------------------------------
# Test Case D: Upload two different documents sequentially
# Second result must completely replace the first result.
# ---------------------------------------------------------------------------
def test_testcase_d_sequential_different_documents():
    doc1 = SampleGenerator.generate_sample(
        sample_id="seq1",
        name="SARAH CONNOR",
        id_num="SPEC-3344-5566",
        dob="1975-02-28",
        issue_date="2016-01-10",
        expiry_date="2026-01-10"
    )
    doc2 = SampleGenerator.generate_sample(
        sample_id="seq2",
        name="JOHN CONNOR",
        id_num="SPEC-7788-9900",
        dob="1992-08-15",
        issue_date="2019-03-22",
        expiry_date="2029-03-22"
    )

    # First request: Sarah Connor
    res1 = client.post("/api/analyze", data={"image_base64": doc1["image_data_url"]})
    assert res1.status_code == 200
    fields1 = {f["field_name"]: f["value"] for f in res1.json()["extracted_fields"]}
    assert "SARAH" in fields1["Full Name"].upper()
    assert fields1["ID Number"] == "SPEC-3344-5566"

    # Second request: John Connor
    res2 = client.post("/api/analyze", data={"image_base64": doc2["image_data_url"]})
    assert res2.status_code == 200
    fields2 = {f["field_name"]: f["value"] for f in res2.json()["extracted_fields"]}
    assert "JOHN" in fields2["Full Name"].upper()
    assert "SARAH" not in fields2["Full Name"].upper()
    assert fields2["ID Number"] == "SPEC-7788-9900"
    assert fields2["Date of Birth"] == "1992-08-15"

# ---------------------------------------------------------------------------
# Test Case E: Camera capture upload via multipart File
# ---------------------------------------------------------------------------
def test_testcase_e_multipart_camera_capture():
    camera_doc = SampleGenerator.generate_sample(
        sample_id="camera1",
        name="MARCUS WRIGHT",
        id_num="SPEC-5511-2244",
        dob="1980-04-18",
        issue_date="2017-09-05",
        expiry_date="2027-09-05"
    )
    # Convert data URL to binary bytes
    import base64
    b64_data = camera_doc["image_data_url"].split(",")[1]
    raw_bytes = base64.b64decode(b64_data)

    response = client.post(
        "/api/analyze",
        files={"file": ("camera_capture.png", raw_bytes, "image/png")}
    )
    assert response.status_code == 200
    result = response.json()
    field_map = {f["field_name"]: f["value"] for f in result["extracted_fields"]}
    assert "MARCUS" in field_map["Full Name"].upper()
    assert field_map["ID Number"] == "SPEC-5511-2244"
    assert field_map["Date of Birth"] == "1980-04-18"

# ---------------------------------------------------------------------------
# Tamper & Consistency Tests
# ---------------------------------------------------------------------------
def test_analyze_tampered_photo_sample():
    response = client.post("/api/analyze", data={"sample_id": "tampered_photo"})
    assert response.status_code == 200
    result = response.json()
    assert result["risk_level"] == "HIGH"
    assert result["risk_score"] > 70.0
    finding_sources = [f["signal_source"] for f in result["findings"]]
    assert any("TAMPER" in f["category"] for f in result["findings"])
    assert any("CV_PHOTO_BORDER_CUTLINE" in src or "CV_ELA" in src for src in finding_sources)

def test_analyze_inconsistent_dates_sample():
    response = client.post("/api/analyze", data={"sample_id": "inconsistent_dates"})
    assert response.status_code == 200
    result = response.json()
    assert result["risk_level"] == "HIGH"
    assert result["risk_score"] > 70.0
    finding_sources = [f["signal_source"] for f in result["findings"]]
    assert any("CONSISTENCY_DATE_INVERSION" in src or "CONSISTENCY_FUTURE_DOB" in src for src in finding_sources)

def test_error_handling_empty_request():
    response = client.post("/api/analyze")
    assert response.status_code in [400, 422]

def test_error_handling_invalid_sample():
    response = client.post("/api/analyze", data={"sample_id": "non_existent_sample_123"})
    assert response.status_code == 404

# ---------------------------------------------------------------------------
# Document Detection & Quality Metrics Assessment Tests
# ---------------------------------------------------------------------------
def test_detect_document_corners_and_quality():
    sample = SampleGenerator.get_all_samples()[0]
    b64 = sample["image_data_url"]
    
    response = client.post("/api/scan/detect-document", json={"image_base64": b64})
    assert response.status_code == 200
    data = response.json()
    assert data["detected"] is True
    assert len(data["corners"]) == 4
    assert data["confidence"] > 0.5
    assert data["quality"] is not None
    assert "quality_status" in data["quality"]
    assert data["quality"]["quality_status"] in ["GOOD_CAPTURE", "HOLD_STEADY", "GLARE_DETECTED", "TOO_FAR"]
    assert data["quality"]["blur_score"] > 0
    assert data["quality"]["brightness"] > 0

def test_warp_document_perspective():
    sample = SampleGenerator.get_all_samples()[0]
    b64 = sample["image_data_url"]
    corners = [[20, 20], [580, 20], [580, 380], [20, 380]]
    
    response = client.post("/api/scan/warp-document", json={"image_base64": b64, "corners": corners})
    assert response.status_code == 200
    data = response.json()
    assert "warped_image_base64" in data
    assert len(data["warped_image_base64"]) > 100
    assert data["width"] >= 800
    assert data["height"] >= 500

# ---------------------------------------------------------------------------
# Section 21 Test Documents: Document A & Document B (Synthetic)
# ---------------------------------------------------------------------------
def test_document_a_synthetic():
    doc_a = SampleGenerator.generate_sample(
        sample_id="doc_a_alpha",
        name="TEST PERSON ALPHA",
        id_num="TEST-73921",
        dob="2004-02-14",
        issue_date="2024-06-10",
        expiry_date="2034-06-10"
    )
    response = client.post("/api/analyze", data={"image_base64": doc_a["image_data_url"]})
    assert response.status_code == 200
    result = response.json()
    field_map = {f["field_name"]: f["value"] for f in result["extracted_fields"]}
    
    # Must preserve TEST tokens and multi-word name
    assert "TEST PERSON ALPHA" in field_map["Full Name"].upper()
    assert "TEST-73921" in field_map["ID Number"].upper()
    assert field_map["Date of Birth"] == "2004-02-14"
    assert "ALEX MORGAN" not in field_map["Full Name"]

def test_document_b_synthetic():
    doc_b = SampleGenerator.generate_sample(
        sample_id="doc_b_rahul",
        name="RAHUL KUMAR SHARMA",
        id_num="IND-4821-7782",
        dob="1998-11-05",
        issue_date="2023-01-15",
        expiry_date="2033-01-15"
    )
    response = client.post("/api/analyze", data={"image_base64": doc_b["image_data_url"]})
    assert response.status_code == 200
    result = response.json()
    field_map = {f["field_name"]: f["value"] for f in result["extracted_fields"]}
    
    assert "RAHUL KUMAR SHARMA" in field_map["Full Name"].upper()
    assert "IND-4821-7782" in field_map["ID Number"].upper()
    assert field_map["Date of Birth"] == "1998-11-05"
    assert "ALEX MORGAN" not in field_map["Full Name"]

