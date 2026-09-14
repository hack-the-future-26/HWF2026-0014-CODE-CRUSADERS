import React, { useState } from 'react';
import { ShieldCheck, ShieldAlert, AlertTriangle, Shield, LayoutGrid, CheckCircle2, Type, ChevronDown, ChevronUp, Cpu, Clock, Layers, Maximize2 } from 'lucide-react';
import { AnalyzeResponse, RiskLevel } from '../types';

interface RiskMeterProps {
  data: AnalyzeResponse;
}

export const RiskMeter: React.FC<RiskMeterProps> = ({ data }) => {
  const [showTechnicalDetails, setShowTechnicalDetails] = useState<boolean>(false);
  const { risk_score, risk_level, recommendation, category_scores, processing_summary } = data;

  const getTheme = (level: RiskLevel) => {
    switch (level) {
      case 'LOW':
        return {
          textColor: 'text-emerald-600',
          badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          gaugeColor: '#10B981',
          trackColor: '#E2E8F0',
          label: 'LOW RISK',
          subLabel: 'Automated Pass',
          icon: <ShieldCheck className="w-5 h-5 text-emerald-600" />
        };
      case 'MEDIUM':
        return {
          textColor: 'text-amber-600',
          badgeBg: 'bg-amber-50 text-amber-700 border-amber-200',
          gaugeColor: '#F59E0B',
          trackColor: '#E2E8F0',
          label: 'MEDIUM RISK',
          subLabel: 'Secondary Review Recommended',
          icon: <AlertTriangle className="w-5 h-5 text-amber-600" />
        };
      case 'HIGH':
      default:
        return {
          textColor: 'text-rose-600',
          badgeBg: 'bg-rose-50 text-rose-700 border-rose-200',
          gaugeColor: '#EF4444',
          trackColor: '#E2E8F0',
          label: 'HIGH RISK',
          subLabel: 'Critical Anomaly Detected',
          icon: <ShieldAlert className="w-5 h-5 text-rose-600" />
        };
    }
  };

  const theme = getTheme(risk_level);

  // SVG Circular progress
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (risk_score / 100) * circumference;

  const signals = [
    {
      id: 'tamper',
      icon: <Shield className="w-4 h-4 text-sky-600" />,
      title: 'Tamper & Splicing',
      score: category_scores.tamper_score,
      desc: category_scores.tamper_score > 30 ? 'Disparity in localized compression / edge cutlines' : 'Uniform compression & intact perimeter boundaries'
    },
    {
      id: 'structure',
      icon: <LayoutGrid className="w-4 h-4 text-sky-600" />,
      title: 'Structure Compliance',
      score: category_scores.structure_score,
      desc: category_scores.structure_score > 30 ? 'Variance in ISO/IEC 7810 ID-1 aspect ratio' : 'Standard card dimensions & balanced quadrant layout'
    },
    {
      id: 'consistency',
      icon: <CheckCircle2 className="w-4 h-4 text-sky-600" />,
      title: 'Logical Consistency',
      score: category_scores.consistency_score,
      desc: category_scores.consistency_score > 30 ? 'Chronological contradiction in issue/expiry/DOB' : 'Valid date chronology & format conformity'
    },
    {
      id: 'ocr',
      icon: <Type className="w-4 h-4 text-sky-600" />,
      title: 'OCR Field Quality',
      score: category_scores.ocr_score,
      desc: category_scores.ocr_score > 30 ? 'Low optical contrast or blurred token confidence' : 'High-confidence text extraction across all fields'
    }
  ];

  const getScoreColor = (score: number) => {
    if (score <= 25) return 'bg-emerald-500';
    if (score <= 60) return 'bg-amber-500';
    return 'bg-rose-500';
  };

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500 font-mono">
            Document Analysis Complete
          </span>
        </div>
        <span className="text-xs text-slate-400 font-mono">
          Screening ID: {processing_summary.ocr_engine ? 'LIVE-SCREEN' : 'DEMO'}
        </span>
      </div>

      {/* Large Result Card */}
      <div className="rounded-3xl bg-white border border-slate-200/90 shadow-lg p-6 sm:p-8 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          
          {/* Circular Animated Score Indicator */}
          <div className="lg:col-span-4 flex flex-col items-center justify-center text-center pb-6 lg:pb-0 lg:pr-6 border-b lg:border-b-0 lg:border-r border-slate-100">
            <span className="text-xs font-mono font-bold uppercase text-slate-400 tracking-wider mb-2">
              Risk Score
            </span>

            <div className="relative flex items-center justify-center mb-3">
              <svg className="w-36 h-36 transform -rotate-90">
                <circle
                  cx="72"
                  cy="72"
                  r={radius}
                  stroke={theme.trackColor}
                  strokeWidth="9"
                  fill="transparent"
                />
                <circle
                  cx="72"
                  cy="72"
                  r={radius}
                  stroke={theme.gaugeColor}
                  strokeWidth="9"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  fill="transparent"
                  className="transition-all duration-1000 ease-out"
                />
              </svg>
              <div className="absolute flex flex-col items-center justify-center">
                <span className={`text-4xl font-extrabold tracking-tight ${theme.textColor} font-mono`}>
                  {risk_score.toFixed(0)}
                </span>
                <span className="text-[11px] font-semibold text-slate-400 font-mono">
                  / 100
                </span>
              </div>
            </div>

            {/* Risk Badge */}
            <div className={`inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-bold border ${theme.badgeBg}`}>
              {theme.icon}
              <span>{theme.label}</span>
            </div>
            <span className="text-[11px] text-slate-500 mt-1 font-medium">
              {theme.subLabel}
            </span>
          </div>

          {/* Why this result? & Signals Breakdown */}
          <div className="lg:col-span-8 space-y-4">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                Why this result?
              </h4>
              <p className="text-sm font-medium text-slate-800 leading-relaxed">
                {recommendation}
              </p>
            </div>

            {/* Four Major Signals as Beautiful Horizontal Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              {signals.map((sig) => (
                <div
                  key={sig.id}
                  className="p-3.5 rounded-2xl bg-slate-50/80 border border-slate-200/70 hover:border-slate-300 transition"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <div className="p-1 rounded-lg bg-white border border-slate-200 text-sky-600 shadow-2xs">
                        {sig.icon}
                      </div>
                      <span className="text-xs font-bold text-slate-900">{sig.title}</span>
                    </div>
                    <span className="text-xs font-mono font-bold text-slate-700">
                      {sig.score.toFixed(0)}/100
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden mb-1.5">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${getScoreColor(sig.score)}`}
                      style={{ width: `${Math.max(4, Math.min(100, sig.score))}%` }}
                    />
                  </div>

                  <p className="text-[11px] text-slate-500 leading-tight">
                    {sig.desc}
                  </p>
                </div>
              ))}
            </div>

          </div>

        </div>

        {/* Expandable Technical Details Drawer */}
        <div className="pt-4 border-t border-slate-100">
          <button
            onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
            className="flex items-center justify-between w-full text-xs font-semibold text-slate-500 hover:text-slate-800 transition py-1"
          >
            <span className="flex items-center gap-1.5 font-mono">
              <Cpu className="w-3.5 h-3.5 text-sky-600" />
              <span>Technical details & engine telemetry</span>
            </span>
            {showTechnicalDetails ? (
              <ChevronUp className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            )}
          </button>

          {showTechnicalDetails && (
            <div className="mt-3 p-4 rounded-2xl bg-slate-50 border border-slate-200/80 text-xs text-slate-600 space-y-3 animate-in fade-in">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono">
                <div className="p-2.5 rounded-xl bg-white border border-slate-200">
                  <span className="text-[10px] text-slate-400 block">Processing Latency</span>
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1 mt-0.5">
                    <Clock className="w-3 h-3 text-sky-600" />
                    {processing_summary.processing_time_ms} ms
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-white border border-slate-200">
                  <span className="text-[10px] text-slate-400 block">Image Resolution</span>
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1 mt-0.5">
                    <Maximize2 className="w-3 h-3 text-sky-600" />
                    {processing_summary.image_resolution}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-white border border-slate-200">
                  <span className="text-[10px] text-slate-400 block">Signals Evaluated</span>
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1 mt-0.5">
                    <Layers className="w-3 h-3 text-sky-600" />
                    {processing_summary.signals_evaluated} checks
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-white border border-slate-200">
                  <span className="text-[10px] text-slate-400 block">OCR Engine</span>
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1 mt-0.5">
                    <Cpu className="w-3 h-3 text-sky-600" />
                    {processing_summary.ocr_engine}
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-slate-500 font-sans">
                Forensic pipeline combines Discrete Fourier / Laplacian variance analysis, Error Level Analysis with recompression matrix estimation, and ISO/IEC 7810 ID-1 card geometric registration.
              </p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
