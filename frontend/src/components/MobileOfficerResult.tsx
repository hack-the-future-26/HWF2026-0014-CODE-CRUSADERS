import React, { useState } from 'react';
import { 
  ShieldCheck, ShieldAlert, AlertTriangle, Shield, LayoutGrid, CheckCircle2, Type, 
  ChevronDown, ChevronUp, Cpu, Clock, Layers, Maximize2, Camera, Layers3, Copy, 
  Check, Info, Sparkles, RefreshCw, XCircle
} from 'lucide-react';
import { AnalyzeResponse, ExtractedField, Finding, RiskLevel } from '../types';

interface MobileOfficerResultProps {
  data: AnalyzeResponse;
  currentImage: string;
  onNewScan: () => void;
  onOpenHistory: () => void;
  isDemo?: boolean;
}

export const MobileOfficerResult: React.FC<MobileOfficerResultProps> = ({
  data,
  currentImage,
  onNewScan,
  onOpenHistory,
  isDemo = false
}) => {
  const [showTechnicalDetails, setShowTechnicalDetails] = useState<boolean>(false);
  const [activeOverlay, setActiveOverlay] = useState<'original' | 'ela' | 'zones'>('original');
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Stage 5 Development logging to trace extracted fields rendered in mobile UI
  console.log(`[STAGE 5: UI Extracted Fields Render] MobileOfficerResult Component (isDemo=${isDemo}):`, data.extracted_fields?.map(f => `${f.field_name}: "${f.value}" (conf: ${f.confidence}%)`));

  const {
    risk_score,
    risk_level,
    recommendation,
    category_scores,
    extracted_fields,
    findings,
    processing_summary,
    anomaly_overlays,
    processed_preview_base64
  } = data;

  // Standardized Risk Configuration per Specification
  const getRiskConfig = (level: RiskLevel, score: number) => {
    if (score <= 29 || level === 'LOW') {
      return {
        label: 'LOW RISK',
        tagline: 'No significant risk signals detected',
        officerRecommendation: 'Standard Review',
        scoreColor: 'text-emerald-500',
        badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        gaugeStroke: '#10B981',
        icon: <ShieldCheck className="w-6 h-6 text-emerald-500" />
      };
    } else if (score <= 59 || level === 'MEDIUM') {
      return {
        label: 'MEDIUM RISK',
        tagline: 'Some anomalous signals detected',
        officerRecommendation: 'Additional Review Recommended',
        scoreColor: 'text-amber-500',
        badgeBg: 'bg-amber-50 text-amber-700 border-amber-200',
        gaugeStroke: '#F59E0B',
        icon: <AlertTriangle className="w-6 h-6 text-amber-500" />
      };
    } else {
      return {
        label: 'HIGH RISK',
        tagline: 'Multiple anomalous signals detected',
        officerRecommendation: 'Manual Review Required',
        scoreColor: 'text-rose-500',
        badgeBg: 'bg-rose-50 text-rose-700 border-rose-200',
        gaugeStroke: '#EF4444',
        icon: <ShieldAlert className="w-6 h-6 text-rose-500" />
      };
    }
  };

  const riskConfig = getRiskConfig(risk_level, risk_score);

  // SVG Circular Gauge calculation
  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (Math.min(100, Math.max(0, risk_score)) / 100) * circumference;

  // Four Major Signals per Section 10 of Specification
  const signalCards = [
    {
      id: 'ocr',
      name: 'OCR FIELD QUALITY',
      score: category_scores.ocr_score,
      status: category_scores.ocr_score <= 30 ? 'PASS' : category_scores.ocr_score <= 60 ? 'REVIEW' : 'FLAGGED',
      explanation: category_scores.ocr_score <= 30
        ? 'High optical contrast & clean field recognition'
        : 'Optical blur or low-confidence token parsing detected',
      icon: <Type className="w-4 h-4 text-sky-600" />
    },
    {
      id: 'tamper',
      name: 'TAMPER / IMAGE ANALYSIS',
      score: category_scores.tamper_score,
      status: category_scores.tamper_score <= 30 ? 'PASS' : category_scores.tamper_score <= 60 ? 'REVIEW' : 'FLAGGED',
      explanation: category_scores.tamper_score <= 30
        ? 'Uniform compression & intact perimeter boundaries'
        : 'Localized compression disparity or perimeter cutline anomaly',
      icon: <Shield className="w-4 h-4 text-sky-600" />
    },
    {
      id: 'structure',
      name: 'DOCUMENT STRUCTURE',
      score: category_scores.structure_score,
      status: category_scores.structure_score <= 30 ? 'PASS' : category_scores.structure_score <= 60 ? 'REVIEW' : 'FLAGGED',
      explanation: category_scores.structure_score <= 30
        ? 'Standard ISO/IEC 7810 ID-1 card aspect ratio & layout'
        : 'Geometric variance or skewed card boundary detected',
      icon: <LayoutGrid className="w-4 h-4 text-sky-600" />
    },
    {
      id: 'consistency',
      name: 'LOGICAL CONSISTENCY',
      score: category_scores.consistency_score,
      status: category_scores.consistency_score <= 30 ? 'PASS' : category_scores.consistency_score <= 60 ? 'REVIEW' : 'FLAGGED',
      explanation: category_scores.consistency_score <= 30
        ? 'Valid date chronology and cross-field alignment'
        : 'Chronological date contradiction or invalid timestamp',
      icon: <CheckCircle2 className="w-4 h-4 text-sky-600" />
    }
  ];

  const getScoreColor = (score: number) => {
    if (score <= 30) return 'bg-emerald-500';
    if (score <= 60) return 'bg-amber-500';
    return 'bg-rose-500';
  };

  const getStatusBadge = (status: string) => {
    if (status === 'PASS') {
      return <span className="text-[10px] font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">PASS</span>;
    }
    if (status === 'REVIEW') {
      return <span className="text-[10px] font-mono font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">REVIEW</span>;
    }
    return <span className="text-[10px] font-mono font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">FLAGGED</span>;
  };

  const getFriendlyFindingTitle = (f: Finding): string => {
    if (f.title.includes("Photo-Region Compression Disparity")) return "Localized photo compression disparity detected";
    if (f.title.includes("Hard Edge Discontinuity")) return "Hard border cutline detected along photo perimeter";
    if (f.title.includes("Chronological Date Inversion")) return "Chronological inversion: issue date exceeds expiry date";
    if (f.title.includes("Future Date of Birth")) return "Invalid date of birth: timestamp occurs in the future";
    if (f.title.includes("Sub-Optimal Capture Sharpness")) return "Low optical sharpness: document capture is blurry";
    if (f.title.includes("Adequate Image Sharpness")) return "Optical capture sharpness is clear and readable";
    if (f.title.includes("Uniform Compression Residuals")) return "No significant image manipulation detected";
    if (f.title.includes("ISO/IEC 7810 ID-1 Standard Aspect Ratio Compliant")) return "Document structure is consistent with standard ID-1 template";
    if (f.title.includes("Demographic Field OCR Complete")) return "OCR fields were successfully extracted with high confidence";
    return f.title;
  };

  const handleCopy = (key: string, val: string) => {
    navigator.clipboard.writeText(val);
    setCopiedField(key);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // Select active image based on overlay mode
  const displayedImage = activeOverlay === 'ela' && anomaly_overlays?.ela_overlay_base64
    ? anomaly_overlays.ela_overlay_base64
    : activeOverlay === 'zones' && anomaly_overlays?.zones_overlay_base64
    ? anomaly_overlays.zones_overlay_base64
    : processed_preview_base64 || currentImage;

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-300">
      
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-700">
            Document Analysis Complete
          </h2>
        </div>
        <button
          onClick={onNewScan}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-50 text-sky-700 border border-sky-200 text-xs font-bold hover:bg-sky-100 transition active:scale-95"
        >
          <Camera className="w-3.5 h-3.5" />
          <span>New Scan</span>
        </button>
      </div>

      {/* Main Central Risk Card */}
      <div className="rounded-3xl bg-white border border-slate-200/90 shadow-xl p-6 sm:p-8 space-y-6">
        
        {/* Central Circular Gauge */}
        <div className="flex flex-col items-center justify-center text-center">
          <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-slate-400 mb-2">
            AI Screening Risk Assessment
          </span>

          <div className="relative flex items-center justify-center my-2">
            <svg className="w-40 h-40 transform -rotate-90">
              <circle
                cx="80"
                cy="80"
                r={radius}
                stroke="#E2E8F0"
                strokeWidth="10"
                fill="transparent"
              />
              <circle
                cx="80"
                cy="80"
                r={radius}
                stroke={riskConfig.gaugeStroke}
                strokeWidth="10"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                fill="transparent"
                className="transition-all duration-1000 ease-out"
              />
            </svg>
            <div className="absolute flex flex-col items-center justify-center">
              <span className={`text-5xl font-black tracking-tight ${riskConfig.scoreColor} font-mono`}>
                {risk_score.toFixed(0)}
              </span>
              <span className="text-xs font-bold text-slate-400 font-mono">
                / 100
              </span>
            </div>
          </div>

          {/* Large Level Badge */}
          <div className={`mt-2 inline-flex items-center gap-2 px-5 py-1.5 rounded-full text-sm font-black border ${riskConfig.badgeBg}`}>
            {riskConfig.icon}
            <span>{riskConfig.label}</span>
          </div>

          <p className="text-xs text-slate-500 font-medium mt-2">
            {riskConfig.tagline}
          </p>
        </div>

        {/* Officer Action Recommendation Banner */}
        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 block">
              Officer Recommendation
            </span>
            <span className="text-sm sm:text-base font-extrabold text-slate-900">
              {riskConfig.officerRecommendation}
            </span>
          </div>
          <div className="text-right">
            <span className="text-[10px] font-mono text-slate-400 block">Decision Window</span>
            <span className="text-xs font-mono font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-md border border-sky-100">
              {processing_summary.processing_time_ms} ms
            </span>
          </div>
        </div>

      </div>

      {/* Multi-Signal Analysis Section: 4 Major Signal Cards */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-4 rounded-full bg-sky-600 inline-block" />
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-900">
              Multi-Signal Analysis
            </h3>
          </div>
          <span className="text-[11px] text-slate-500">
            Independent forensic indicators
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {signalCards.map((sig) => (
            <div
              key={sig.id}
              className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-sm space-y-2"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded-lg bg-sky-50 border border-slate-200">
                    {sig.icon}
                  </div>
                  <span className="text-xs font-black text-slate-900 tracking-wide font-sans">
                    {sig.name}
                  </span>
                </div>
                {getStatusBadge(sig.status)}
              </div>

              {/* Score bar */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] font-mono text-slate-500">
                  <span>Anomaly Risk</span>
                  <span className="font-bold text-slate-800">{sig.score.toFixed(0)}/100</span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${getScoreColor(sig.score)}`}
                    style={{ width: `${Math.max(5, Math.min(100, sig.score))}%` }}
                  />
                </div>
              </div>

              <p className="text-[11px] text-slate-600 leading-snug pt-0.5">
                {sig.explanation}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Why this result? Explainable Findings */}
      <div className="rounded-3xl bg-white border border-slate-200/90 shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-sky-50 text-sky-600 border border-sky-100">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Why this result?</h3>
              <p className="text-xs text-slate-500">Explainable findings from computer vision & logic engine</p>
            </div>
          </div>
        </div>

        <div className="space-y-2.5">
          {findings.length === 0 ? (
            <p className="text-xs text-slate-400 py-4 text-center">No anomalies or flags logged.</p>
          ) : (
            findings.map((finding) => {
              const friendlyTitle = getFriendlyFindingTitle(finding);
              const isDanger = finding.severity === 'DANGER';
              const isWarning = finding.severity === 'WARNING';

              return (
                <div
                  key={finding.id}
                  className={`p-3.5 rounded-2xl border transition ${
                    isDanger
                      ? 'bg-rose-50/70 border-rose-200 text-rose-900'
                      : isWarning
                      ? 'bg-amber-50/70 border-amber-200 text-amber-900'
                      : 'bg-slate-50/80 border-slate-200/80 text-slate-800'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {isDanger ? (
                      <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    ) : isWarning ? (
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-xs font-bold leading-tight">
                          {friendlyTitle}
                        </h4>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/80 border border-slate-200 font-semibold shrink-0">
                          {finding.confidence.toFixed(0)}%
                        </span>
                      </div>
                      <p className="text-xs mt-1 leading-relaxed opacity-90 font-normal">
                        {finding.description}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Extracted Fields Card */}
      <div className="rounded-3xl bg-white border border-slate-200/90 shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Extracted Fields</h3>
            <p className="text-xs text-slate-500">Demographic data parsed via optical character recognition</p>
          </div>
          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-mono font-bold border ${
            isDemo
              ? 'bg-slate-100 text-slate-700 border-slate-200'
              : 'bg-sky-50 text-sky-800 border-sky-200'
          }`}>
            <Info className="w-3 h-3 text-slate-500" />
            <span>{isDemo ? 'SYNTHETIC DEMO DATA' : 'LIVE DOCUMENT OCR'}</span>
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {extracted_fields.map((field) => {
            const isUndetected = field.value === 'Not detected' || field.value === 'Low OCR confidence';
            return (
              <div
                key={field.field_name}
                className={`p-3.5 rounded-2xl border flex items-center justify-between group ${
                  field.field_name.toLowerCase() === 'address' ? 'sm:col-span-2' : ''
                } ${
                  isUndetected
                    ? 'bg-slate-50/40 border-slate-200/60'
                    : 'bg-slate-50/70 border-slate-200/80'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block mb-0.5">
                    {field.field_name}
                  </span>
                  <span className={`text-xs font-mono block truncate ${
                    isUndetected ? 'font-normal italic text-slate-400' : 'font-bold text-slate-900'
                  }`}>
                    {field.value}
                  </span>
                </div>
                {!isUndetected && (
                  <button
                    onClick={() => handleCopy(field.field_name, field.value)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-white transition ml-2"
                    title="Copy field"
                  >
                    {copiedField === field.field_name ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Document Viewport & Forensics Overlays */}
      <div className="rounded-3xl bg-slate-900 text-white p-5 space-y-4 shadow-xl border border-slate-800">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono font-bold text-sky-300 uppercase tracking-wider">
            Document Canvas & Forensics
          </span>

          {/* Overlay Selector Tabs */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono">
            <button
              onClick={() => setActiveOverlay('original')}
              className={`px-2.5 py-1 rounded-lg transition ${
                activeOverlay === 'original'
                  ? 'bg-sky-600 text-white font-bold shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Original
            </button>
            {anomaly_overlays?.ela_overlay_base64 && (
              <button
                onClick={() => setActiveOverlay('ela')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  activeOverlay === 'ela'
                    ? 'bg-sky-600 text-white font-bold shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                ELA Heatmap
              </button>
            )}
            {anomaly_overlays?.zones_overlay_base64 && (
              <button
                onClick={() => setActiveOverlay('zones')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  activeOverlay === 'zones'
                    ? 'bg-sky-600 text-white font-bold shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Zones
              </button>
            )}
          </div>
        </div>

        {/* Canvas Image */}
        <div className="relative rounded-2xl overflow-hidden bg-black/80 flex items-center justify-center p-2 min-h-[220px] max-h-[360px] border border-slate-800">
          <img
            src={displayedImage}
            alt="Document inspection canvas"
            className="max-h-[340px] w-auto object-contain rounded-lg shadow"
          />
        </div>

        <p className="text-[11px] text-slate-400">
          {activeOverlay === 'ela'
            ? 'Error Level Analysis (ELA) highlights localized JPEG compression rate discrepancies.'
            : activeOverlay === 'zones'
            ? 'Geometric segmentation maps header, photo zone, demographic text, and MRZ.'
            : 'Original document normalized for optical clarity.'}
        </p>
      </div>

      {/* Expandable Technical Details Drawer */}
      <div className="rounded-3xl bg-white border border-slate-200/90 shadow-sm p-5 space-y-3">
        <button
          onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
          className="flex items-center justify-between w-full text-xs font-bold text-slate-700 hover:text-slate-900 transition"
        >
          <span className="flex items-center gap-2 font-mono">
            <Cpu className="w-4 h-4 text-sky-600" />
            <span>Technical Details & Diagnostic Telemetry</span>
          </span>
          {showTechnicalDetails ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </button>

        {showTechnicalDetails && (
          <div className="pt-3 border-t border-slate-100 space-y-3 animate-in fade-in">
            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-[10px] text-slate-400 block">Processing Time</span>
                <span className="font-bold text-slate-800 flex items-center gap-1 mt-0.5">
                  <Clock className="w-3 h-3 text-sky-600" />
                  {processing_summary.processing_time_ms} ms
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-[10px] text-slate-400 block">Image Resolution</span>
                <span className="font-bold text-slate-800 flex items-center gap-1 mt-0.5">
                  <Maximize2 className="w-3 h-3 text-sky-600" />
                  {processing_summary.image_resolution}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-[10px] text-slate-400 block">Signals Checked</span>
                <span className="font-bold text-slate-800 flex items-center gap-1 mt-0.5">
                  <Layers className="w-3 h-3 text-sky-600" />
                  {processing_summary.signals_evaluated} checks
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-[10px] text-slate-400 block">OCR Engine</span>
                <span className="font-bold text-slate-800 flex items-center gap-1 mt-0.5 truncate">
                  <Cpu className="w-3 h-3 text-sky-600 shrink-0" />
                  {processing_summary.ocr_engine}
                </span>
              </div>
            </div>

            <p className="text-[11px] text-slate-500 font-sans leading-relaxed">
              Diagnostic pipeline executes Discrete Fourier / Laplacian variance analysis, Error Level Analysis (ELA) with recompression matrix estimation, and ISO/IEC 7810 ID-1 card geometric registration.
            </p>
          </div>
        )}
      </div>

      {/* Bottom Sticky Action Bar for Officer Mobile Navigation */}
      <div className="sticky bottom-3 z-20 flex gap-3 max-w-lg mx-auto">
        <button
          onClick={onNewScan}
          className="flex-1 py-3.5 px-4 rounded-2xl bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 active:scale-[0.98] text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-sky-600/30 border border-sky-400/30 transition"
        >
          <Camera className="w-4 h-4" />
          <span>Scan Next Document</span>
        </button>
        <button
          onClick={onOpenHistory}
          className="py-3.5 px-4 rounded-2xl bg-white hover:bg-slate-50 active:scale-[0.98] text-slate-800 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md border border-slate-200 transition"
        >
          <span>Audit Log</span>
        </button>
      </div>

    </div>
  );
};
