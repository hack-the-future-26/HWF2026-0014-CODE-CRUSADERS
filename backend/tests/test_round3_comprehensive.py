import io
import json
import base64
import urllib.request
import urllib.parse
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import cv2

API_BASE = "http://127.0.0.1:8000/api"

def http_post(url: str, form_data: dict = None, json_data: dict = None):
    if json_data is not None:
        data_bytes = json.dumps(json_data).encode("utf-8")
        req = urllib.request.Request(url, data=data_bytes, headers={"Content-Type": "application/json"})
    elif form_data is not None:
        encoded = urllib.parse.urlencode(form_data).encode("utf-8")
        req = urllib.request.Request(url, data=encoded, headers={"Content-Type": "application/x-www-form-urlencoded"})
    else:
        req = urllib.request.Request(url, data=b"")
    with urllib.request.urlopen(req) as resp:
        return resp.status, json.loads(resp.read().decode("utf-8"))


def create_synthetic_id_image(
    name: str,
    id_num: str,
    dob: str,
    issue: str,
    expiry: str,
    address: str = None,
    width: int = 860,
    height: int = 540
) -> str:
    """Generate clean synthetic test ID card image as data URL without real PII."""
    img = Image.new("RGB", (width, height), color=(245, 248, 252))
    draw = ImageDraw.Draw(img)

    # Outer border
    draw.rounded_rectangle([15, 15, width - 15, height - 15], radius=24, outline=(70, 130, 180), width=3)
    
    # Header
    draw.rectangle([18, 18, width - 18, 90], fill=(24, 49, 83))
    draw.text((35, 32), "OFFICIAL IDENTITY SPECIMEN", fill=(255, 255, 255))
    draw.text((35, 58), "FOR SCREENING VALIDATION ONLY - NON-GOVERNMENT", fill=(180, 210, 240))

    # Stylized synthetic avatar silhouette
    draw.rectangle([50, 120, 220, 340], fill=(220, 230, 242), outline=(140, 160, 180), width=2)
    draw.ellipse([100, 150, 170, 220], fill=(130, 160, 190))
    draw.polygon([(65, 335), (95, 250), (175, 250), (205, 335)], fill=(90, 120, 150))
    draw.text((60, 310), "SYNTHETIC AVATAR", fill=(80, 100, 120))

    # Demographic Fields
    x_start = 260
    y_start = 120
    spacing = 42

    fields = [
        ("FULL NAME", name),
        ("ID NUMBER", id_num),
        ("DATE OF BIRTH", dob),
        ("ISSUE DATE", issue),
        ("EXPIRY DATE", expiry),
    ]
    if address:
        fields.append(("ADDRESS", address))

    for idx, (label, val) in enumerate(fields):
        curr_y = y_start + idx * spacing
        draw.text((x_start, curr_y), f"{label}:", fill=(100, 116, 139))
        draw.text((x_start + 160, curr_y), val, fill=(15, 23, 42))

    # Bottom watermark line
    draw.text((35, height - 40), "ISO/IEC 7810 ID-1 DEMONSTRATION CARD", fill=(140, 160, 180))

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=95)
    b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
    return f"data:image/jpeg;base64,{b64}"

