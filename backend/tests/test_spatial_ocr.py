import pytest
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.services.ocr_service import OCRService
from backend.app.services.sample_generator import SampleGenerator

client = TestClient(app)

def make_tok(text: str, x: int, y: int, w: int, h: int, conf: float = 95.0):
    return {
        "text": text,
        "conf": conf,
        "bbox": [x, y, w, h],
        "min_x": x,
        "min_y": y,
        "max_x": x + w,
        "max_y": y + h,
        "center_x": x + w / 2.0,
        "center_y": y + h / 2.0
    }

# ---------------------------------------------------------------------------
# 1. Same-Line Relationship: Label and Value on Same Line
# ---------------------------------------------------------------------------
def test_same_line_label_and_value():
    tokens = [
        make_tok("FULL NAME:", 100, 120, 100, 20),
        make_tok("Jane", 215, 120, 45, 20),
        make_tok("Doe", 265, 120, 40, 20)
    ]
    parsed = OCRService._parse_tokens_into_fields(tokens, h=600, w=800)
    assert parsed["Full Name"]["value"] == "Jane Doe"
    assert parsed["Full Name"]["confidence"] >= 90.0
    assert parsed["Full Name"]["bbox"] is not None

def test_same_line_inline_remainder():
    tokens = [
        make_tok("NAME: JOHN DOE", 100, 120, 160, 20)
    ]
    parsed = OCRService._parse_tokens_into_fields(tokens, h=600, w=800)
    assert parsed["Full Name"]["value"] == "JOHN DOE"
    assert parsed["Full Name"]["confidence"] >= 90.0

# ---------------------------------------------------------------------------
# 2. Next-Line Relationship: Label on One Line, Value on Next Line
# ---------------------------------------------------------------------------
def test_next_line_label_and_value():
    tokens = [
        # Line 1: Header label
        make_tok("FULL NAME", 100, 120, 100, 20),
        # Line 2: Value directly below in same column
        make_tok("Atulya", 100, 155, 60, 20),
        make_tok("Kumar", 165, 155, 55, 20),
        make_tok("Singh", 225, 155, 55, 20)
    ]
    parsed = OCRService._parse_tokens_into_fields(tokens, h=600, w=800)
    assert parsed["Full Name"]["value"] == "Atulya Kumar Singh"
    assert parsed["Full Name"]["confidence"] >= 90.0

# ---------------------------------------------------------------------------
# 3. Multiple Nearby Fields: Prevent Cross-Contamination
# ---------------------------------------------------------------------------
def test_multiple_nearby_fields_horizontal_and_vertical():
    """
    Test two columns and two rows of nearby fields:
    Line 1: [FULL NAME: ATULYA SINGH]       [ID NO: DL-998822]
    Line 2: [DOB: 14-02-2004]               [ISSUE: 10-06-2024]
    """
    tokens = [
        # Line 1, Col 1
        make_tok("FULL NAME:", 50, 120, 90, 20),
        make_tok("ATULYA", 150, 120, 60, 20),
        make_tok("SINGH", 215, 120, 50, 20),
        # Line 1, Col 2
        make_tok("ID NO:", 400, 120, 60, 20),
        make_tok("DL-998822", 470, 120, 90, 20),

        # Line 2, Col 1
        make_tok("DATE OF BIRTH:", 50, 170, 110, 20),
        make_tok("14-02-2004", 170, 170, 85, 20),
        # Line 2, Col 2
        make_tok("ISSUE DATE:", 400, 170, 95, 20),
        make_tok("10-06-2024", 505, 170, 85, 20),
    ]
    parsed = OCRService._parse_tokens_into_fields(tokens, h=600, w=800)

    # Full name must not capture ID Number or dates
    assert parsed["Full Name"]["value"] == "ATULYA SINGH"
    assert "ID" not in parsed["Full Name"]["value"]
    assert "DL" not in parsed["Full Name"]["value"]

    # ID Number must correctly capture DL-998822
    assert parsed["ID Number"]["value"] == "DL-998822"

    # Dates must map to their respective fields without swapped assignment
    assert parsed["Date of Birth"]["value"] == "2004-02-14"
    assert parsed["Issue Date"]["value"] == "2024-06-10"

