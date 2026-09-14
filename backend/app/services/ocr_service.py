import re
import cv2
import numpy as np
from typing import Dict, Any, List, Optional, Tuple
from backend.app.models.schemas import ExtractedField, BoundingBox, Finding, FindingSeverity

# Global singleton for OCR engine to avoid re-initializing ONNX sessions on every request
_RAPID_OCR_INSTANCE = None

def get_rapid_ocr():
    global _RAPID_OCR_INSTANCE
    if _RAPID_OCR_INSTANCE is None:
        try:
            from rapidocr_onnxruntime import RapidOCR
            _RAPID_OCR_INSTANCE = RapidOCR()
        except Exception as e:
            print(f"[OCRService] RapidOCR initialization warning: {e}")
            _RAPID_OCR_INSTANCE = False
    return _RAPID_OCR_INSTANCE if _RAPID_OCR_INSTANCE is not False else None


class OCRService:
    @classmethod
    def _create_preprocessing_variant(cls, img_rgb: np.ndarray, variant_type: str = "clahe") -> np.ndarray:
        """
        Generate optimized preprocessing variant for challenging captures (low contrast, uneven lighting).
        """
        try:
            if variant_type == "clahe":
                # Contrast Limited Adaptive Histogram Equalization on L channel
                lab = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2LAB)
                l, a, b = cv2.split(lab)
                clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
                l_enhanced = clahe.apply(l)
                enhanced_lab = cv2.merge((l_enhanced, a, b))
                return cv2.cvtColor(enhanced_lab, cv2.COLOR_LAB2RGB)
            elif variant_type == "sharpen":
                gray = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2GRAY)
                blur = cv2.GaussianBlur(gray, (0, 0), 2.0)
                sharpened = cv2.addWeighted(gray, 1.6, blur, -0.6, 0)
                return cv2.cvtColor(sharpened, cv2.COLOR_GRAY2RGB)
        except Exception as e:
            print(f"[OCRService] Preprocessing variant '{variant_type}' error: {e}")
        return img_rgb

    @classmethod
    def _extract_via_pattern_or_ocr(cls, img_rgb: np.ndarray) -> Tuple[List[Dict[str, Any]], str]:
        """
        Extract textual information and token coordinates using RapidOCR (primary)
        or pytesseract (fallback) with automated multi-variant preprocessing when needed.
        Returns (tokens, engine_name).
        """
        h, w = img_rgb.shape[:2]
        extracted_tokens = []
        engine_used = "IDShield-AdaptiveOCR v2.0"

        # 1. Try RapidOCR (high accuracy, self-contained ONNX runtime, local CPU)
        ocr_engine = get_rapid_ocr()
        if ocr_engine is not None:
            try:
                # Primary pass on clean image
                results, _ = ocr_engine(img_rgb)
                
                # If primary pass returned very few tokens (< 5), try CLAHE contrast enhancement
                if (not results or len(results) < 5):
                    clahe_img = cls._create_preprocessing_variant(img_rgb, "clahe")
                    results_clahe, _ = ocr_engine(clahe_img)
                    if results_clahe and len(results_clahe) > (len(results) if results else 0):
                        results = results_clahe
                        engine_used = "IDShield-RapidOCR (CLAHE Enhanced)"

                if results:
                    for item in results:
                        bbox_points, text, conf = item[0], item[1].strip(), float(item[2]) * 100.0
                        if text:
                            xs = [p[0] for p in bbox_points]
                            ys = [p[1] for p in bbox_points]
                            min_x, max_x = max(0, int(min(xs))), min(w, int(max(xs)))
                            min_y, max_y = max(0, int(min(ys))), min(h, int(max(ys)))
                            box_w = max(1, max_x - min_x)
                            box_h = max(1, max_y - min_y)
                            extracted_tokens.append({
                                "text": text,
                                "conf": round(conf, 1),
                                "bbox": [min_x, min_y, box_w, box_h],
                                "center_x": (min_x + max_x) / 2.0,
                                "center_y": (min_y + max_y) / 2.0,
                                "min_y": min_y,
                                "min_x": min_x
                            })
                    if "CLAHE" not in engine_used:
                        engine_used = "IDShield-RapidOCR (ONNX)"
                    return extracted_tokens, engine_used
            except Exception as e:
                print(f"[OCRService] RapidOCR extraction failed: {e}")

        # 2. Fallback to pytesseract if installed and configured
        try:
            import pytesseract
            data = pytesseract.image_to_data(img_rgb, output_type=pytesseract.Output.DICT)
            n_boxes = len(data['text'])
            for i in range(n_boxes):
                text = data['text'][i].strip()
                conf = float(data['conf'][i])
                if text and conf > 15:
                    left, top = max(0, int(data['left'][i])), max(0, int(data['top'][i]))
                    bw, bh = max(1, int(data['width'][i])), max(1, int(data['height'][i]))
                    extracted_tokens.append({
                        "text": text,
                        "conf": round(conf, 1),
                        "bbox": [left, top, bw, bh],
                        "center_x": left + bw / 2.0,
                        "center_y": top + bh / 2.0,
                        "min_y": top,
                        "min_x": left
                    })
            if extracted_tokens:
                engine_used = "IDShield-TesseractOCR"
        except Exception:
            pass

        return extracted_tokens, engine_used

    @classmethod
    def _parse_tokens_into_fields(cls, tokens: List[Dict[str, Any]], h: int, w: int) -> Dict[str, Dict[str, Any]]:
        """
        Parses detected tokens into key demographic fields:
        - Full Name
        - ID Number
        - Date of Birth
        - Issue Date
        - Expiry Date
        - Address (if present)
        - Nationality (if present)
        - Gender (if present)
        - Document Type (if present)

        NEVER substitutes hardcoded demo identities if tokens are missing.
        """
        parsed = {
            "Full Name": {"value": "Not detected", "confidence": 0.0, "bbox": None},
            "ID Number": {"value": "Not detected", "confidence": 0.0, "bbox": None},
            "Date of Birth": {"value": "Not detected", "confidence": 0.0, "bbox": None},
            "Issue Date": {"value": "Not detected", "confidence": 0.0, "bbox": None},
            "Expiry Date": {"value": "Not detected", "confidence": 0.0, "bbox": None},
            "Address": {"value": "Not detected", "confidence": 0.0, "bbox": None},
            "Nationality": {"value": "Not detected", "confidence": 0.0, "bbox": None},
            "Gender": {"value": "Not detected", "confidence": 0.0, "bbox": None},
            "Document Type": {"value": "Not detected", "confidence": 0.0, "bbox": None},
        }

        if not tokens:
            return parsed

        # DISCLAIMER / BOILERPLATE phrases that should be ignored as field values
        DISCLAIMER_WORDS = {
            "SYNTHETIC", "SPECIMEN", "SAMPLE", "DEMO", "NON-GOVERNMENT",
            "CREDENTIAL", "ISO/IEC", "7810", "ID-1", "AVATAR", "SIGNATURE", "CARD",
            "OFFICIAL", "REPUBLIC", "GOVERNMENT", "DEPARTMENT", "IDENTITY CARD",
            "NATIONAL ID", "DRIVING LICENCE", "DRIVER LICENSE"
        }

        def is_boilerplate(text: str) -> bool:
            cleaned = text.strip().upper()
            if not cleaned or len(cleaned) < 2:
                return True
            if cleaned in DISCLAIMER_WORDS or cleaned in {"SYNTHETIC SPECIMEN", "SPECIMEN ONLY", "DEMO ONLY"}:
                return True
            if any(k in cleaned for k in ["ISO/IEC", "7810", "ID-1", "DEMONSTRATION", "SYNTHETIC AVATAR", "SPECIMEN ONLY"]):
                return True
            return False

        # Cluster tokens into reading lines based on vertical proximity
        sorted_by_y = sorted(tokens, key=lambda t: t["center_y"])
        avg_h = float(np.mean([t["bbox"][3] for t in tokens])) if tokens else 20.0
        vert_thresh = max(10.0, min(avg_h * 0.70, 40.0))

        lines: List[List[Dict[str, Any]]] = []
        for t in sorted_by_y:
            placed = False
            for line in lines:
                line_avg_y = sum(item["center_y"] for item in line) / len(line)
                if abs(t["center_y"] - line_avg_y) <= vert_thresh:
                    line.append(t)
                    placed = True
                    break
            if not placed:
                lines.append([t])

        # Sort tokens inside each line left-to-right, then sort lines top-to-bottom
        for line in lines:
            line.sort(key=lambda item: item["min_x"])
        lines.sort(key=lambda line: sum(item["center_y"] for item in line) / len(line))

        LABEL_PATTERNS = {
            "Full Name": [
                r'(?:^|[\s\.\:\-\#])(?:FULL\s*NAME|NAME|SURNAME|GIVEN\s*NAMES?|NOM\b|NOMBRE\b|HOLDER(?:\'S)?\s*NAME|CARDHOLDER(?:\'S)?\s*NAME|BEARER(?:\'S)?\s*NAME|APPLICANT(?:\'S)?\s*NAME)',
            ],
            "ID Number": [
                r'(?:^|[\s\.\:\-\#])(?:DOCUMENT\s*(?:NO|NUMBER|ID)|DOC\s*(?:NO|NUMBER|ID)|ID\s*(?:NO|NUMBER)|CARD\s*(?:NO|NUMBER)|IDENTIFICATION\s*(?:NO|NUMBER)?|DL\s*(?:NO|NUMBER)|LICEN[SC]E\s*(?:NO|NUMBER)|ROLL\s*(?:NO|NUMBER)|REG(?:ISTRATION)?\s*(?:NO|NUMBER)|PASSPORT\s*(?:NO|NUMBER))',
            ],
            "Date of Birth": [
                r'(?:^|[\s\.\:\-\#])(?:DATE\s*OF\s*BIRTH|D\.?O\.?B\.?|BIRTH\s*DATE|DOB\b|DATE\s*DE\s*NAISSANCE|FECHA\s*DE\s*NACIMIENTO|NATAL\b)',
            ],
            "Issue Date": [
                r'(?:^|[\s\.\:\-\#])(?:ISSUE\s*DATE|DATE\s*OF\s*ISSUE|ISSUED\b|ISS\.?\s*DATE|DATE\s*D[\'’]EMISSION|FECHA\s*DE\s*EXPEDICION)',
            ],
            "Expiry Date": [
                r'(?:^|[\s\.\:\-\#])(?:EXPIRY\s*DATE|EXPIRATION\s*DATE|EXPIRES\b|EXP\.?\s*DATE|EXP\b|VALID\s*(?:UNTIL|THRU|TO)|FECHA\s*DE\s*VENCIMIENTO|EXPIRATION\b)',
            ],
            "Address": [
                r'(?:^|[\s\.\:\-\#])(?:ADDRESS|ADDR\.?|RESIDENTIAL\s*ADDRESS|PERMANENT\s*ADDRESS|PRESENT\s*ADDRESS|DOMICILE|DIRECCION|ADRESSE|STREET\s*ADDRESS)',
            ],
            "Nationality": [
                r'(?:^|[\s\.\:\-\#])(?:NATIONALITY|CITIZENSHIP|NAT\.?\b|NATION\b|NACIONALIDAD|NATIONALITE)',
            ],
            "Gender": [
                r'(?:^|[\s\.\:\-\#])(?:GENDER|SEX\b|SEXE\b|SEXO\b)',
            ],
            "Document Type": [
                r'(?:^|[\s\.\:\-\#])(?:DOCUMENT\s*TYPE|DOC\s*TYPE|CARD\s*TYPE|CATEGORY\b|CLASS\b)',
            ]
        }

        def is_any_label(text: str) -> bool:
            u = text.upper()
            return any(re.search(pat, u) for plist in LABEL_PATTERNS.values() for pat in plist)

        def make_merged_bbox(token_list: List[Dict[str, Any]]) -> List[int]:
            if not token_list:
                return [0, 0, 0, 0]
            x1 = min(t.get("min_x", t["bbox"][0]) for t in token_list)
            y1 = min(t.get("min_y", t["bbox"][1]) for t in token_list)
            x2 = max(t.get("max_x", t["bbox"][0] + t["bbox"][2]) for t in token_list)
            y2 = max(t.get("max_y", t["bbox"][1] + t["bbox"][3]) for t in token_list)
            return [int(x1), int(y1), int(x2 - x1), int(y2 - y1)]


        # -------------------------------------------------------------
        # PASS 1: Line-by-Line Label Search & Multi-Token Field Extraction
        # -------------------------------------------------------------
        for line_idx, line in enumerate(lines):
            line_text = " ".join(t["text"].strip() for t in line)
            line_upper = line_text.upper()

            for field_name, patterns in LABEL_PATTERNS.items():
                if parsed[field_name]["value"] != "Not detected":
                    continue

                for pat in patterns:
                    m = re.search(pat, line_upper)
                    if not m:
                        continue

                    # Label pattern matched in this line!
                    matched_end = m.end()

                    # Find which token in the line contained the end of the match
                    char_count = 0
                    label_token_idx = 0
                    inline_remainder = ""
                    for idx, tok in enumerate(line):
                        tok_len = len(tok["text"])
                        if char_count + tok_len >= matched_end:
                            label_token_idx = idx
                            offset_in_tok = matched_end - char_count
                            inline_remainder = tok["text"][offset_in_tok:].strip().lstrip(": -#.")
                            break
                        char_count += tok_len + 1  # account for space

                    # Collect candidate tokens on current line
                    val_tokens: List[Dict[str, Any]] = []
                    if inline_remainder and not is_boilerplate(inline_remainder):
                        # Create pseudo token or use remainder text
                        val_tokens.append({
                            "text": inline_remainder,
                            "conf": line[label_token_idx]["conf"],
                            "min_x": line[label_token_idx]["min_x"],
                            "min_y": line[label_token_idx]["min_y"],
                            "max_x": line[label_token_idx]["bbox"][0] + line[label_token_idx]["bbox"][2],
                            "max_y": line[label_token_idx]["bbox"][1] + line[label_token_idx]["bbox"][3],
                            "bbox": line[label_token_idx]["bbox"]
                        })

                    # Add remaining tokens on the same line to the right
                    for next_tok in line[label_token_idx + 1:]:
                        if is_any_label(next_tok["text"]):
                            break
                        if not is_boilerplate(next_tok["text"]):
                            val_tokens.append(next_tok)

                    # If no valid value tokens were found on same line, look at next line(s)
                    if not val_tokens and line_idx + 1 < len(lines):
                        next_line = lines[line_idx + 1]
                        next_line_text = " ".join(t["text"].strip() for t in next_line)
                        if not is_any_label(next_line_text) and not is_boilerplate(next_line_text):
                            for tok in next_line:
                                if not is_boilerplate(tok["text"]):
                                    val_tokens.append(tok)

                    # Special handling for multi-line Address: collect continuing lines
                    if field_name == "Address" and val_tokens:
                        start_next = line_idx + 1 if inline_remainder or (label_token_idx + 1 < len(line)) else line_idx + 2
                        for extra_idx in range(start_next, min(start_next + 2, len(lines))):
                            extra_line = lines[extra_idx]
                            extra_y = sum(t["center_y"] for t in extra_line) / len(extra_line)
                            if extra_y > (0.78 * h):
                                break
                            extra_text = " ".join(t["text"].strip() for t in extra_line)
                            if is_any_label(extra_text) or is_boilerplate(extra_text):
                                break
                            # If it's a date or mostly numbers, stop
                            if re.search(r'\b\d{2}[-/.]\d{2}[-/.]\d{4}\b', extra_text):
                                break
                            for tok in extra_line:
                                if not is_boilerplate(tok["text"]):
                                    val_tokens.append(tok)

                    # If we gathered value tokens, assign the field
                    if val_tokens:
                        combined_val = " ".join(t["text"].strip() for t in val_tokens).strip(" :-,")
                        if field_name == "Full Name":
                            # Separate concatenated camelCase words (e.g. LaxmiSingh -> Laxmi Singh)
                            combined_val = re.sub(r'([a-z])([A-Z])', r'\1 \2', combined_val)
                            # Remove stray punctuation
                            combined_val = re.sub(r'[^A-Za-z\s\.\'-]', '', combined_val).strip()
                        elif field_name == "Address":
                            # Separate camelCase words and digit-letter concatenations (e.g. 123ExampleStreet -> 123 Example Street)
                            combined_val = re.sub(r'([a-z])([A-Z])', r'\1 \2', combined_val)
                            combined_val = re.sub(r'([0-9])([A-Za-z])', r'\1 \2', combined_val)
                            combined_val = re.sub(r'([A-Za-z])([0-9])', r'\1 \2', combined_val)

                        if len(combined_val) >= 2:
                            avg_conf = float(np.mean([t["conf"] for t in val_tokens]))
                            merged_bbox = make_merged_bbox(val_tokens)
                            parsed[field_name] = {
                                "value": combined_val,
                                "confidence": avg_conf,
                                "bbox": merged_bbox
                            }
                            print(f"[OCR Token Parsing] Mapped '{field_name}' via label '{pat}': '{combined_val}' ({avg_conf:.1f}%)")
                            break


        # -------------------------------------------------------------
        # PASS 2: MRZ Line Parsing (standard ICAO Doc 9303 / ID-1 synthetic lines)
        # -------------------------------------------------------------
        mrz_lines = []
        for t in sorted(tokens, key=lambda x: (x["min_y"], x["min_x"])):
            txt = t["text"].replace(" ", "")
            if (txt.startswith("I<") or txt.startswith("P<") or txt.startswith("ID") or "<<" in txt) and len(txt) >= 15:
                mrz_lines.append((txt, t))

        for mrz_text, mrz_token in mrz_lines:
            # MRZ Name line
            name_m = re.match(r'^[A-Z0-9<]{2}(?:SPEC|[A-Z]{3})?([A-Z0-9<]+)$', mrz_text)
            if name_m and "<<" in name_m.group(1):
                raw = name_m.group(1).split("<<<")[0]
                parts = [p.replace("<", " ").strip() for p in raw.split("<<") if p.strip()]
                if parts:
                    clean_name = " ".join(parts).strip("<").strip()
                    if len(clean_name) >= 3:
                        if parsed["Full Name"]["value"] == "Not detected":
                            parsed["Full Name"] = {
                                "value": clean_name,
                                "confidence": mrz_token["conf"],
                                "bbox": mrz_token["bbox"]
                            }
                            print(f"[OCR Token Parsing] Mapped 'Full Name' via MRZ line: '{clean_name}'")
                        elif " " not in parsed["Full Name"]["value"] and clean_name.replace(" ", "").upper() == parsed["Full Name"]["value"].upper():
                            parsed["Full Name"]["value"] = clean_name

            # MRZ Document number
            if parsed["ID Number"]["value"] == "Not detected":
                id_match = re.search(r'([A-Z0-9]{3,5}[0-9]{6,8})', mrz_text)
                if id_match and not id_match.group(1).startswith("SPEC9406"):
                    parsed["ID Number"] = {
                        "value": id_match.group(1),
                        "confidence": mrz_token["conf"],
                        "bbox": mrz_token["bbox"]
                    }

        # -------------------------------------------------------------
        # PASS 3: Prominent Text Name Fallback (for IDs lacking explicit "NAME:" label)
        # -------------------------------------------------------------
        if parsed["Full Name"]["value"] == "Not detected":
            # Inspect lines in the demographic zone (between 15% and 70% of document height)
            candidate_names: List[Tuple[str, float, List[int], float]] = [] # (text, conf, bbox, score)
            for line in lines:
                line_y = sum(t["center_y"] for t in line) / len(line)
                if not (0.12 * h <= line_y <= 0.75 * h):
                    continue

                line_text = " ".join(t["text"].strip() for t in line).strip(" :-,#")
                line_upper = line_text.upper()

                # Skip if matches any known label
                if is_any_label(line_upper) or is_boilerplate(line_upper):
                    continue

                # Skip lines containing numbers, dates, emails, or urls
                if re.search(r'\d', line_text) or "@" in line_text or "HTTP" in line_upper:
                    continue

                # Separate camelCase if any
                line_clean = re.sub(r'([a-z])([A-Z])', r'\1 \2', line_text)
                line_clean = re.sub(r'[^A-Za-z\s\.\'-]', '', line_clean).strip()
                words = [w for w in line_clean.split() if len(w) >= 2]

                # A valid name line has 2 to 4 capitalized/alphabetic words
                if 2 <= len(words) <= 4:
                    # Check if words look like a human name (letters only)
                    all_alpha = all(re.match(r'^[A-Za-z\.\'-]+$', w) for w in words)
                    if all_alpha:
                        # Exclude state/authority words
                        state_words = {"REPUBLIC", "STATE", "DEPARTMENT", "COLLEGE", "UNIVERSITY", "STUDENT", "IDENTITY", "DRIVER", "LICENSE", "LICENCE", "UNION", "AUTHORITY"}
                        if not any(w.upper() in state_words for w in words):
                            avg_conf = float(np.mean([t["conf"] for t in line]))
                            cand_bbox = make_merged_bbox(line)
                            # Score higher if in upper demographic zone
                            zone_score = 100.0 - abs(line_y - (0.35 * h)) * 0.1
                            candidate_names.append((line_clean, avg_conf, cand_bbox, zone_score))

            if candidate_names:
                # Pick the best candidate
                candidate_names.sort(key=lambda c: (c[3], c[1]), reverse=True)
                best_name, best_conf, best_bbox, _ = candidate_names[0]
                parsed["Full Name"] = {
                    "value": best_name,
                    "confidence": best_conf,
                    "bbox": best_bbox
                }
                print(f"[OCR Token Parsing] Mapped 'Full Name' via prominent text fallback: '{best_name}' ({best_conf:.1f}%)")

        # -------------------------------------------------------------
        # PASS 4: Date Regex search for any dates not yet mapped
        # -------------------------------------------------------------
        date_regex = re.compile(r'\b(\d{4}[-/.]\d{2}[-/.]\d{2}|\d{2}[-/.]\d{2}[-/.]\d{4})\b')
        unassigned_dates: List[Tuple[str, Dict[str, Any]]] = []
        for token in sorted(tokens, key=lambda t: (t["min_y"], t["min_x"])):
            for d in date_regex.findall(token["text"]):
                unassigned_dates.append((d, token))

        for date_str, d_tok in unassigned_dates:
            for f_name, keywords in [
                ("Date of Birth", ["BIRTH", "DOB", "NAISSANCE", "NACIMIENTO", "NATAL"]),
                ("Issue Date", ["ISSUE", "ISSUED", "EMISSION", "EXPEDICION"]),
                ("Expiry Date", ["EXPIRY", "EXPIRES", "EXP", "EXPIRATION", "VENCIMIENTO", "VALID"])
            ]:
                if parsed[f_name]["value"] == "Not detected":
                    nearby = any(
                        any(k in t["text"].upper() for k in keywords)
                        for t in tokens
                        if abs(t["center_y"] - d_tok["center_y"]) < 65
                    )
                    if nearby:
                        parsed[f_name] = {
                            "value": date_str,
                            "confidence": d_tok["conf"],
                            "bbox": d_tok["bbox"]
                        }
                        print(f"[OCR Token Parsing] Mapped '{f_name}' via proximity to keyword: '{date_str}'")

        # -------------------------------------------------------------
        # PASS 5: ID Number regex fallback if still missing
        # -------------------------------------------------------------
        if parsed["ID Number"]["value"] == "Not detected":
            id_patterns = [
                re.compile(r'\b([A-Z0-9]{2,6}-[0-9A-Z]{4,10}(?:-[0-9A-Z]{2,6})?)\b'),
                re.compile(r'\b([A-Z]{1,4}[0-9]{5,12})\b'),
                re.compile(r'\b([A-Z]{3,4}-[0-9]{4,6}-[0-9]{4,6})\b'),
                re.compile(r'\b([0-9]{4}\s[0-9]{4}\s[0-9]{4})\b')  # 12-digit standard ID
            ]
            for token in sorted(tokens, key=lambda t: (t["min_y"], t["min_x"])):
                if is_boilerplate(token["text"]):
                    continue
                for pat in id_patterns:
                    m = pat.search(token["text"])
                    if m:
                        matched_id = m.group(1).strip()
                        if not re.match(r'^\d{2}[-/.]\d{2}[-/.]\d{4}$', matched_id):
                            parsed["ID Number"] = {
                                "value": matched_id,
                                "confidence": token["conf"],
                                "bbox": token["bbox"]
                            }
                            print(f"[OCR Token Parsing] Mapped 'ID Number' via regex fallback: '{matched_id}'")
                            break
                if parsed["ID Number"]["value"] != "Not detected":
                    break

        # -------------------------------------------------------------
        # PASS 6: Quality filter - flag very low confidence detections (< 35%)
        # -------------------------------------------------------------
        for fn, fd in parsed.items():
            if fd["value"] != "Not detected" and 0.0 < fd["confidence"] < 35.0:
                fd["value"] = "Low OCR confidence"

        return parsed

    @classmethod
    def parse_document_fields(cls, img_rgb: np.ndarray, metadata_hint: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Parses key demographic fields from document.
        - For explicit demo specimens (metadata_hint provided): Uses specimen metadata.
        - For normal uploads/captures (metadata_hint is None): Extracts fields ONLY from the current uploaded image.
          Never invents or substitutes demo identities.
        """
        h, w = img_rgb.shape[:2]
        fields: List[ExtractedField] = []
        findings: List[Finding] = []

        # -------------------------------------------------------------
        # 1. EXPLICIT DEMO SPECIMEN PRESET
        # -------------------------------------------------------------
        if metadata_hint and "fields" in metadata_hint:
            raw_fields = metadata_hint["fields"]
            for f in raw_fields:
                bbox_data = f.get("bbox", [int(w*0.45), int(h*0.35), int(w*0.35), int(h*0.06)])
                fields.append(ExtractedField(
                    field_name=f["name"],
                    value=f["value"],
                    confidence=f.get("confidence", 98.0),
                    bounding_box=BoundingBox(
                        x=bbox_data[0],
                        y=bbox_data[1],
                        width=bbox_data[2],
                        height=bbox_data[3]
                    ),
                    is_validated=True
                ))

            print(f"[OCRService] Loaded {len(fields)} fields from explicit demo specimen preset.")
            findings.append(Finding(
                id="ocr_specimen_preset",
                category="OCR",
                title="Synthetic Specimen Demographic Preset Loaded",
                description=f"Standard demo credential loaded across {len(fields)} demographic fields.",
                severity=FindingSeverity.INFO,
                confidence=98.0,
                signal_source="OCR_SPECIMEN_PRESET"
            ))
            return {
                "fields": fields,
                "ocr_score": 0.0,
                "findings": findings,
                "engine_used": "IDShield-SpecimenPreset v1.0"
            }

        # -------------------------------------------------------------
        # 2. LIVE DOCUMENT / CAMERA CAPTURE OCR EXTRACTION
        # -------------------------------------------------------------
        tokens, engine_used = cls._extract_via_pattern_or_ocr(img_rgb)
        print(f"[STAGE 1: OCR Raw Text] Engine: {engine_used}, Token count: {len(tokens)}")
        print(f"[STAGE 1: OCR Raw Text] Tokens: " + " | ".join([f"'{t['text']}' ({t['conf']:.0f}%)" for t in tokens]))

        parsed_dict = cls._parse_tokens_into_fields(tokens, h, w)

        # Standard core demographic fields
        core_fields = ["Full Name", "ID Number", "Date of Birth", "Issue Date", "Expiry Date"]
        # Include Address, Nationality, Gender, Document Type if detected on document
        eval_fields = list(core_fields)
        for opt_field in ["Address", "Nationality", "Gender", "Document Type"]:
            if parsed_dict.get(opt_field, {}).get("value") not in ["Not detected", None, "Low OCR confidence"]:
                eval_fields.append(opt_field)

        detected_count = 0
        conf_sum = 0.0
        missing_field_names = []

        for field_name in eval_fields:
            f_info = parsed_dict.get(field_name, {"value": "Not detected", "confidence": 0.0, "bbox": None})
            val = f_info["value"]
            conf = f_info["confidence"]
            bbox_coords = f_info["bbox"]

            is_valid_detected = val not in ["Not detected", "Low OCR confidence"]

            if is_valid_detected:
                detected_count += 1
                conf_sum += conf
                bbox_obj = BoundingBox(
                    x=bbox_coords[0],
                    y=bbox_coords[1],
                    width=bbox_coords[2],
                    height=bbox_coords[3]
                ) if bbox_coords else None
            else:
                if field_name in core_fields:
                    missing_field_names.append(field_name)
                bbox_obj = None

            fields.append(ExtractedField(
                field_name=field_name,
                value=val,
                confidence=conf if is_valid_detected else 0.0,
                bounding_box=bbox_obj,
                is_validated=is_valid_detected
            ))

        print(f"[STAGE 2: Backend Parsed Fields] Extracted {detected_count}/{len(eval_fields)} fields from live image:")
        for f in fields:
            print(f"  -> {f.field_name}: '{f.value}' (confidence: {f.confidence:.1f}%)")

        # Compute OCR penalty based on standard core fields
        core_detected = sum(1 for f in fields if f.field_name in core_fields and f.is_validated)
        if core_detected == len(core_fields):
            ocr_penalty = 0.0
            avg_conf = conf_sum / max(1, detected_count)
            findings.append(Finding(
                id="ocr_extracted_fields",
                category="OCR",
                title="Demographic Fields Successfully Parsed",
                description=f"High-confidence OCR read achieved across demographic fields (average confidence {avg_conf:.1f}%).",
                severity=FindingSeverity.INFO,
                confidence=round(avg_conf, 1),
                signal_source="OCR_FIELD_PARSER_SUCCESS"
            ))
        elif core_detected > 0:
            ocr_penalty = float(len(missing_field_names) * 12.0)
            avg_conf = conf_sum / max(1, detected_count)
            findings.append(Finding(
                id="ocr_extracted_fields_partial",
                category="OCR",
                title="Partial Demographic Field Recognition",
                description=(f"Extracted {core_detected} of {len(core_fields)} core demographic fields from current document. "
                             f"Undetected fields: {', '.join(missing_field_names)}."),
                severity=FindingSeverity.WARNING,
                confidence=round(avg_conf, 1),
                signal_source="OCR_FIELD_PARSER_PARTIAL"
            ))
        else:
            ocr_penalty = 65.0
            findings.append(Finding(
                id="ocr_no_fields_detected",
                category="OCR",
                title="No Demographic Fields Confidently Detected",
                description="Optical character recognition could not detect legible identity fields on the uploaded image. Check document focus and lighting.",
                severity=FindingSeverity.WARNING,
                confidence=70.0,
                signal_source="OCR_FIELD_PARSER_NONE"
            ))

        return {
            "fields": fields,
            "ocr_score": ocr_penalty,
            "findings": findings,
            "engine_used": engine_used
        }
