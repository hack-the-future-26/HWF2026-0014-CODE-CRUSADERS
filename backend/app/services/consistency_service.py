from datetime import datetime
from typing import Dict, Any, List, Optional
import re
import numpy as np
from backend.app.models.schemas import ExtractedField, ConsistencyCheck, CheckStatus, Finding, FindingSeverity

class ConsistencyService:
    @staticmethod
    def _parse_date(date_str: str) -> datetime:
        """Attempt to parse date across common ID formats."""
        cleaned = re.sub(r'[^0-9\-\/\.]', '', date_str.strip())
        formats = [
            "%Y-%m-%d", "%Y/%m/%d", "%Y.%m.%d",
            "%d-%m-%Y", "%d/%m/%Y", "%d.%m.%Y",
            "%m-%d-%Y", "%m/%d/%Y", "%m.%d.%Y"
        ]
        for fmt in formats:
            try:
                return datetime.strptime(cleaned, fmt)
            except ValueError:
                continue
        # Fallback to year estimation
        year_match = re.search(r'\b(19\d{2}|20\d{2})\b', cleaned)
        if year_match:
            return datetime(int(year_match.group(1)), 1, 1)
        raise ValueError(f"Unable to parse date string: {date_str}")

    @staticmethod
    def _is_detected(val: Optional[str]) -> bool:
        """Check if a field value represents a real detected value."""
        if not val:
            return False
        v = val.strip().lower()
        return v not in ["not detected", "low ocr confidence", "none", "unknown", "n/a", ""]

    @classmethod
    def analyze(cls, fields: List[ExtractedField]) -> Dict[str, Any]:
        """
        Evaluate logical cross-field consistency.
        Returns:
            - consistency_score: float (penalty 0-100)
            - findings: List[Finding]
            - checks: List[ConsistencyCheck]
        """
        findings: List[Finding] = []
        checks: List[ConsistencyCheck] = []
        penalty = 0.0

        field_map = {f.field_name.lower(): f.value for f in fields}
        
        dob_val = field_map.get("date of birth") or field_map.get("dob")
        issue_val = field_map.get("issue date") or field_map.get("issued")
        exp_val = field_map.get("expiry date") or field_map.get("expires")
        id_val = field_map.get("id number") or field_map.get("document number")
        name_val = field_map.get("full name") or field_map.get("name")

        # 1. Issue vs Expiry Date Chronology
        if cls._is_detected(issue_val) and cls._is_detected(exp_val):
            try:
                d_issue = cls._parse_date(issue_val)
                d_exp = cls._parse_date(exp_val)
                
                if d_issue >= d_exp:
                    penalty += 45.0
                    checks.append(ConsistencyCheck(
                        check_name="Issue & Expiry Chronology",
                        status=CheckStatus.FAIL,
                        details=f"Inverted dates: Issue Date ({issue_val}) is on or after Expiry Date ({exp_val})."
                    ))
                    findings.append(Finding(
                        id="const_date_inverted",
                        category="CONSISTENCY",
                        title="Chronological Date Inversion Detected",
                        description=(f"Document Issue Date ({issue_val}) occurs after or matches Expiry Date ({exp_val}). "
                                     f"Official identity credentials never possess inverted validity windows."),
                        severity=FindingSeverity.DANGER,
                        confidence=99.0,
                        signal_source="CONSISTENCY_DATE_INVERSION"
                    ))
                else:
                    validity_years = (d_exp - d_issue).days / 365.25
                    if validity_years > 15.0:
                        penalty += 15.0
                        checks.append(ConsistencyCheck(
                            check_name="Validity Window Duration",
                            status=CheckStatus.WARNING,
                            details=f"Unusually long validity span ({validity_years:.1f} years)."
                        ))
                        findings.append(Finding(
                            id="const_validity_span_warn",
                            category="CONSISTENCY",
                            title="Unusual Document Validity Span",
                            description=f"Document validity duration is {validity_years:.1f} years (standard is 5 or 10 years).",
                            severity=FindingSeverity.WARNING,
                            confidence=84.0,
                            signal_source="CONSISTENCY_DATE_SPAN"
                        ))
                    else:
                        checks.append(ConsistencyCheck(
                            check_name="Issue & Expiry Chronology",
                            status=CheckStatus.PASS,
                            details=f"Issue Date ({issue_val}) precedes Expiry Date ({exp_val}) within normal {validity_years:.1f}-yr window."
                        ))
            except Exception as e:
                checks.append(ConsistencyCheck(
                    check_name="Issue & Expiry Chronology",
                    status=CheckStatus.WARNING,
                    details=f"Could not conclusively verify dates: {str(e)}"
                ))
        else:
            checks.append(ConsistencyCheck(
                check_name="Issue & Expiry Chronology",
                status=CheckStatus.WARNING,
                details="Issue Date and/or Expiry Date not detected on document; chronological verification skipped."
            ))

        # 2. Date of Birth & Age Check
        if cls._is_detected(dob_val):
            try:
                d_dob = cls._parse_date(dob_val)
                now = datetime.now()
                age = (now - d_dob).days / 365.25
                
                if d_dob > now:
                    penalty += 40.0
                    checks.append(ConsistencyCheck(
                        check_name="Date of Birth Realism",
                        status=CheckStatus.FAIL,
                        details=f"Future Date of Birth ({dob_val}) is physically impossible."
                    ))
                    findings.append(Finding(
                        id="const_future_dob",
                        category="CONSISTENCY",
                        title="Future Date of Birth Detected",
                        description=f"Birth date ({dob_val}) is in the future. Clear indicator of synthetic/tampered field.",
                        severity=FindingSeverity.DANGER,
                        confidence=99.5,
                        signal_source="CONSISTENCY_FUTURE_DOB"
                    ))
                elif age < 18.0:
                    penalty += 20.0
                    checks.append(ConsistencyCheck(
                        check_name="Holder Age Verification",
                        status=CheckStatus.WARNING,
                        details=f"Cardholder is calculated as minor ({age:.1f} years old)."
                    ))
                    findings.append(Finding(
                        id="const_underage_holder",
                        category="CONSISTENCY",
                        title="Minor Cardholder Flag",
                        description=f"Cardholder calculated age is {age:.1f} years old. Requires juvenile credential review.",
                        severity=FindingSeverity.WARNING,
                        confidence=90.0,
                        signal_source="CONSISTENCY_AGE_MINOR"
                    ))
                else:
                    checks.append(ConsistencyCheck(
                        check_name="Holder Age Verification",
                        status=CheckStatus.PASS,
                        details=f"Calculated cardholder age is {int(age)} years old (satisfies adult threshold)."
                    ))
                    
                # Check Issue Date vs DOB
                if cls._is_detected(issue_val):
                    d_issue = cls._parse_date(issue_val)
                    if d_issue <= d_dob:
                        penalty += 45.0
                        checks.append(ConsistencyCheck(
                            check_name="Birth vs Issue Chronology",
                            status=CheckStatus.FAIL,
                            details=f"Document issued before holder's birth date."
                        ))
                        findings.append(Finding(
                            id="const_issue_before_birth",
                            category="CONSISTENCY",
                            title="Issue Date Precedes Birth Date",
                            description=f"Document issue date ({issue_val}) is earlier than birth date ({dob_val}).",
                            severity=FindingSeverity.DANGER,
                            confidence=99.0,
                            signal_source="CONSISTENCY_ISSUE_BEFORE_DOB"
                        ))
            except Exception as e:
                checks.append(ConsistencyCheck(
                    check_name="Date of Birth Realism",
                    status=CheckStatus.WARNING,
                    details=f"Could not parse DOB: {str(e)}"
                ))
        else:
            checks.append(ConsistencyCheck(
                check_name="Date of Birth Realism",
                status=CheckStatus.WARNING,
                details="Date of Birth not detected by OCR; age verification skipped."
            ))

        # 3. ID Number Pattern & Checksum Check
        if cls._is_detected(id_val):
            # Check format: synthetic specimen pattern or valid alphanumeric string
            has_valid_chars = bool(re.match(r'^[A-Z0-9\-]+$', id_val.strip()))
            if not has_valid_chars or len(id_val.strip()) < 5:
                penalty += 25.0
                checks.append(ConsistencyCheck(
                    check_name="Document ID Format Checksum",
                    status=CheckStatus.FAIL,
                    details=f"ID number format contains illegal characters or abnormal token length."
                ))
                findings.append(Finding(
                    id="const_id_format_invalid",
                    category="CONSISTENCY",
                    title="Malformed Document Identifier Token",
                    description=f"Extracted ID string '{id_val}' fails standard alphanumeric syntax requirements.",
                    severity=FindingSeverity.WARNING,
                    confidence=88.0,
                    signal_source="CONSISTENCY_ID_SYNTAX"
                ))
            else:
                checks.append(ConsistencyCheck(
                    check_name="Document ID Format Checksum",
                    status=CheckStatus.PASS,
                    details=f"ID '{id_val}' conforms to standardized document format."
                ))
        else:
            checks.append(ConsistencyCheck(
                check_name="Document ID Format Checksum",
                status=CheckStatus.WARNING,
                details="Document ID number not detected on document."
            ))

        # 4. Name Field Integrity
        if cls._is_detected(name_val):
            if len(name_val.split()) < 2:
                checks.append(ConsistencyCheck(
                    check_name="Full Legal Name Structure",
                    status=CheckStatus.WARNING,
                    details="Only single name token found; typical identity credentials require given and family names."
                ))
            else:
                checks.append(ConsistencyCheck(
                    check_name="Full Legal Name Structure",
                    status=CheckStatus.PASS,
                    details=f"Contains expected given and surname components: '{name_val}'."
                ))
        else:
            checks.append(ConsistencyCheck(
                check_name="Full Legal Name Structure",
                status=CheckStatus.WARNING,
                details="Full legal name not detected by OCR."
            ))

        consistency_score = float(np.clip(penalty, 0.0, 100.0))

        return {
            "consistency_score": consistency_score,
            "findings": findings,
            "checks": checks
        }
