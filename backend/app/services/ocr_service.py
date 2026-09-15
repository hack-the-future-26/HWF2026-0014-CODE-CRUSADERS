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
                r'(?:^|[\s\.\:\-\#])(?:ISSUE\s*DATE|DATE\s*OF\s*ISSUE|ISSUED\b|ISS\.?\s*DATE|ISSUE\b|DATE\s*D[\'’]EMISSION|FECHA\s*DE\s*EXPEDICION)',
            ],
            "Expiry Date": [
                r'(?:^|[\s\.\:\-\#])(?:EXPIRY\s*DATE|EXPIRATION\s*DATE|EXPIRES\b|EXP\.?\s*DATE|EXPIRY\b|EXP\b|VALID\s*(?:UNTIL|THRU|TO)|FECHA\s*DE\s*VENCIMIENTO|EXPIRATION\b)',
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
            return [int(x1), int(y1), int(max(1, x2 - x1)), int(max(1, y2 - y1))]

        # Ensure spatial boundary coordinates on all tokens
        for line in lines:
            for t in line:
                if "min_x" not in t:
                    t["min_x"] = t["bbox"][0]
                if "min_y" not in t:
                    t["min_y"] = t["bbox"][1]
                if "max_x" not in t:
                    t["max_x"] = t["min_x"] + t["bbox"][2]
                if "max_y" not in t:
                    t["max_y"] = t["min_y"] + t["bbox"][3]
                if "center_x" not in t:
                    t["center_x"] = (t["min_x"] + t["max_x"]) / 2.0
                if "center_y" not in t:
                    t["center_y"] = (t["min_y"] + t["max_y"]) / 2.0

        def evaluate_candidate_format(field_name: str, raw_text: str) -> Tuple[bool, float, str]:
            """
            Evaluate whether candidate text conforms to expected format for field_name.
            Returns (is_valid, format_score, normalized_value).
            """
            cleaned = raw_text.strip(" :-,#.")
            if not cleaned:
                return False, -100.0, ""

            if is_any_label(cleaned):
                return False, -100.0, cleaned

            if is_boilerplate(cleaned):
                return False, -100.0, cleaned

            if field_name == "Full Name":
                # Separate camelCase (e.g. LaxmiSingh -> Laxmi Singh)
                sep = re.sub(r'([a-z])([A-Z])', r'\1 \2', cleaned)
                # Remove stray characters except letters, apostrophes, hyphens, spaces, periods
                clean_name = re.sub(r'[^A-Za-z\s\.\'-]', '', sep).strip()
                # Names cannot contain digits, emails, or web urls
                if re.search(r'[\d@]|https?://|www\.', cleaned):
                    return False, -100.0, clean_name
                words = [w for w in clean_name.split() if len(w) >= 2]
                if not words:
                    return False, -100.0, clean_name
                # Must be primarily alphabetic
                if not all(re.match(r"^[A-Za-z\.\'-]+$", w) for w in words):
                    return False, -80.0, clean_name
                # Exclude administrative/governmental keywords
                state_words = {
                    "REPUBLIC", "STATE", "DEPARTMENT", "COLLEGE", "UNIVERSITY", "GOVERNMENT",
                    "IDENTITY", "CARD", "DRIVER", "LICENSE", "LICENCE", "UNION", "AUTHORITY",
                    "NATIONAL", "OFFICIAL", "SPECIMEN", "SAMPLE", "DEMO", "PERMIT"
                }
                if any(w.upper() in state_words for w in words):
                    return False, -100.0, clean_name

                # 2 to 5 alphabetic words
                if 2 <= len(words) <= 5:
                    return True, 45.0, clean_name
                elif len(words) == 1:
                    if len(words[0]) >= 3:
                        return True, 15.0, clean_name
                    return False, -30.0, clean_name
                else:
                    return False, -50.0, clean_name

            elif field_name in ("Date of Birth", "Issue Date", "Expiry Date"):
                # Supported formats: DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY, YYYY-MM-DD
                m_ymd = re.search(r'\b(19\d{2}|20\d{2})[-/.](0?[1-9]|1[012])[-/.](0?[1-9]|[12][0-9]|3[01])\b', cleaned)
                m_dmy = re.search(r'\b(0?[1-9]|[12][0-9]|3[01])[-/.](0?[1-9]|1[012])[-/.](19\d{2}|20\d{2})\b', cleaned)

                if m_ymd:
                    y, m, d = m_ymd.group(1), int(m_ymd.group(2)), int(m_ymd.group(3))
                    return True, 45.0, f"{y}-{m:02d}-{d:02d}"
                elif m_dmy:
                    d, m, y = int(m_dmy.group(1)), int(m_dmy.group(2)), m_dmy.group(3)
                    return True, 45.0, f"{y}-{m:02d}-{d:02d}"
                else:
                    return False, -80.0, cleaned

            elif field_name == "ID Number":
                # Must not be a date
                if re.search(r'^\d{2,4}[-/.]\d{2}[-/.]\d{2,4}$', cleaned):
                    return False, -90.0, cleaned
                clean_id = re.sub(r'[^A-Z0-9\-\s]', '', cleaned.upper()).strip()
                if len(clean_id) < 4:
                    return False, -60.0, clean_id
                id_patterns = [
                    r'^[A-Z0-9]{2,6}-[0-9A-Z]{4,12}(?:-[0-9A-Z]{2,6})?$',
                    r'^[A-Z]{1,4}[0-9]{5,12}$',
                    r'^[A-Z]{3,4}-[0-9]{4,6}-[0-9]{4,6}$',
                    r'^\d{4}\s\d{4}\s\d{4}$',
                    r'^[A-Z0-9]{5,18}$'
                ]
                has_digit = any(c.isdigit() for c in clean_id)
                if any(re.match(p, clean_id) for p in id_patterns) and has_digit:
                    return True, 45.0, clean_id
                elif has_digit and len(clean_id) >= 4:
                    return True, 35.0, clean_id
                else:
                    return False, -50.0, clean_id

            elif field_name == "Gender":
                u = cleaned.upper().strip(" .:")
                if u in {"M", "F", "MALE", "FEMALE", "OTHER"}:
                    return True, 45.0, u
                if u in {"M/", "/M", "F/", "/F"}:
                    return True, 35.0, "M" if "M" in u else "F"
                return False, -50.0, cleaned

            elif field_name == "Nationality":
                sep = re.sub(r'([a-z])([A-Z])', r'\1 \2', cleaned)
                clean_nat = re.sub(r'[^A-Za-z\s]', '', sep).strip()
                words = clean_nat.split()
                if 1 <= len(words) <= 3 and all(len(w) >= 2 for w in words):
                    return True, 40.0, clean_nat
                return False, -40.0, cleaned

            elif field_name == "Address":
                sep = re.sub(r'([a-z])([A-Z])', r'\1 \2', cleaned)
                sep = re.sub(r'([0-9])([A-Za-z])', r'\1 \2', sep)
                sep = re.sub(r'([A-Za-z])([0-9])', r'\1 \2', sep)
                clean_addr = re.sub(r'[^A-Za-z0-9\s\.\,\#\/\-]', '', sep).strip()
                if len(clean_addr) >= 5:
                    return True, 35.0, clean_addr
                return False, -40.0, cleaned

            elif field_name == "Document Type":
                if len(cleaned) >= 3:
                    return True, 30.0, cleaned
                return False, -30.0, cleaned

            return True, 20.0, cleaned

        # -------------------------------------------------------------
        # PASS 1: Spatial / Line-Aware Candidate Scoring & Field Extraction
        # -------------------------------------------------------------
        # Step 1.1: Locate all labels on each line
        label_occurrences = []
        for line_idx, line in enumerate(lines):
            line_text = " ".join(t["text"].strip() for t in line)
            line_upper = line_text.upper()

            for f_name, patterns in LABEL_PATTERNS.items():
                for pat in patterns:
                    for m in re.finditer(pat, line_upper):
                        matched_start = m.start()
                        matched_end = m.end()

                        # Map character offsets to tokens in this line
                        char_count = 0
                        start_tok_idx = 0
                        end_tok_idx = 0
                        inline_remainder = ""

                        for idx, tok in enumerate(line):
                            tok_len = len(tok["text"])
                            tok_start = char_count
                            tok_end = char_count + tok_len

                            if tok_start <= matched_start < tok_end:
                                start_tok_idx = idx
                            if tok_start < matched_end <= tok_end:
                                end_tok_idx = idx
                                offset_in_tok = matched_end - tok_start
                                inline_remainder = tok["text"][offset_in_tok:].strip().lstrip(": -#.")
                                break
                            elif matched_end > tok_end and idx == len(line) - 1:
                                end_tok_idx = idx

                            char_count += tok_len + 1

                        label_toks = line[start_tok_idx:end_tok_idx + 1]
                        l_bbox = make_merged_bbox(label_toks)

                        label_occurrences.append({
                            "field_name": f_name,
                            "pattern": pat,
                            "line_idx": line_idx,
                            "start_tok_idx": start_tok_idx,
                            "end_tok_idx": end_tok_idx,
                            "inline_remainder": inline_remainder,
                            "bbox": l_bbox,
                            "min_x": l_bbox[0],
                            "max_x": l_bbox[0] + l_bbox[2],
                            "min_y": l_bbox[1],
                            "max_y": l_bbox[1] + l_bbox[3],
                            "center_x": l_bbox[0] + l_bbox[2] / 2.0,
                            "center_y": l_bbox[1] + l_bbox[3] / 2.0,
                        })

        # Step 1.2: For each field, evaluate spatial candidates for its detected labels
        field_best_candidates: Dict[str, Dict[str, Any]] = {}

        for loc in label_occurrences:
            f_name = loc["field_name"]
            line_idx = loc["line_idx"]
            line = lines[line_idx]
            end_tok_idx = loc["end_tok_idx"]
            inline_rem = loc["inline_remainder"]
            label_max_x = loc["max_x"]
            label_min_x = loc["min_x"]
            label_center_x = loc["center_x"]
            label_center_y = loc["center_y"]

            # Right boundary on the same line (if another label starts to the right)
            same_line_other_labels = [
                other for other in label_occurrences
                if other["line_idx"] == line_idx and other["start_tok_idx"] > end_tok_idx
            ]
            same_line_right_limit_x = min([o["min_x"] for o in same_line_other_labels], default=w)

            candidates_for_label = []

            # --- Candidate A: Same-Line Candidates ---
            same_line_toks = []
            for tok_idx in range(end_tok_idx + 1, len(line)):
                tok = line[tok_idx]
                if tok["min_x"] >= same_line_right_limit_x:
                    break
                if is_any_label(tok["text"]):
                    break
                if not is_boilerplate(tok["text"]):
                    same_line_toks.append(tok)

            val_token_groups = []
            if inline_rem and not is_boilerplate(inline_rem):
                inline_tok = {
                    "text": inline_rem,
                    "conf": line[end_tok_idx]["conf"],
                    "min_x": label_max_x - 5,
                    "min_y": loc["min_y"],
                    "max_x": label_max_x + 50,
                    "max_y": loc["max_y"],
                    "bbox": [label_max_x - 5, loc["min_y"], 55, loc["bbox"][3]],
                    "center_x": label_max_x + 25,
                    "center_y": label_center_y
                }
                # Group 1: inline remainder + following tokens
                val_token_groups.append(([inline_tok] + same_line_toks, True))
                # Group 2: inline remainder alone
                if same_line_toks:
                    val_token_groups.append(([inline_tok], True))
            elif same_line_toks:
                val_token_groups.append((same_line_toks, False))

            for cand_toks, is_inline in val_token_groups:
                raw_cand_text = " ".join(t["text"].strip() for t in cand_toks).strip(" :-,#.")
                if not raw_cand_text:
                    continue
                is_valid, format_score, norm_val = evaluate_candidate_format(f_name, raw_cand_text)
                c_bbox = make_merged_bbox(cand_toks)
                c_min_x = c_bbox[0]
                c_conf = float(np.mean([t["conf"] for t in cand_toks]))

                score = 0.0
                # 1. Same-line relationship bonus
                score += 40.0 if is_inline else 35.0

                # 2. Horizontal distance from label
                dx = c_min_x - label_max_x
                if 0 <= dx <= 200:
                    score += 10.0
                elif dx > 200:
                    score -= 0.05 * (dx - 200)
                elif dx < 0:
                    score -= 30.0

                # 3. Vertical distance (same line)
                score += 10.0

                # 4. OCR confidence
                score += 0.15 * c_conf

                # 5. Format validation score
                score += format_score

                # 6. Label overlap penalty
                if any(is_any_label(t["text"]) for t in cand_toks):
                    score -= 100.0

                # 7. Boilerplate penalty
                if any(is_boilerplate(t["text"]) for t in cand_toks):
                    score -= 100.0

                candidates_for_label.append({
                    "text": norm_val,
                    "confidence": c_conf,
                    "bbox": c_bbox,
                    "score": score,
                    "is_valid": is_valid,
                    "rel": "same-line"
                })

            # --- Candidate B: Next-Line Candidates ---
            # Evaluated especially when label has no inline value or stands alone on line
            next_line_indices = [line_idx + 1]
            if line_idx + 2 < len(lines):
                # If line_idx + 1 is just another label without values, also check line_idx + 2
                next_line_indices.append(line_idx + 2)

            for n_idx in next_line_indices:
                if n_idx >= len(lines):
                    break
                target_next_line = lines[n_idx]
                col_min_x = max(0, label_min_x - 80)
                col_max_x = same_line_right_limit_x if same_line_right_limit_x < w else w

                next_toks = []
                for tok in target_next_line:
                    if col_min_x <= tok["center_x"] <= col_max_x:
                        if is_any_label(tok["text"]):
                            break
                        if not is_boilerplate(tok["text"]):
                            next_toks.append(tok)

                if next_toks:
                    # For Address: check if following line also continues address
                    if f_name == "Address" and n_idx + 1 < len(lines):
                        for extra_idx in range(n_idx + 1, min(n_idx + 3, len(lines))):
                            extra_line = lines[extra_idx]
                            extra_y = sum(t["center_y"] for t in extra_line) / len(extra_line)
                            if extra_y > (0.78 * h):
                                break
                            extra_text = " ".join(t["text"].strip() for t in extra_line)
                            if is_any_label(extra_text) or is_boilerplate(extra_text):
                                break
                            if re.search(r'\b\d{2}[-/.]\d{2}[-/.]\d{4}\b', extra_text):
                                break
                            for tok in extra_line:
                                if not is_boilerplate(tok["text"]) and not is_any_label(tok["text"]):
                                    next_toks.append(tok)

                    raw_cand_text = " ".join(t["text"].strip() for t in next_toks).strip(" :-,#.")
                    if raw_cand_text:
                        is_valid, format_score, norm_val = evaluate_candidate_format(f_name, raw_cand_text)
                        c_bbox = make_merged_bbox(next_toks)
                        c_min_x = c_bbox[0]
                        c_center_y = c_bbox[1] + c_bbox[3] / 2.0
                        c_conf = float(np.mean([t["conf"] for t in next_toks]))

                        score = 0.0
                        # 1. Next-line relationship bonus (preferred when no same-line value)
                        score += 32.0 if not val_token_groups else 20.0

                        # 2. Horizontal distance / column alignment
                        dx = abs(c_min_x - label_min_x)
                        if dx <= 80:
                            score += 15.0
                        elif dx <= 180:
                            score += 5.0
                        else:
                            score -= 0.1 * (dx - 180)

                        # 3. Vertical distance from label
                        dy = abs(c_center_y - label_center_y)
                        line_h = max(15.0, avg_h)
                        if 0.6 * line_h <= dy <= 2.2 * line_h:
                            score += 10.0
                        else:
                            score -= 8.0 * (dy / line_h)

                        # 4. OCR confidence
                        score += 0.15 * c_conf

                        # 5. Format validation score
                        score += format_score

                        # 6. Other label penalty
                        if any(is_any_label(t["text"]) for t in next_toks):
                            score -= 100.0

                        # 7. Boilerplate penalty
                        if any(is_boilerplate(t["text"]) for t in next_toks):
                            score -= 100.0

                        candidates_for_label.append({
                            "text": norm_val,
                            "confidence": c_conf,
                            "bbox": c_bbox,
                            "score": score,
                            "is_valid": is_valid,
                            "rel": f"next-line(+{n_idx - line_idx})"
                        })

            # Pick the best valid candidate for this label
            valid_candidates = [c for c in candidates_for_label if c["is_valid"] and c["score"] >= 35.0]
            if valid_candidates:
                valid_candidates.sort(key=lambda c: c["score"], reverse=True)
                best_c = valid_candidates[0]
                # Compare against any existing candidate for this field
                if f_name not in field_best_candidates or best_c["score"] > field_best_candidates[f_name]["score"]:
                    field_best_candidates[f_name] = best_c

        # Assign parsed fields from winning spatial candidates
        for f_name, cand in field_best_candidates.items():
            parsed[f_name] = {
                "value": cand["text"],
                "confidence": cand["confidence"],
                "bbox": cand["bbox"]
            }
            print(f"[OCR Spatial Scoring] Assigned '{f_name}' ({cand['rel']}): '{cand['text']}' (score: {cand['score']:.1f}, conf: {cand['confidence']:.1f}%)")

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
                        elif clean_name.replace(" ", "").upper() == parsed["Full Name"]["value"].replace(" ", "").upper():
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
            # Inspect lines in the demographic zone (between 12% and 75% of document height)
            candidate_names: List[Tuple[str, float, List[int], float]] = []  # (text, conf, bbox, score)
            for line in lines:
                line_y = sum(t["center_y"] for t in line) / len(line)
                if not (0.12 * h <= line_y <= 0.75 * h):
                    continue

                line_text = " ".join(t["text"].strip() for t in line).strip(" :-,#")
                line_upper = line_text.upper()

                # Skip if matches any known label or boilerplate
                if is_any_label(line_upper) or is_boilerplate(line_upper):
                    continue

                is_valid_name, format_score, clean_name = evaluate_candidate_format("Full Name", line_text)
                if is_valid_name:
                    avg_conf = float(np.mean([t["conf"] for t in line]))
                    cand_bbox = make_merged_bbox(line)
                    zone_score = 100.0 - abs(line_y - (0.35 * h)) * 0.1 + format_score
                    candidate_names.append((clean_name, avg_conf, cand_bbox, zone_score))

            if candidate_names:
                candidate_names.sort(key=lambda c: (c[3], c[1]), reverse=True)
                best_name, best_conf, best_bbox, _ = candidate_names[0]
                parsed["Full Name"] = {
                    "value": best_name,
                    "confidence": best_conf,
                    "bbox": best_bbox
                }
                print(f"[OCR Token Parsing] Mapped 'Full Name' via prominent text fallback: '{best_name}' ({best_conf:.1f}%)")

        # -------------------------------------------------------------
        # PASS 4: Date Regex search with Spatial Keyword Proximity
        # -------------------------------------------------------------
        date_regex = re.compile(r'\b(\d{4}[-/.]\d{2}[-/.]\d{2}|\d{2}[-/.]\d{2}[-/.]\d{4})\b')
        unassigned_dates: List[Tuple[str, Dict[str, Any]]] = []
        for token in sorted(tokens, key=lambda t: (t["min_y"], t["min_x"])):
            for d in date_regex.findall(token["text"]):
                unassigned_dates.append((d, token))

        date_keywords_map = [
            ("Date of Birth", ["BIRTH", "DOB", "NAISSANCE", "NACIMIENTO", "NATAL"]),
            ("Issue Date", ["ISSUE", "ISSUED", "EMISSION", "EXPEDICION"]),
            ("Expiry Date", ["EXPIRY", "EXPIRES", "EXP", "EXPIRATION", "VENCIMIENTO", "VALID"])
        ]

        assigned_date_tokens = set()
        for date_idx, (date_str, d_tok) in enumerate(unassigned_dates):
            if date_idx in assigned_date_tokens:
                continue
            _, _, norm_date = evaluate_candidate_format("Date of Birth", date_str)
            for f_name, keywords in date_keywords_map:
                if parsed[f_name]["value"] == "Not detected":
                    best_kw_dist = float("inf")
                    for t in tokens:
                        if any(k in t["text"].upper() for k in keywords):
                            dy = abs(t["center_y"] - d_tok["center_y"])
                            dx = abs(t["center_x"] - d_tok["center_x"])
                            if dy < 70 and dx < 400:
                                dist = dx + 2.0 * dy
                                if dist < best_kw_dist:
                                    best_kw_dist = dist
                    if best_kw_dist < 350:
                        parsed[f_name] = {
                            "value": norm_date,
                            "confidence": d_tok["conf"],
                            "bbox": d_tok["bbox"]
                        }
                        assigned_date_tokens.add(date_idx)
                        print(f"[OCR Token Parsing] Mapped '{f_name}' via proximity to keyword: '{norm_date}'")
                        break

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
                        is_valid, _, norm_id = evaluate_candidate_format("ID Number", matched_id)
                        if is_valid:
                            parsed["ID Number"] = {
                                "value": norm_id,
                                "confidence": token["conf"],
                                "bbox": token["bbox"]
                            }
                            print(f"[OCR Token Parsing] Mapped 'ID Number' via regex fallback: '{norm_id}'")
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