# ---------------------------------------------------------------------------
# 4. Multi-Word Name: "Atulya Kumar Singh"
# ---------------------------------------------------------------------------
def test_multi_word_name_extraction():
    tokens = [
        make_tok("NAME:", 80, 140, 60, 20),
        make_tok("Atulya", 150, 140, 60, 20),
        make_tok("Kumar", 215, 140, 55, 20),
        make_tok("Singh", 275, 140, 50, 20),
    ]
    parsed = OCRService._parse_tokens_into_fields(tokens, h=600, w=800)
    assert parsed["Full Name"]["value"] == "Atulya Kumar Singh"

def test_hyphenated_and_apostrophe_names():
    tokens = [
        make_tok("NAME:", 80, 140, 60, 20),
        make_tok("Jean-Luc", 150, 140, 75, 20),
        make_tok("O'Connor", 230, 140, 70, 20),
    ]
    parsed = OCRService._parse_tokens_into_fields(tokens, h=600, w=800)
    assert parsed["Full Name"]["value"] == "Jean-Luc O'Connor"

# ---------------------------------------------------------------------------
# 5. Date Fields with DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY
# ---------------------------------------------------------------------------
def test_date_fields_dd_mm_yyyy():
    tokens = [
        make_tok("DOB:", 80, 100, 50, 20),
        make_tok("14-02-2004", 140, 100, 90, 20),
        make_tok("ISSUE:", 80, 140, 60, 20),
        make_tok("10/06/2024", 150, 140, 90, 20),
        make_tok("EXPIRY:", 80, 180, 70, 20),
        make_tok("10.06.2034", 160, 180, 90, 20),
    ]
    parsed = OCRService._parse_tokens_into_fields(tokens, h=600, w=800)
    assert parsed["Date of Birth"]["value"] == "2004-02-14"
    assert parsed["Issue Date"]["value"] == "2024-06-10"
    assert parsed["Expiry Date"]["value"] == "2034-06-10"

# ---------------------------------------------------------------------------
# 6. Low Confidence and Boilerplate Rejection
# ---------------------------------------------------------------------------
def test_low_confidence_flagged():
    tokens = [
        make_tok("NAME:", 80, 140, 60, 20, conf=90.0),
        make_tok("John", 150, 140, 45, 20, conf=20.0),  # Very low OCR confidence < 35%
        make_tok("Doe", 200, 140, 40, 20, conf=22.0)
    ]
    parsed = OCRService._parse_tokens_into_fields(tokens, h=600, w=800)
    assert parsed["Full Name"]["value"] == "Low OCR confidence"

def test_boilerplate_not_selected_as_value():
    tokens = [
        make_tok("FULL NAME", 80, 140, 90, 20),
        # Following line contains boilerplate specimen disclaimer
        make_tok("SPECIMEN ONLY", 80, 170, 120, 20),
        # Following line has actual name
        make_tok("Sarah Connor", 80, 200, 110, 20)
    ]
    parsed = OCRService._parse_tokens_into_fields(tokens, h=600, w=800)
    assert parsed["Full Name"]["value"] == "Sarah Connor"
    assert "SPECIMEN" not in parsed["Full Name"]["value"]

# ---------------------------------------------------------------------------
# 7. End-to-End Synthetic Card with Multi-Word Name & DD-MM-YYYY
# ---------------------------------------------------------------------------
def test_end_to_end_synthetic_atulya_kumar_singh():
    doc = SampleGenerator.generate_sample(
        sample_id="doc_atulya",
        name="ATULYA KUMAR SINGH",
        id_num="IND-9912-3344",
        dob="14-02-2004",
        issue_date="10-06-2024",
        expiry_date="10-06-2034"
    )
    response = client.post("/api/analyze", data={"image_base64": doc["image_data_url"]})
    assert response.status_code == 200
    data = response.json()
    field_map = {f["field_name"]: f["value"] for f in data["extracted_fields"]}

    assert "ATULYA KUMAR SINGH" in field_map["Full Name"].upper()
    assert "IND-9912-3344" in field_map["ID Number"].upper()
    assert "2004" in field_map["Date of Birth"]
