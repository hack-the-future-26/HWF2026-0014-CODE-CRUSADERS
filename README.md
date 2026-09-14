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

```
                IDShield AI
             Android Application
          React + TypeScript + Vite
                Capacitor
                    |
                    v
              FastAPI Backend
                 Python
                    |
       +------------+------------+
       |            |            |
       v            v            v
      OCR       Computer       Structure
   PaddleOCR/     Vision        Analysis
    EasyOCR       OpenCV
       |            |            |
       +------------+------------+
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
```

### Technology Stack Details

- **Frontend**:
  - React 18
  - TypeScript
  - Vite
  - Tailwind CSS
  - Capacitor (`@capacitor/core`, `@capacitor/cli`, `@capacitor/android`, `@capacitor/camera`)
  - Lucide Icons

- **Backend**:
  - Python 3.11+ / 3.12
  - FastAPI (High-performance asynchronous API)
  - Uvicorn ASGI server

- **AI & Computer Vision**:
  - OpenCV (`cv2`): Focal blur (Laplacian variance), edge detection (Canny / Sobel), contour analysis, color space conversion
  - Error Level Analysis (ELA): Recompression difference matrix for digital splicing and copy-paste detection
  - OCR Engine: PaddleOCR / EasyOCR fallback with confidence tokenization
  - Document Structure Analysis: ISO/IEC 7810 ID-1 aspect ratio conformity and functional zone segmentation (Header, Photo, Demographics, Machine Readable Zone)

- **Intelligence**:
  - Logical Consistency Engine: Multi-factor chronological date validation and checksum rules
  - Explainable Risk Engine: Calibrated weighted multi-signal fusion producing a 0–100 score and mapped findings
  - ML-Ready Architecture: Designed to incorporate trained deep-learning classifiers and edge models in future iterations *(Note: the current prototype utilizes validated rule-based heuristics and computer vision mathematics; it does not claim to execute a proprietary trained deep ML model)*

- **Database & Storage**:
  - SQLite for prototype audit history (via SQLAlchemy ORM)
  - In-memory image processing (zero persistent image storage by default)

- **Roadmap & Future Extensions**:
  - PostgreSQL for high-concurrency enterprise screening
  - On-device ML anomaly detection models (TensorFlow Lite / ONNX Runtime)
  - Edge/offline offline neural inference for remote border sectors

---

## 3. Officer-Friendly Mobile Workflow

IDShield AI is tailored specifically for field and border inspection officers who must make high-confidence screening decisions within **3 to 5 seconds**:

```
SCAN ────► ANALYZE ────► UNDERSTAND ────► REVIEW
  │           │              │              │
  ▼           ▼              ▼              ▼
Camera      Live Pipeline  0-100 Score    Standard Review /
Viewfinder  Animation      4 Signal Cards Manual Review
HUD & Guide (Real API)     Findings       Decision
```

1. **Scan Document**:
   - Tap primary **[ SCAN DOCUMENT ]** button.
   - Device camera opens with a cybersecurity dark navy alignment frame.
   - HUD guides officer: *"Align document inside the frame • Keep document flat and fully visible"*.
   - Tap capture button to freeze frame.
   - Review image preview: choose **[ Retake ]** or **[ Analyze Document ]**.
2. **Gallery / File Selection**:
   - Secondary action **[ SELECT IMAGE ]** enables testing existing high-resolution files or device gallery captures through the identical backend analysis pipeline.
3. **Sequential Pipeline Animation**:
   - Live visual status updates across:
     - ✓ Image Quality
     - ✓ OCR Extraction
     - ✓ Structure Analysis
     - ◉ Tamper Analysis
     - ○ Consistency Check
     - ○ Risk Assessment
   - Transitions directly into the real backend response upon completion.
4. **High-Impact Result View**:
   - **Prominent Risk Gauge**: e.g., `82 / 100` with clear color coding:
     - `0–29`: **LOW RISK** — *"No significant risk signals detected"* → **Standard Review**
     - `30–59`: **MEDIUM RISK** — *"Some anomalous signals detected"* → **Additional Review Recommended**
     - `60–100`: **HIGH RISK** — *"Multiple anomalous signals detected"* → **Manual Review Required**
   - **Multi-Signal 4-Card Forensic Overview**:
     - `OCR FIELD QUALITY`: Score and clarity status.
     - `TAMPER / IMAGE ANALYSIS`: Compression residual & cutline status.
     - `DOCUMENT STRUCTURE`: ISO-1 layout compliance status.
     - `LOGICAL CONSISTENCY`: Date chronology integrity.
   - **"Why this result?" Explainable Findings**: Plain-language explanations of observed physical/logical anomalies.
   - **Extracted Demographic Fields**: Clearly marked `SYNTHETIC DEMO DATA`.
   - **Technical Details Drawer**: Processing latency (ms), image resolution, signals checked, OCR telemetry.

---

## 4. Privacy, Security & Ethical Positioning

- **Assistive Decision-Support Only**: IDShield AI does not make legally binding admissibility decisions; it equips human officers with structured, objective signal indicators.
- **Zero Permanent Image Retention**: Document images uploaded or captured during screening are decoded in-memory and discarded upon pipeline completion.
- **Synthetic Demonstration Specimens**: All testing and verification utilizes synthetic card specimens with fictional identities to safeguard privacy and avoid PII exposure.
- **Local Network Safety**: The Android application communicates over secure local connections with configurable endpoints.

---

## 5. Android Application Setup & Execution

The mobile application is packaged using **Capacitor** directly from the React + TypeScript + Vite codebase.

### Package & App Identification
- **App Name**: `IDShield AI`
- **Application ID**: `com.idshieldai.app`
- **Native Platform**: Android (`android/`)