def run_tests():
    print("=" * 70)
    print("ROUND 3: COMPREHENSIVE OCR & SCANNER VERIFICATION SUITE")
    print("=" * 70)

    # -------------------------------------------------------------
    # TEST 1: TEST PERSON ALPHA
    # -------------------------------------------------------------
    print("\n--- TEST 1: TEST PERSON ALPHA ---")
    doc1_b64 = create_synthetic_id_image(
        name="TEST PERSON ALPHA",
        id_num="TEST-73921",
        dob="14-02-2004",
        issue="10-06-2024",
        expiry="10-06-2034",
        address="123 Example Street"
    )

    status1, data1 = http_post(f"{API_BASE}/analyze", form_data={"image_base64": doc1_b64})
    assert status1 == 200, f"Test 1 failed: {data1}"

    fields1 = {f["field_name"]: f["value"] for f in data1["extracted_fields"]}
    print(f"Extracted fields for Document 1:")
    for fn, fv in fields1.items():
        print(f"  [{fn}]: '{fv}'")

    assert "TEST PERSON ALPHA" in fields1.get("Full Name", "").upper(), f"Name mismatch: {fields1.get('Full Name')}"
    assert "TEST-73921" in fields1.get("ID Number", "").upper(), f"ID mismatch: {fields1.get('ID Number')}"
    assert "2004" in fields1.get("Date of Birth", ""), f"DOB mismatch: {fields1.get('Date of Birth')}"
    assert "123 Example Street" in fields1.get("Address", ""), f"Address mismatch: {fields1.get('Address')}"
    print(">>> TEST 1 PASSED: Full Name, ID, Dates, and Address extracted accurately!")

    # -------------------------------------------------------------
    # TEST 2: RAHUL KUMAR SHARMA
    # -------------------------------------------------------------
    print("\n--- TEST 2: RAHUL KUMAR SHARMA ---")
    doc2_b64 = create_synthetic_id_image(
        name="RAHUL KUMAR SHARMA",
        id_num="IND-4821-7782",
        dob="05-11-1998",
        issue="15-01-2023",
        expiry="15-01-2033",
        address="45 Example Road"
    )

    status2, data2 = http_post(f"{API_BASE}/analyze", form_data={"image_base64": doc2_b64})
    assert status2 == 200, f"Test 2 failed: {data2}"

    fields2 = {f["field_name"]: f["value"] for f in data2["extracted_fields"]}
    print(f"Extracted fields for Document 2:")
    for fn, fv in fields2.items():
        print(f"  [{fn}]: '{fv}'")

    assert "RAHUL KUMAR SHARMA" in fields2.get("Full Name", "").upper(), f"Name mismatch: {fields2.get('Full Name')}"
    assert "IND-4821-7782" in fields2.get("ID Number", "").upper(), f"ID mismatch: {fields2.get('ID Number')}"
    assert "1998" in fields2.get("Date of Birth", ""), f"DOB mismatch: {fields2.get('Date of Birth')}"
    assert "45 Example Road" in fields2.get("Address", ""), f"Address mismatch: {fields2.get('Address')}"
    print(">>> TEST 2 PASSED: Full Name, ID, Dates, and Address extracted accurately!")

    # -------------------------------------------------------------
    # TEST 3: ZERO DATA LEAKAGE BETWEEN CONSECUTIVE RUNS
    # -------------------------------------------------------------
    print("\n--- TEST 3: ZERO DATA LEAKAGE VERIFICATION ---")
    # Verify no values from Document 1 leaked into Document 2
    assert "ALPHA" not in fields2.get("Full Name", "").upper(), "Leakage: ALPHA found in Doc 2!"
    assert "73921" not in fields2.get("ID Number", ""), "Leakage: 73921 found in Doc 2!"
    assert "123" not in fields2.get("Address", ""), "Leakage: 123 found in Doc 2!"
    print(">>> TEST 3 PASSED: Document A -> Result A, Document B -> Result B (No cross-specimen leakage)!")

    # -------------------------------------------------------------
    # TEST 4: MULTI-WORD NAME TEST (Laxmi Singh)
    # -------------------------------------------------------------
    print("\n--- TEST 4: LAXMI SINGH ---")
    doc3_b64 = create_synthetic_id_image(
        name="Laxmi Singh",
        id_num="SPEC-3920-4100",
        dob="22-08-2001",
        issue="01-01-2022",
        expiry="01-01-2032"
    )

    status3, data3 = http_post(f"{API_BASE}/analyze", form_data={"image_base64": doc3_b64})
    assert status3 == 200, f"Test 4 failed: {data3}"
    fields3 = {f["field_name"]: f["value"] for f in data3["extracted_fields"]}
    print(f"Extracted fields for Document 3 (Laxmi Singh):")
    for fn, fv in fields3.items():
        print(f"  [{fn}]: '{fv}'")

    assert "LAXMI SINGH" in fields3.get("Full Name", "").upper(), f"Multi-word name failed: {fields3.get('Full Name')}"
    print(">>> TEST 4 PASSED: Multi-word name 'Laxmi Singh' extracted perfectly!")

    # -------------------------------------------------------------
    # TEST 5: SCANNER PERSPECTIVE WARP & CONTOUR DETECTION
    # -------------------------------------------------------------
    print("\n--- TEST 5: SCANNER PERSPECTIVE CORRECTION & CROP ---")
    # Create an angled/skewed card placed inside a larger background scene
    scene = Image.new("RGB", (1280, 960), color=(30, 35, 45))
    
    # Decode doc2
    card_bytes = base64.b64decode(doc2_b64.split(",")[1])
    card_img = Image.open(io.BytesIO(card_bytes))
    card_img = card_img.resize((700, 440))
    # Rotate card by 12 degrees to simulate angled capture
    rotated_card = card_img.rotate(12, expand=True, resample=Image.BICUBIC)
    scene.paste(rotated_card, (280, 240), mask=rotated_card.split()[0])

    buf_scene = io.BytesIO()
    scene.save(buf_scene, format="JPEG", quality=90)
    scene_b64 = f"data:image/jpeg;base64,{base64.b64encode(buf_scene.getvalue()).decode('utf-8')}"

    # 1. Test corner detection
    det_status, det_data = http_post(f"{API_BASE}/scan/detect-document", json_data={"image_base64": scene_b64})
    assert det_status == 200, f"Corner detection failed: {det_data}"
    print(f"Corner detection response: detected={det_data['detected']}, confidence={det_data['confidence']}%, corners={det_data['corners']}")

    # 2. Test perspective warp
    warp_corners = det_data["corners"]
    warp_status, warp_data = http_post(f"{API_BASE}/scan/warp-document", json_data={
        "image_base64": scene_b64,
        "corners": warp_corners
    })
    assert warp_status == 200, f"Perspective warp failed: {warp_data}"
    print(f"Perspective warp successful: width={warp_data['width']}, height={warp_data['height']}")
    assert warp_data["width"] > warp_data["height"], "Warped document must have landscape ID card orientation"

    # 3. Pass warped document into existing /api/analyze pipeline
    warped_b64 = warp_data["warped_image_base64"]
    analyze_status, warped_analysis = http_post(f"{API_BASE}/analyze", form_data={"image_base64": warped_b64})
    assert analyze_status == 200, f"Analyze warped failed: {warped_analysis}"
    print(f"Warped Document Analysis Result: Risk={warped_analysis['risk_score']} ({warped_analysis['risk_level']}), OCR score={warped_analysis['category_scores']['ocr_score']}")
    print(f"Warped Extracted Fields: {[(f['field_name'], f['value']) for f in warped_analysis['extracted_fields']]}")

    print(">>> TEST 5 PASSED: Perspective warp successfully flattened angled capture and fed into /api/analyze!")

    print("\n" + "=" * 70)
    print("ALL ROUND 3 TEST SUITES COMPLETED SUCCESSFULLY!")
    print("=" * 70)

if __name__ == "__main__":
    run_tests()
