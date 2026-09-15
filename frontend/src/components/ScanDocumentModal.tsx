import React, { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Camera, RefreshCw, AlertCircle, Sparkles, Image as ImageIcon, X, Crop, ScanLine, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { cameraService, CameraError, CapturedDocument } from '../services/cameraService';
import { compressDocumentBase64, sanitizeUploadErrorMessage } from '../services/imageCompressor';
import { api, DocumentQualityMetrics } from '../services/api';

interface ScanDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAnalyzeCaptured: (dataUrl: string) => void;
  initialImage?: string | null;
}

export const ScanDocumentModal: React.FC<ScanDocumentModalProps> = ({
  isOpen,
  onClose,
  onAnalyzeCaptured,
  initialImage = null
}) => {
  // Step modes: 'scanner' (live viewfinder) -> 'cropper' (4-corner adjustment)
  const [step, setStep] = useState<'scanner' | 'cropper'>('scanner');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [useLiveVideo, setUseLiveVideo] = useState<boolean>(false);
  const [scannerStatus, setScannerStatus] = useState<string>('Searching for document...');
  const [liveContour, setLiveContour] = useState<string | null>(null);
  const [isDocDetected, setIsDocDetected] = useState<boolean>(false);
  const [qualityMetrics, setQualityMetrics] = useState<DocumentQualityMetrics | null>(null);

  // Interactive 4 corners in original image coordinate space: [TL, TR, BR, BL]
  const [corners, setCorners] = useState<[number, number][]>([
    [50, 50],
    [550, 50],
    [550, 350],
    [50, 350]
  ]);
  const [imageSize, setImageSize] = useState<{ width: number; height: number }>({ width: 600, height: 400 });
  const [activeCornerIndex, setActiveCornerIndex] = useState<number | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cropContainerRef = useRef<HTMLDivElement>(null);
  const liveContainerRef = useRef<HTMLDivElement>(null);
  const isDetectingRef = useRef<boolean>(false);
  const isCapturingRef = useRef<boolean>(false);
  const hasAutoCapturedRef = useRef<boolean>(false);
  const consecutiveGoodFramesRef = useRef<number>(0);

  // Initialize camera stream if in browser/web view
  useEffect(() => {
    if (!isOpen) {
      stopCameraStream();
      setCapturedImage(null);
      setErrorMessage(null);
      setStep('scanner');
      hasAutoCapturedRef.current = false;
      consecutiveGoodFramesRef.current = 0;
      setQualityMetrics(null);
      return;
    }

    if (initialImage) {
      processCapturedForCropping(initialImage);
    } else {
      startCameraStream();
    }

    return () => {
      stopCameraStream();
    };
  }, [isOpen, initialImage]);

  // Real-time live document detection and quality assessment feedback loop
  useEffect(() => {
    if (!isOpen || step !== 'scanner' || !useLiveVideo) {
      setLiveContour(null);
      setIsDocDetected(false);
      consecutiveGoodFramesRef.current = 0;
      hasAutoCapturedRef.current = false;
      setQualityMetrics(null);
      setScannerStatus('Searching for document...');
      return;
    }

    let isMounted = true;

    const sampleAndDetect = async () => {
      if (isDetectingRef.current || isCapturingRef.current || !videoRef.current) return;
      const video = videoRef.current;
      if (video.videoWidth === 0 || video.videoHeight === 0) return;

      try {
        isDetectingRef.current = true;
        // Sample lightweight downscaled frame (~400-480px width) for fast, non-blocking OpenCV edge detection
        const targetW = 440;
        const targetH = Math.round((video.videoHeight / video.videoWidth) * targetW);
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          isDetectingRef.current = false;
          return;
        }

        ctx.drawImage(video, 0, 0, targetW, targetH);
        const lowResDataUrl = canvas.toDataURL('image/jpeg', 0.65);

        const detectRes = await api.detectDocumentCorners(lowResDataUrl);
        if (!isMounted) return;

        if (detectRes.quality) {
          setQualityMetrics(detectRes.quality);
        }

        if (detectRes && detectRes.detected && detectRes.corners && detectRes.corners.length === 4) {
          setIsDocDetected(true);

          const qStatus = detectRes.quality?.quality_status || 'DOCUMENT_DETECTED';
          const qMsg = detectRes.quality?.quality_message || 'Document detected';

          if (qStatus === 'GOOD_CAPTURE') {
            consecutiveGoodFramesRef.current += 1;
            if (consecutiveGoodFramesRef.current === 1) {
              setScannerStatus('Hold steady...');
            } else if (consecutiveGoodFramesRef.current >= 2) {
              setScannerStatus('Ready to capture');
              // Automatic capture triggered on stable high-quality hold
              if (!hasAutoCapturedRef.current && !isCapturingRef.current) {
                hasAutoCapturedRef.current = true;
                setTimeout(() => {
                  if (isMounted && step === 'scanner' && !isCapturingRef.current) {
                    handleCapture();
                  }
                }, 300);
              }
            }
          } else {
            consecutiveGoodFramesRef.current = 0;
            hasAutoCapturedRef.current = false;
            setScannerStatus(qMsg);
          }

          // Map detected corners to percentage-based coordinates for live SVG polygon
          if (liveContainerRef.current) {
            const containerRect = liveContainerRef.current.getBoundingClientRect();
            const cW = containerRect.width;
            const cH = containerRect.height;
            const vW = video.videoWidth;
            const vH = video.videoHeight;

            if (cW > 0 && cH > 0 && vW > 0 && vH > 0) {
              const scale = Math.max(cW / vW, cH / vH);
              const renderedW = vW * scale;
              const renderedH = vH * scale;
              const offsetX = (cW - renderedW) / 2;
              const offsetY = (cH - renderedH) / 2;

              const pointsStr = detectRes.corners.map(([cx, cy]) => {
                const origX = (cx / detectRes.image_width) * vW;
                const origY = (cy / detectRes.image_height) * vH;
                const screenX = origX * scale + offsetX;
                const screenY = origY * scale + offsetY;
                const pctX = ((screenX / cW) * 100).toFixed(2);
                const pctY = ((screenY / cH) * 100).toFixed(2);
                return `${pctX}%,${pctY}%`;
              }).join(' ');

              setLiveContour(pointsStr);
            }
          }
        } else {
          consecutiveGoodFramesRef.current = 0;
          hasAutoCapturedRef.current = false;
          setIsDocDetected(false);
          setScannerStatus(detectRes.quality?.quality_message || 'Searching for document...');
          setLiveContour(null);
        }
      } catch {
        if (isMounted) {
          consecutiveGoodFramesRef.current = 0;
          hasAutoCapturedRef.current = false;
          setIsDocDetected(false);
          setScannerStatus('Searching for document...');
          setLiveContour(null);
        }
      } finally {
        isDetectingRef.current = false;
      }
    };

    // Run frame check every 1100ms for lightweight responsive mobile preview
    const interval = setInterval(sampleAndDetect, 1100);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isOpen, step, useLiveVideo]);

  const startCameraStream = async () => {
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        // Dynamic camera resolution: request optimal 1080p, gracefully fallback to 720p
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920, min: 1280 },
            height: { ideal: 1080, min: 720 }
          },
          audio: false
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
        setUseLiveVideo(true);
      }
    } catch {
      setUseLiveVideo(false);
    }
  };

  const stopCameraStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setUseLiveVideo(false);
  };

  // Prepare image for cropping & perspective detection
  const processCapturedForCropping = async (dataUrl: string) => {
    setCapturedImage(dataUrl);
    setStep('cropper');
    stopCameraStream();

    // Load natural image dimensions
    const img = new Image();
    img.onload = async () => {
      const origW = img.naturalWidth || 600;
      const origH = img.naturalHeight || 400;
      setImageSize({ width: origW, height: origH });

      // Default fallback corners (8% margin inset)
      const fallbackCorners: [number, number][] = [
        [Math.round(origW * 0.08), Math.round(origH * 0.08)],
        [Math.round(origW * 0.92), Math.round(origH * 0.08)],
        [Math.round(origW * 0.92), Math.round(origH * 0.92)],
        [Math.round(origW * 0.08), Math.round(origH * 0.92)]
      ];
      setCorners(fallbackCorners);

      // Attempt automatic OpenCV contour detection from backend
      try {
        const detectRes = await api.detectDocumentCorners(dataUrl);
        if (detectRes && detectRes.detected && detectRes.corners && detectRes.corners.length === 4) {
          setCorners(detectRes.corners as [number, number][]);
        }
      } catch (err) {
        console.warn('Document contour detection fallback to inset frame:', err);
      }
    };
    img.src = dataUrl;
  };

  // Capture button action
  const handleCapture = async () => {
    setErrorMessage(null);
    setIsCapturing(true);

    try {
      // 1. If live video stream is active, capture from canvas
      if (useLiveVideo && videoRef.current && videoRef.current.videoWidth > 0) {
        const video = videoRef.current;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const rawDataUrl = canvas.toDataURL('image/jpeg', 0.92);
          await processCapturedForCropping(rawDataUrl);
          return;
        }
      }

      // 2. Otherwise invoke Capacitor native camera
      const result: CapturedDocument | null = await cameraService.captureDocument();
      if (result && result.dataUrl) {
        await processCapturedForCropping(result.dataUrl);
      }
    } catch (err: any) {
      console.warn('Capture handler warning:', err);
      if (err instanceof CameraError) {
        setErrorMessage(sanitizeUploadErrorMessage(err.message));
      } else {
        setErrorMessage(sanitizeUploadErrorMessage(err.message || 'Camera could not capture document. You may also select an image from gallery.'));
      }
    } finally {
      setIsCapturing(false);
    }
  };

  const handleSelectGallery = async () => {
    setErrorMessage(null);
    try {
      const result = await cameraService.selectFromGallery();
      if (result && result.dataUrl) {
        await processCapturedForCropping(result.dataUrl);
      }
    } catch (err: any) {
      setErrorMessage(sanitizeUploadErrorMessage(err.message || 'Unable to load image from gallery.'));
    }
  };

  const handleRetake = () => {
    setCapturedImage(null);
    setErrorMessage(null);
    setStep('scanner');
    startCameraStream();
  };

  // Pointer drag handle for 4-corner adjustment
  const handlePointerDown = (index: number, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setActiveCornerIndex(index);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (activeCornerIndex === null || !cropContainerRef.current) return;
    e.preventDefault();

    const rect = cropContainerRef.current.getBoundingClientRect();
    const clientX = e.clientX;
    const clientY = e.clientY;

    // Convert screen coordinates into original image coordinate space
    const relX = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const relY = Math.max(0, Math.min(clientY - rect.top, rect.height));

    const origX = Math.round((relX / rect.width) * imageSize.width);
    const origY = Math.round((relY / rect.height) * imageSize.height);

    setCorners(prev => {
      const updated = [...prev] as [number, number][];
      updated[activeCornerIndex] = [origX, origY];
      return updated;
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (activeCornerIndex !== null) {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
      setActiveCornerIndex(null);
    }
  };

  // Confirm Crop: Apply perspective warp on backend, compress, and send to analysis
  const handleConfirmCropAndAnalyze = async () => {
    if (!capturedImage) return;
    setIsProcessing(true);
    setErrorMessage(null);

    try {
      // 1. Apply OpenCV perspective correction through backend API
      const warpRes = await api.warpDocumentPerspective(capturedImage, corners);
      const warpedBase64 = warpRes.warped_image_base64;

      // 2. Run existing compression to ensure compliance with < 1024 KB limit
      const normalizedDataUrl = await compressDocumentBase64(warpedBase64);

      // 3. Hand off flat normalized document to analysis pipeline
      onClose();
      onAnalyzeCaptured(normalizedDataUrl);
    } catch (err: any) {
      console.warn('Perspective warp fallback:', err);
      // If warp fails, send current compressed image rather than failing completely
      const fallbackUrl = await compressDocumentBase64(capturedImage);
      onClose();
      onAnalyzeCaptured(fallbackUrl);
    } finally {
      setIsProcessing(false);
    }
  };

  const getQualityTheme = () => {
    const status = qualityMetrics?.quality_status;
    if (status === 'GOOD_CAPTURE') {
      return {
        badgeBorder: 'border-emerald-500/70 bg-emerald-950/90 text-emerald-200',
        dotClass: 'bg-emerald-400 animate-ping',
        frameBorder: 'border-2 border-emerald-400 shadow-[0_0_24px_rgba(52,211,153,0.45)]',
        bracketClass: 'border-emerald-400 shadow-[0_0_14px_#34d399]',
        tagText: 'GOOD CAPTURE • READY',
        tagClass: 'text-emerald-300 bg-emerald-950/80 border-emerald-500/50 shadow-emerald-500/30',
        laserClass: 'via-emerald-400 shadow-[0_0_12px_#34d399]',
        shutterRing: 'border-4 border-emerald-400 shadow-emerald-500/40',
        shutterGradient: 'from-emerald-500 to-teal-400',
      };
    }
    if (status === 'HOLD_STEADY') {
      return {
        badgeBorder: 'border-cyan-500/70 bg-cyan-950/90 text-cyan-200',
        dotClass: 'bg-cyan-400 animate-pulse',
        frameBorder: 'border-2 border-cyan-400 shadow-[0_0_20px_rgba(56,189,248,0.35)]',
        bracketClass: 'border-cyan-400 shadow-[0_0_10px_#38bdf8]',
        tagText: 'HOLD STEADY...',
        tagClass: 'text-cyan-300 bg-cyan-950/80 border-cyan-500/50 shadow-cyan-500/20',
        laserClass: 'via-cyan-400 shadow-[0_0_12px_#38bdf8]',
        shutterRing: 'border-4 border-cyan-400 shadow-cyan-500/40',
        shutterGradient: 'from-cyan-500 to-sky-400',
      };
    }
    if (status === 'TOO_DARK') {
      return {
        badgeBorder: 'border-rose-500/70 bg-rose-950/90 text-rose-200',
        dotClass: 'bg-rose-400 animate-pulse',
        frameBorder: 'border border-rose-500/80 shadow-[0_0_15px_rgba(244,63,94,0.3)]',
        bracketClass: 'border-rose-400 shadow-[0_0_10px_#f43f5e]',
        tagText: 'TOO DARK • INCREASE LIGHT',
        tagClass: 'text-rose-300 bg-rose-950/80 border-rose-500/50 shadow-rose-500/20',
        laserClass: 'via-rose-400 shadow-[0_0_12px_#f43f5e]',
        shutterRing: 'border-4 border-sky-400 shadow-sky-500/30',
        shutterGradient: 'from-sky-500 to-cyan-400',
      };
    }
    if (status === 'TOO_BLURRY') {
      return {
        badgeBorder: 'border-amber-500/70 bg-amber-950/90 text-amber-200',
        dotClass: 'bg-amber-400 animate-pulse',
        frameBorder: 'border border-amber-400/80 shadow-[0_0_15px_rgba(251,191,36,0.3)]',
        bracketClass: 'border-amber-400 shadow-[0_0_10px_#fbbf24]',
        tagText: 'IMAGE BLURRY • HOLD STILL',
        tagClass: 'text-amber-300 bg-amber-950/80 border-amber-500/50 shadow-amber-500/20',
        laserClass: 'via-amber-400 shadow-[0_0_12px_#fbbf24]',
        shutterRing: 'border-4 border-sky-400 shadow-sky-500/30',
        shutterGradient: 'from-sky-500 to-cyan-400',
      };
    }
    if (status === 'GLARE_DETECTED') {
      return {
        badgeBorder: 'border-amber-500/70 bg-amber-950/90 text-amber-200',
        dotClass: 'bg-amber-400 animate-pulse',
        frameBorder: 'border border-amber-400/80 shadow-[0_0_15px_rgba(251,191,36,0.3)]',
        bracketClass: 'border-amber-400 shadow-[0_0_10px_#fbbf24]',
        tagText: 'GLARE DETECTED • TILT SLIGHTLY',
        tagClass: 'text-amber-300 bg-amber-950/80 border-amber-500/50 shadow-amber-500/20',
        laserClass: 'via-amber-400 shadow-[0_0_12px_#fbbf24]',
        shutterRing: 'border-4 border-sky-400 shadow-sky-500/30',
        shutterGradient: 'from-sky-500 to-cyan-400',
      };
    }
    if (status === 'TOO_FAR') {
      return {
        badgeBorder: 'border-amber-500/70 bg-amber-950/90 text-amber-200',
        dotClass: 'bg-amber-400 animate-pulse',
        frameBorder: 'border border-amber-400/80 shadow-[0_0_15px_rgba(251,191,36,0.3)]',
        bracketClass: 'border-amber-400 shadow-[0_0_10px_#fbbf24]',
        tagText: 'MOVE CLOSER',
        tagClass: 'text-amber-300 bg-amber-950/80 border-amber-500/50 shadow-amber-500/20',
        laserClass: 'via-amber-400 shadow-[0_0_12px_#fbbf24]',
        shutterRing: 'border-4 border-sky-400 shadow-sky-500/30',
        shutterGradient: 'from-sky-500 to-cyan-400',
      };
    }
    if (status === 'TOO_CLOSE') {
      return {
        badgeBorder: 'border-amber-500/70 bg-amber-950/90 text-amber-200',
        dotClass: 'bg-amber-400 animate-pulse',
        frameBorder: 'border border-amber-400/80 shadow-[0_0_15px_rgba(251,191,36,0.3)]',
        bracketClass: 'border-amber-400 shadow-[0_0_10px_#fbbf24]',
        tagText: 'MOVE FURTHER AWAY',
        tagClass: 'text-amber-300 bg-amber-950/80 border-amber-500/50 shadow-amber-500/20',
        laserClass: 'via-amber-400 shadow-[0_0_12px_#fbbf24]',
        shutterRing: 'border-4 border-sky-400 shadow-sky-500/30',
        shutterGradient: 'from-sky-500 to-cyan-400',
      };
    }
    if (status === 'OUT_OF_FRAME') {
      return {
        badgeBorder: 'border-amber-500/70 bg-amber-950/90 text-amber-200',
        dotClass: 'bg-amber-400 animate-pulse',
        frameBorder: 'border border-amber-400/80 shadow-[0_0_15px_rgba(251,191,36,0.3)]',
        bracketClass: 'border-amber-400 shadow-[0_0_10px_#fbbf24]',
        tagText: 'CENTER DOCUMENT IN FRAME',
        tagClass: 'text-amber-300 bg-amber-950/80 border-amber-500/50 shadow-amber-500/20',
        laserClass: 'via-amber-400 shadow-[0_0_12px_#fbbf24]',
        shutterRing: 'border-4 border-sky-400 shadow-sky-500/30',
        shutterGradient: 'from-sky-500 to-cyan-400',
      };
    }
    if (status === 'ROTATE_DOCUMENT') {
      return {
        badgeBorder: 'border-amber-500/70 bg-amber-950/90 text-amber-200',
        dotClass: 'bg-amber-400 animate-pulse',
        frameBorder: 'border border-amber-400/80 shadow-[0_0_15px_rgba(251,191,36,0.3)]',
        bracketClass: 'border-amber-400 shadow-[0_0_10px_#fbbf24]',
        tagText: 'ROTATE / ALIGN DOCUMENT',
        tagClass: 'text-amber-300 bg-amber-950/80 border-amber-500/50 shadow-amber-500/20',
        laserClass: 'via-amber-400 shadow-[0_0_12px_#fbbf24]',
        shutterRing: 'border-4 border-sky-400 shadow-sky-500/30',
        shutterGradient: 'from-sky-500 to-cyan-400',
      };
    }
    // Default or Searching
    return {
      badgeBorder: isDocDetected ? 'border-cyan-500/60 bg-slate-900/90 text-cyan-300' : 'border-slate-700 bg-slate-900/90 text-slate-200',
      dotClass: isDocDetected ? 'bg-cyan-400' : 'bg-sky-400 animate-pulse',
      frameBorder: isDocDetected ? 'border-2 border-emerald-400 shadow-[0_0_24px_rgba(52,211,153,0.35)]' : 'border border-cyan-400/50 shadow-[0_0_15px_rgba(56,189,248,0.2)]',
      bracketClass: isDocDetected ? 'border-emerald-400 shadow-[0_0_12px_#34d399]' : 'border-cyan-400 shadow-[0_0_10px_#38bdf8]',
      tagText: isDocDetected ? 'DOCUMENT DETECTED' : 'ID-1 CARD FRAME',
      tagClass: isDocDetected ? 'text-emerald-300 bg-emerald-950/60 border-emerald-500/40 shadow-emerald-500/20' : 'text-sky-300/80 bg-slate-950/40 border-sky-400/25',
      laserClass: 'via-cyan-400 shadow-[0_0_12px_#38bdf8]',
      shutterRing: isDocDetected ? 'border-4 border-emerald-400 shadow-emerald-500/30' : 'border-4 border-sky-400 shadow-sky-500/30',
      shutterGradient: isDocDetected ? 'from-emerald-500 to-teal-400' : 'from-sky-500 to-cyan-400',
    };
  };

  const qualityTheme = getQualityTheme();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 text-slate-100 select-none animate-in fade-in duration-200">
      
      {/* Top Header Bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-900/90 border-b border-slate-800/80 backdrop-blur-md z-20">
        <button
          onClick={step === 'cropper' ? handleRetake : onClose}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/90 text-slate-300 hover:text-white hover:bg-slate-700 text-xs font-semibold transition active:scale-95"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{step === 'cropper' ? 'Retake' : 'Back'}</span>
        </button>

        <div className="text-center">
          <h2 className="text-sm font-bold text-white tracking-wide flex items-center justify-center gap-1.5">
            <ScanLine className="w-4 h-4 text-sky-400" />
            <span>{step === 'cropper' ? 'Adjust Document Corners' : 'Document Scanner'}</span>
          </h2>
          <span className="text-[10px] font-mono text-sky-400">
            {step === 'cropper' ? 'PERSPECTIVE RECTIFICATION' : 'HIGH PRECISION OCR SCAN'}
          </span>
        </div>

        <button
          onClick={onClose}
          className="p-2 rounded-xl bg-slate-800/60 text-slate-400 hover:text-white hover:bg-slate-700 transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Main Viewport */}
      <div className="relative flex-1 flex flex-col items-center justify-center overflow-hidden bg-[#060b19]">
        
        {/* Error notification banner */}
        {errorMessage && (
          <div className="absolute top-3 left-4 right-4 z-30 p-3 rounded-2xl bg-rose-950/90 border border-rose-600/60 text-rose-200 text-xs flex items-center justify-between shadow-xl backdrop-blur-md">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="ml-2 text-rose-300 font-bold text-xs underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* STEP 1: SCANNER VIEWPORT (Full-Screen Live Viewfinder with HUD) */}
        {/* ------------------------------------------------------------- */}
        {step === 'scanner' && (
          <div
            ref={liveContainerRef}
            className="relative w-full h-full flex flex-col justify-between overflow-hidden bg-black select-none"
          >
            {/* 1. Full-Screen Live Camera Preview */}
            {useLiveVideo ? (
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                className="absolute inset-0 w-full h-full object-cover z-0"
              />
            ) : (
              <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center space-y-3 z-0">
                <div className="w-16 h-16 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center shadow-lg">
                  <Camera className="w-8 h-8 text-sky-400 animate-pulse" />
                </div>
                <span className="text-xs font-medium text-slate-400">Initializing camera feed...</span>
              </div>
            )}

            {/* 2. Real-Time Document Contour Visualization (Over live camera feed) */}
            {liveContour && (
              <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
                <polygon
                  points={liveContour}
                  fill="rgba(52, 211, 153, 0.15)"
                  stroke="#34d399"
                  strokeWidth="3"
                  strokeDasharray="6 3"
                />
              </svg>
            )}

            {/* 3. Professional ID-1 Document Framing Guide with Darkened Surround */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 px-5">
              <div
                className={`relative w-full max-w-sm aspect-[1.586/1] rounded-2xl transition-all duration-300 ${qualityTheme.frameBorder}`}
                style={{
                  boxShadow: '0 0 0 9999px rgba(3, 7, 18, 0.72)'
                }}
              >
                {/* 4 Corner Brackets: TL, TR, BR, BL */}
                {/* Top-Left Bracket */}
                <div className={`absolute -top-1 -left-1 w-8 h-8 border-t-4 border-l-4 rounded-tl-xl transition-all duration-300 ${qualityTheme.bracketClass}`} />
                {/* Top-Right Bracket */}
                <div className={`absolute -top-1 -right-1 w-8 h-8 border-t-4 border-r-4 rounded-tr-xl transition-all duration-300 ${qualityTheme.bracketClass}`} />
                {/* Bottom-Left Bracket */}
                <div className={`absolute -bottom-1 -left-1 w-8 h-8 border-b-4 border-l-4 rounded-bl-xl transition-all duration-300 ${qualityTheme.bracketClass}`} />
                {/* Bottom-Right Bracket */}
                <div className={`absolute -bottom-1 -right-1 w-8 h-8 border-b-4 border-r-4 rounded-br-xl transition-all duration-300 ${qualityTheme.bracketClass}`} />

                {/* Vertical Scanning Laser Line */}
                <div className={`absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent ${qualityTheme.laserClass} to-transparent animate-laser pointer-events-none opacity-85`} />

                {/* Center Guidance Watermark Tag */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className={`text-[10px] font-mono font-bold tracking-widest uppercase px-3 py-1 rounded-full backdrop-blur-sm transition-colors duration-300 border ${qualityTheme.tagClass}`}>
                    {qualityTheme.tagText}
                  </span>
                </div>
              </div>
            </div>

            {/* 4. Top Guidance Status HUD */}
            <div className="w-full pt-4 pb-2 px-4 flex flex-col items-center z-20 pointer-events-none">
              <div className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border shadow-xl backdrop-blur-md transition-all duration-300 ${qualityTheme.badgeBorder}`}>
                <span className={`w-2 h-2 rounded-full ${qualityTheme.dotClass}`} />
                <span className="text-xs font-semibold">{scannerStatus}</span>
              </div>
              <p className="text-[11px] text-slate-300/90 mt-1 font-medium drop-shadow text-center max-w-xs">
                {qualityMetrics?.quality_message || 'Align the document inside the frame'}
              </p>
            </div>

            {/* 5. Bottom Capture Controls Bar */}
            <div className="w-full pb-8 pt-4 px-6 flex flex-col items-center space-y-3 z-20 bg-gradient-to-t from-black/90 via-black/50 to-transparent">
              <div className="flex items-center justify-around w-full max-w-xs">
                
                {/* Gallery Button */}
                <button
                  onClick={handleSelectGallery}
                  className="flex flex-col items-center justify-center w-14 h-14 rounded-2xl bg-slate-900/85 border border-slate-700/80 text-slate-300 hover:text-white hover:bg-slate-800 transition active:scale-95 shadow-lg backdrop-blur-md"
                  title="Select image from gallery"
                >
                  <ImageIcon className="w-5 h-5 text-sky-400 mb-0.5" />
                  <span className="text-[10px] font-medium">Gallery</span>
                </button>

                {/* Shutter Capture Button */}
                <button
                  onClick={handleCapture}
                  disabled={isCapturing}
                  className={`relative group w-20 h-20 rounded-full bg-slate-950/80 p-1 flex items-center justify-center shadow-2xl active:scale-95 transition disabled:opacity-50 ${qualityTheme.shutterRing}`}
                  aria-label="Capture document"
                >
                  <div className={`w-full h-full rounded-full transition-all flex items-center justify-center shadow-inner bg-gradient-to-tr ${qualityTheme.shutterGradient}`}>
                    <div className="w-7 h-7 rounded-full bg-white shadow-md" />
                  </div>
                </button>

                {/* Stream Reset Button */}
                <button
                  onClick={startCameraStream}
                  className="flex flex-col items-center justify-center w-14 h-14 rounded-2xl bg-slate-900/85 border border-slate-700/80 text-slate-300 hover:text-white hover:bg-slate-800 transition active:scale-95 shadow-lg backdrop-blur-md"
                  title="Reset camera stream"
                >
                  <RefreshCw className="w-5 h-5 text-sky-400 mb-0.5" />
                  <span className="text-[10px] font-medium">Reset</span>
                </button>

              </div>

              <span className="text-[10px] font-mono tracking-wider text-slate-400 uppercase">
                {qualityMetrics?.quality_status === 'GOOD_CAPTURE' ? '✓ STEADY • AUTO-CAPTURING OR TAP' : '◉ TAP SHUTTER TO CAPTURE'}
              </span>
            </div>

          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* STEP 2: INTERACTIVE 4-CORNER CROP & PERSPECTIVE ADJUSTMENT */}
        {/* ------------------------------------------------------------- */}
        {step === 'cropper' && capturedImage && (
          <div className="w-full max-w-lg h-full flex flex-col items-center justify-between p-3 py-1">
            
            {/* Guidance banner */}
            <div className="text-center space-y-0.5 my-1">
              <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-sky-950/90 border border-sky-500/50 text-sky-300 text-xs font-semibold">
                <Crop className="w-3.5 h-3.5" />
                <span>Drag Corners to Align Card Boundary</span>
              </div>
              <p className="text-[11px] text-slate-400">
                Perspective correction flattens angled photos into rectangular format
              </p>
            </div>

            {/* Interactive Image & SVG Canvas */}
            <div
              ref={cropContainerRef}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              className="relative w-full max-h-[60vh] aspect-[1.45/1] bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 shadow-2xl flex items-center justify-center touch-none select-none my-auto"
            >
              {/* Captured Image */}
              <img
                src={capturedImage}
                alt="Captured"
                className="w-full h-full object-contain pointer-events-none"
              />

              {/* SVG Overlay: Quadrilateral polygon + perimeter lines */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none">
                {/* Semi-transparent dark mask with polygon cutout */}
                <defs>
                  <mask id="crop-mask">
                    <rect width="100%" height="100%" fill="white" />
                    <polygon
                      points={corners.map(([x, y]) => {
                        const px = (x / imageSize.width) * 100;
                        const py = (y / imageSize.height) * 100;
                        return `${px}%,${py}%`;
                      }).join(' ')}
                      fill="black"
                    />
                  </mask>
                </defs>

                {/* Darkened surround outside document quadrilateral */}
                <rect width="100%" height="100%" fill="rgba(6, 11, 25, 0.65)" mask="url(#crop-mask)" />

                {/* Perimeter Line connecting the 4 corners: TL -> TR -> BR -> BL -> TL */}
                <polygon
                  points={corners.map(([x, y]) => {
                    const px = (x / imageSize.width) * 100;
                    const py = (y / imageSize.height) * 100;
                    return `${px}%,${py}%`;
                  }).join(' ')}
                  fill="rgba(56, 189, 248, 0.08)"
                  stroke="#38bdf8"
                  strokeWidth="2.5"
                  strokeDasharray="4 2"
                />
              </svg>

              {/* 4 Draggable Corner Handles */}
              {corners.map(([x, y], idx) => {
                const px = (x / imageSize.width) * 100;
                const py = (y / imageSize.height) * 100;
                const isCurrentActive = activeCornerIndex === idx;

                const cornerLabels = ['TL', 'TR', 'BR', 'BL'];

                return (
                  <div
                    key={idx}
                    onPointerDown={(e) => handlePointerDown(idx, e)}
                    style={{
                      left: `${px}%`,
                      top: `${py}%`,
                      transform: 'translate(-50%, -50%)',
                      touchAction: 'none'
                    }}
                    className={`absolute w-10 h-10 flex items-center justify-center cursor-grab active:cursor-grabbing z-30 transition-transform ${
                      isCurrentActive ? 'scale-125' : 'hover:scale-110'
                    }`}
                  >
                    {/* Outer glow ring */}
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 border-white shadow-lg ${
                      isCurrentActive ? 'bg-cyan-500 shadow-cyan-500/50' : 'bg-sky-600 shadow-sky-600/40'
                    }`}>
                      <span className="text-[9px] font-bold text-white font-mono pointer-events-none">
                        {cornerLabels[idx]}
                      </span>
                    </div>
                  </div>
                );
              })}

            </div>

            {/* Officer Action Buttons: Retake vs Crop & Continue */}
            <div className="w-full grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={handleRetake}
                disabled={isProcessing}
                className="py-3 px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-200 font-bold text-sm flex items-center justify-center gap-2 border border-slate-700 shadow-lg transition active:scale-98 disabled:opacity-50"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Retake</span>
              </button>

              <button
                onClick={handleConfirmCropAndAnalyze}
                disabled={isProcessing}
                className="py-3 px-4 rounded-2xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 active:from-sky-600 active:to-blue-700 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg shadow-sky-600/30 transition active:scale-98 disabled:opacity-50"
              >
                {isProcessing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Rectifying...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Crop & Continue</span>
                  </>
                )}
              </button>
            </div>

          </div>
        )}

      </div>

    </div>
  );
};