### Prerequisites
- Node.js 20+ & npm
- Python 3.11+ (with virtual environment in `backend/.venv`)
- Android Studio (Electric Eel or newer) with Android SDK platform tools (API 34/35)

---

### Step 1: Start the Python FastAPI Backend

Open a terminal in the project root:

```powershell
# Activate backend virtual environment
.\backend\.venv\Scripts\activate

# Start the analysis engine
python backend/run_backend.py
```
The backend starts at `http://127.0.0.1:8000`.  
Verify health check: `http://127.0.0.1:8000/api/health`.

---

### Step 2: Build and Synchronize the Frontend

Open a second terminal in `frontend/`:

```powershell
# Set Node in PATH (if not global)
$env:PATH = "C:\Users\User\.local\node-v20.18.0-win-x64;$env:PATH"

# Build production bundle and sync assets into native Android project
npm run cap:build
```

This runs:
1. `tsc && vite build` (bundles into `frontend/dist/`)
2. `npx cap sync android` (copies web assets and updates plugins into `frontend/android/`)

---

### Step 3: Run the Android Application

#### Option A: Run via Android Studio (Recommended)
```powershell
# Open native Android project in Android Studio
npm run cap:open
```
Inside Android Studio:
1. Allow Gradle to finish syncing the project.
2. Select your connected Android device or Android Virtual Device (AVD / Emulator).
3. Click **Run 'app'** (Green Play button).

#### Option B: Run via Capacitor CLI (Direct to Connected Device / Emulator)
```powershell
npx cap run android
```

---

### Step 4: Backend Connectivity Configuration for Mobile

Because Android devices and emulators have isolated network namespaces, configure how the app reaches the FastAPI server:

1. **Android Emulator**:
   - The app automatically detects native Capacitor mode and defaults to `http://10.0.2.2:8000/api` (the built-in loopback alias to the host computer's `localhost:8000`).
2. **Physical Android Device (Over Wi-Fi)**:
   - Ensure the Android phone and host development PC are on the same Wi-Fi network.
   - Run `ipconfig` on your PC to get your LAN IP (e.g. `192.168.1.100`).
   - In `frontend/.env` (or via environment variable):
     ```env
     VITE_API_BASE_URL=http://192.168.1.100:8000/api
     ```
   - Then rebuild and sync: `npm run cap:build`.
3. **Desktop Browser Testing**:
   - Simply run `npm run dev` in `frontend/`.
   - Uses Vite's internal reverse proxy `/api -> http://127.0.0.1:8000`.

---

## 6. Synthetic Demo Specimen Suite

The application includes 4 pre-bundled synthetic specimen test cards for zero-risk demonstration:
1. **Clean Specimen (`clean_valid`)**:
   - Valid dates (Issue: 2021, Expiry: 2031, DOB: 1994).
   - Uniform ELA compression residuals, standard ID-1 aspect ratio.
   - Expected Risk: **LOW RISK** (~18–25/100).
2. **Tampered Photo (`tampered_photo`)**:
   - High-contrast photo splice cutlines and localized compression discrepancy.
   - Expected Risk: **HIGH RISK** (~82–90/100) with `CV_PHOTO_BORDER_CUTLINE` and `CV_ELA` flags.
3. **Inconsistent Dates (`inconsistent_dates`)**:
   - Chronological contradiction: Issue date is after expiration date, or future date of birth.
   - Expected Risk: **HIGH RISK** (~75–85/100) with `CONSISTENCY_DATE_INVERSION` flag.
4. **Blurry Capture (`blurry_capture`)**:
   - Degraded optical sharpness below preferred Laplacian threshold.
   - Expected Risk: **MEDIUM RISK** (~40–55/100) with `Low optical sharpness` finding.

---

## 7. Verification & Automated Testing

### Backend Unit Tests
Execute the pytest suite covering health checks, synthetic samples, tamper detection, date consistency, and error handling:
```powershell
.\backend\.venv\Scripts\python.exe -m pytest backend/tests
```
*Expected result: 7 passed.*

### Frontend TypeScript & Bundle Validation
```powershell
npm run build
```
*Expected result: Zero TypeScript errors, production bundle compiled.*

### Capacitor Synchronization
```powershell
npm run cap:sync
```
*Expected result: Assets copied to `frontend/android/app/src/main/assets/public/` with zero errors.*

---

## 8. Summary of Components

| Component | Path | Description |
|---|---|---|
| **Scan Document Modal** | `frontend/src/components/ScanDocumentModal.tsx` | Full-screen camera viewfinder, HUD alignment brackets, animated laser line, Retake & Analyze actions |
| **Mobile Officer Home** | `frontend/src/components/MobileOfficerHome.tsx` | Mobile-first dashboard: AI engine readiness, large Scan/Select actions, compact synthetic specimen cards |
| **Mobile Officer Result** | `frontend/src/components/MobileOfficerResult.tsx` | Central risk score meter, recommendation banner, 4-signal forensic cards, explainable findings, synthetic data badge |
| **Camera Service** | `frontend/src/services/cameraService.ts` | Capacitor Camera plugin wrapper with permission handling, cancellation handling, and browser fallbacks |
| **API Client** | `frontend/src/services/api.ts` | Configurable base URL (Android emulator `10.0.2.2`, physical LAN, or browser proxy) with offline error handling |
| **Capacitor Config** | `frontend/capacitor.config.ts` | Capacitor project configuration (`com.idshieldai.app`, `IDShield AI`) |
| **Android Manifest** | `frontend/android/app/src/main/AndroidManifest.xml` | Camera & storage permissions, cleartext network traffic enabled for dev |
