# IDShield AI — Mobile-First Identity Document Risk Screening System

> **FIELD INSPECTION PROTOTYPE**  
> **DISCLAIMER**: IDShield AI is an AI-assisted risk-screening and decision-support prototype. It does **NOT** provide official government authentication or determine document authenticity with certainty. Testing uses synthetic specimen documents and demonstration data without real PII or protected government credentials.

---

## 1. Executive Summary & Purpose

In border control, immigration enforcement, and mobile field checkpoints, inspection officers require rapid, actionable, and explainable decision-support tools. Opaque "black-box" systems that return a binary pass/fail without context create operational bottlenecks and review uncertainty.

**IDShield AI** evolves identity document screening into a **mobile-first Android inspection tool** powered by a multi-signal forensic pipeline:

1. **Officer-First Mobile Scanning**: Native device camera viewfinder with document alignment guide HUD, animated laser sweep, and instant preview/retake/analyze flow.
2. **Computer Vision Tamper Analysis**: Detects localized compression artifacts (Error Level Analysis - ELA), focal blur disparities (Laplacian variance), noise disparity across regions, and photo perimeter cutline anomalies using OpenCV.
3. **Structural & Layout Compliance**: Evaluates card dimensions and zone placement against standard ISO/IEC 7810 ID-1 card templates.
4. **Multi-Engine OCR & Confidence Scoring**: Extracts demographic fields (`Full Name`, `ID Number`, `Date of Birth`, `Issue Date`, `Expiry Date`) with individual token confidence percentages.
5. **Cross-Field Logical Consistency Engine**: Verifies chronological date relationships (issue vs. expiry, valid age thresholds, non-future birth timestamps).
6. **Calibrated Multi-Signal Risk Score & Explainable Report**: Synthesizes forensic indicators into an objective 0–100 risk score (`LOW`, `MEDIUM`, `HIGH`) with immediate operational recommendations ("Standard Review", "Additional Review Recommended", "Manual Review Required") and human-readable "Why this result?" explanations.

---

## 2. Technology Architecture

```text
                IDShield AI
             Android Application
          React + TypeScript + Vite
                   Capacitor
                       |
                       v
                FastAPI Backend
                    Python
                       |
        +--------------+--------------+
        |              |              |
        v              v              v
       OCR        Computer        Structure
    PaddleOCR/      Vision          Analysis
     EasyOCR       OpenCV
        |              |              |
        +--------------+--------------+
                       |
                       v
              Consistency Engine
                    Python
                       |
                       v
                  Risk Engine
               Rule-based / ML-ready
                       |
                       v
               Explainable Result
                   0–100 Score