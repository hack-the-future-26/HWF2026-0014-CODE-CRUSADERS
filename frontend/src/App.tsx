import React, { useEffect, useState, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { Navbar } from './components/Navbar';
import { UploadSection } from './components/UploadSection';
import { SyntheticSpecimens } from './components/SyntheticSpecimens';
import { AnalysisPipeline } from './components/AnalysisPipeline';
import { RiskMeter } from './components/RiskMeter';
import { ImageVisualizer } from './components/ImageVisualizer';
import { FindingsList } from './components/FindingsList';
import { ConsistencyTable } from './components/ConsistencyTable';
import { ExtractedFields } from './components/ExtractedFields';
import { AuditHistoryModal } from './components/AuditHistoryModal';
import { AboutModal } from './components/AboutModal';
import { ScanDocumentModal } from './components/ScanDocumentModal';
import { MobileOfficerHome } from './components/MobileOfficerHome';
import { MobileOfficerResult } from './components/MobileOfficerResult';
import { cameraService } from './services/cameraService';
import { api } from './services/api';
import { compressDocumentBase64, compressDocumentFile, sanitizeUploadErrorMessage } from './services/imageCompressor';
import { AnalyzeResponse, ExtractedField, HealthStatus, HistoryItem, SampleDocument } from './types';
import { AlertCircle, Shield, ShieldCheck, Smartphone, Monitor, RefreshCw } from 'lucide-react';

export const App: React.FC = () => {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [samples, setSamples] = useState<SampleDocument[]>([]);
  const [selectedSampleId, setSelectedSampleId] = useState<string | null>(null);
  const [currentImage, setCurrentImage] = useState<string>('');
  
  const [analysisResult, setAnalysisResult] = useState<AnalyzeResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<(() => Promise<void>) | null>(null);

  const [highlightedField, setHighlightedField] = useState<ExtractedField | null>(null);
  
  // Modals & Navigation states
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isAboutOpen, setIsAboutOpen] = useState<boolean>(false);
  const [isScanModalOpen, setIsScanModalOpen] = useState<boolean>(false);
  const [galleryImageForCropper, setGalleryImageForCropper] = useState<string | null>(null);

  // Layout mode: 'mobile' (Officer Flow) or 'desktop' (Diagnostic Dashboard)
  // Defaults to mobile on Capacitor native platform or screen width < 768px
  const [isMobileMode, setIsMobileMode] = useState<boolean>(() => {
    if (Capacitor.isNativePlatform()) return true;
    if (typeof window !== 'undefined' && window.innerWidth < 768) return true;
    return false;
  });

  // Check window resize to intelligently adapt
  useEffect(() => {
    const handleResize = () => {
      if (Capacitor.isNativePlatform()) {
        setIsMobileMode(true);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Initial load: fetch engine health and demo samples list without running demo analysis automatically
  useEffect(() => {
    const initApp = async () => {
      try {
        const [healthRes, samplesRes] = await Promise.all([
          api.getHealth().catch(() => null),
          api.getSamples().catch(() => [])
        ]);

        if (healthRes) setHealth(healthRes);
        if (samplesRes && samplesRes.length > 0) {
          setSamples(samplesRes);
          // Demo specimen data is loaded only for user selection under 'Try Demo Specimens'.
          // We do NOT auto-execute demo analysis on app start so the screening screen remains pristine.
        }
      } catch (err: any) {
        console.error('Failed to initialize app:', err);
        setErrorMessage('Failed to connect to IDShield AI backend engine. Check network connection.');
      }
    };

    initApp();
  }, []);

  // Analyze synthetic sample
  const handleAnalyzeSample = async (sampleId: string) => {
    console.log(`[App] Selecting synthetic sample: ${sampleId}`);
    setIsLoading(true);
    setErrorMessage(null);
    setAnalysisResult(null); // Clear previous result immediately
    setSelectedSampleId(sampleId);
    setHighlightedField(null);

    const matchingSample = samples.find(s => s.sample_id === sampleId);
    if (matchingSample) {
      setCurrentImage(matchingSample.image_data_url);
    }

    const action = async () => {
      const result = await api.analyzeSample(sampleId);
      console.log(`[App] Received sample analysis result. Fields:`, result.extracted_fields?.map(f => `${f.field_name}: ${f.value}`));
      setAnalysisResult(result);
    };

    setLastAction(() => action);

    try {
      await action();
    } catch (err: any) {
      console.error('Analysis error:', err);
      setErrorMessage(err.message || 'Document screening analysis failed.');
    } finally {
      setIsLoading(false);
    }
  };

  // Analyze uploaded file
  const handleUploadFile = async (file: File) => {
    console.log(`[App] Uploading document file: ${file.name}, size: ${file.size}`);
    setIsLoading(true);
    setErrorMessage(null);
    setAnalysisResult(null); // Clear previous result immediately
    setSelectedSampleId(null);
    setHighlightedField(null);

    const action = async () => {
      // Automatically compress and resize large images before sending
      const compressedFile = await compressDocumentFile(file);

      // Read compressed file into data URL preview
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve((e.target?.result as string) || '');
        reader.readAsDataURL(compressedFile);
      });
      if (dataUrl) {
        setCurrentImage(dataUrl);
      }

      const result = await api.analyzeFile(compressedFile);
      console.log(`[App] Received upload analysis result. Fields:`, result.extracted_fields?.map(f => `${f.field_name}: ${f.value}`));
      setAnalysisResult(result);
    };

    setLastAction(() => action);

    try {
      await action();
    } catch (err: any) {
      console.error('Upload analysis error:', err);
      setErrorMessage(sanitizeUploadErrorMessage(err.message || 'File screening failed.'));
    } finally {
      setIsLoading(false);
    }
  };

  // Analyze base64 image (from Camera or Gallery selection)
  const handleAnalyzeBase64 = async (base64Data: string) => {
    console.log(`[App] Analyzing captured base64 image (length: ${base64Data.length})`);
    setIsLoading(true);
    setErrorMessage(null);
    setAnalysisResult(null); // Clear previous result immediately
    setSelectedSampleId(null);
    setHighlightedField(null);

    const action = async () => {
      // Automatically compress and resize large images before sending
      const compressedBase64 = await compressDocumentBase64(base64Data);
      setCurrentImage(compressedBase64);

      const result = await api.analyzeBase64(compressedBase64);
      console.log(`[App] Received camera/base64 analysis result. Fields:`, result.extracted_fields?.map(f => `${f.field_name}: ${f.value}`));
      setAnalysisResult(result);
    };

    setLastAction(() => action);

    try {
      await action();
    } catch (err: any) {
      console.error('Base64 screening error:', err);
      setErrorMessage(sanitizeUploadErrorMessage(err.message || 'Document screening failed.'));
    } finally {
      setIsLoading(false);
    }
  };

  // Select image from device gallery — routes through 4-corner document cropper & perspective rectification
  const handleSelectGalleryImage = async () => {
    try {
      const doc = await cameraService.selectFromGallery();
      if (doc && doc.dataUrl) {
        setGalleryImageForCropper(doc.dataUrl);
        setIsScanModalOpen(true);
      }
    } catch (err: any) {
      setErrorMessage(sanitizeUploadErrorMessage(err.message || 'Failed to select image from device.'));
    }
  };

  const handleOpenHistory = async () => {
    try {
      const historyRes = await api.getHistory();
      setHistory(historyRes);
    } catch (err) {
      console.error('Failed to fetch history:', err);
    }
    setIsHistoryOpen(true);
  };

  const handleClearHistory = async () => {
    try {
      await api.clearHistory();
      setHistory([]);
    } catch (err) {
      console.error('Failed to clear history:', err);
    }
  };

  const handleRetryLastAction = () => {
    if (lastAction) {
      setIsLoading(true);
      setErrorMessage(null);
      lastAction()
        .catch((err) => setErrorMessage(err.message || 'Retry failed.'))
        .finally(() => setIsLoading(false));
    }
  };

  const scrollToSection = (sectionId: string) => {
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-800 antialiased selection:bg-sky-100 selection:text-sky-900">
      
      {/* Top Navbar */}
      <Navbar
        health={health}
        onOpenHistory={handleOpenHistory}
        onOpenAbout={() => setIsAboutOpen(true)}
        onScrollToSection={scrollToSection}
      />

      {/* View Switcher Pill for Desktop/Tablets */}
      {!Capacitor.isNativePlatform() && (
        <div className="max-w-7xl w-full mx-auto px-4 pt-3 flex items-center justify-end">
          <div className="inline-flex items-center gap-1 p-1 bg-slate-200/80 rounded-2xl border border-slate-300/80 text-xs font-semibold">
            <button
              onClick={() => setIsMobileMode(true)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-xl transition ${
                isMobileMode
                  ? 'bg-white text-sky-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Officer Mobile Flow</span>
            </button>
            <button
              onClick={() => setIsMobileMode(false)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-xl transition ${
                !isMobileMode
                  ? 'bg-white text-sky-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Monitor className="w-3.5 h-3.5" />
              <span>Full Desktop View</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-6">
        
        {/* Error notification banner with Retry */}
        {errorMessage && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center justify-between text-xs animate-in fade-in shadow-sm">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <div className="flex items-center gap-2">
              {lastAction && (
                <button
                  onClick={handleRetryLastAction}
                  className="flex items-center gap-1 px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold text-[11px] transition shadow-xs"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Retry</span>
                </button>
              )}
              <button
                onClick={() => setErrorMessage(null)}
                className="px-2.5 py-1 rounded-lg bg-white border border-rose-200 text-rose-700 font-semibold text-[11px] hover:bg-rose-100/60 transition"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* VIEW MODE 1: MOBILE-FIRST OFFICER SCREENING WORKFLOW          */}
        {/* ------------------------------------------------------------- */}
        {isMobileMode ? (
          <div className="max-w-xl mx-auto space-y-6">
            
            {/* 1. Mobile Home Screen */}
            <MobileOfficerHome
              health={health}
              samples={samples}
              selectedSampleId={selectedSampleId}
              onScanDocument={() => setIsScanModalOpen(true)}
              onSelectImage={handleSelectGalleryImage}
              onSelectSample={handleAnalyzeSample}
              onOpenHistory={handleOpenHistory}
              onOpenAbout={() => setIsAboutOpen(true)}
              isLoading={isLoading}
            />

            {/* 2. Sequential Animated Analysis Pipeline */}
            {isLoading && (
              <AnalysisPipeline documentImage={currentImage} />
            )}

            {/* 3. Dedicated Result Screen */}
            {!isLoading && analysisResult && (
              <MobileOfficerResult
                data={analysisResult}
                currentImage={currentImage}
                onNewScan={() => setIsScanModalOpen(true)}
                onOpenHistory={handleOpenHistory}
                isDemo={selectedSampleId !== null}
              />
            )}

          </div>
        ) : (
          /* ------------------------------------------------------------- */
          /* VIEW MODE 2: FULL DESKTOP MULTI-PANE DASHBOARD                 */
          /* ------------------------------------------------------------- */
          <div className="space-y-8">
            {/* Hero & Central Upload Section */}
            <UploadSection
              onUploadFile={handleUploadFile}
              isLoading={isLoading}
            />

            {/* Synthetic Specimen Horizontal Selector */}
            <SyntheticSpecimens
              samples={samples}
              selectedSampleId={selectedSampleId}
              onSelectSample={handleAnalyzeSample}
              isLoading={isLoading}
            />

            {/* Animated Analysis Experience */}
            {isLoading && (
              <AnalysisPipeline documentImage={currentImage} />
            )}

            {/* Document Analysis Complete - Results Section */}
            {!isLoading && analysisResult && (
              <div className="space-y-8 animate-in fade-in duration-300">
                
                {/* Risk Result Centerpiece */}
                <RiskMeter data={analysisResult} />

                {/* Visualizer & AI Findings Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  
                  {/* Image Visualizer (Navy accent canvas) */}
                  <div className="lg:col-span-7">
                    <ImageVisualizer
                      originalImage={analysisResult.processed_preview_base64 || currentImage}
                      elaOverlay={analysisResult.anomaly_overlays?.ela_overlay_base64}
                      zonesOverlay={analysisResult.anomaly_overlays?.zones_overlay_base64}
                      extractedFields={analysisResult.extracted_fields}
                      highlightedField={highlightedField}
                    />
                  </div>

                  {/* AI Findings & Extracted Info */}
                  <div className="lg:col-span-5 space-y-6">
                    <FindingsList findings={analysisResult.findings} />
                    <ExtractedFields
                      fields={analysisResult.extracted_fields}
                      highlightedField={highlightedField}
                      onSelectField={(f) => setHighlightedField(f)}
                      isDemo={selectedSampleId !== null}
                    />
                  </div>

                </div>

                {/* Cross-Field Logical Consistency Matrix */}
                <ConsistencyTable checks={analysisResult.consistency_checks} />

              </div>
            )}
          </div>
        )}

      </main>

      {/* Persistent Ethical Notice Disclaimer */}
      <aside className="sticky bottom-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200/90 py-2.5 px-4 text-center shadow-lg">
        <div className="max-w-5xl mx-auto flex items-center justify-center gap-2 text-xs text-slate-500 leading-snug">
          <Shield className="w-3.5 h-3.5 text-sky-600 shrink-0 hidden sm:inline" />
          <p>
            <span className="font-semibold text-slate-700">Notice:</span> IDShield AI is an AI-assisted risk-screening and decision-support prototype. It does not provide official government authentication or determine document authenticity with certainty. Testing uses synthetic specimen documents and demonstration data.
          </p>
        </div>
      </aside>

      {/* Footer */}
      <footer className="border-t border-slate-200/80 bg-white py-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-sky-600" />
            <span className="font-medium text-slate-700">IDShield AI • Mobile-First Identity Document Risk Screening</span>
          </div>
          <p className="font-mono text-[11px] text-slate-400">
            Capacitor Android • FastAPI • OpenCV • OCR • Synthetic Specimen Suite
          </p>
        </div>
      </footer>

      {/* Scan Document Camera Viewfinder Modal */}
      <ScanDocumentModal
        isOpen={isScanModalOpen}
        initialImage={galleryImageForCropper}
        onClose={() => {
          setIsScanModalOpen(false);
          setGalleryImageForCropper(null);
        }}
        onAnalyzeCaptured={handleAnalyzeBase64}
      />

      {/* Audit History Modal */}
      <AuditHistoryModal
        isOpen={isHistoryOpen}
        history={history}
        onClose={() => setIsHistoryOpen(false)}
        onClear={handleClearHistory}
      />

      {/* About & Ethics Modal */}
      <AboutModal
        isOpen={isAboutOpen}
        onClose={() => setIsAboutOpen(false)}
      />
    </div>
  );
};
