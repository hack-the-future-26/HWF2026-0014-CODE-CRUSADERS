import React, { useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Sparkles, ChevronDown, ChevronUp, ShieldCheck } from 'lucide-react';
import { Finding, FindingSeverity } from '../types';

interface FindingsListProps {
  findings: Finding[];
}

export const FindingsList: React.FC<FindingsListProps> = ({ findings }) => {
  const [showTechnicalCodes, setShowTechnicalCodes] = useState<boolean>(false);

  const getHumanFriendlyTitle = (f: Finding): string => {
    // Convert any developer jargon into clear, human-readable prose if needed
    if (f.title.includes("Photo-Region Compression Disparity")) {
      return "Localized photo compression disparity detected";
    }
    if (f.title.includes("Hard Edge Discontinuity")) {
      return "Hard border cutline detected along photo perimeter";
    }
    if (f.title.includes("Chronological Date Inversion")) {
      return "Chronological inversion: issue date exceeds expiry date";
    }
    if (f.title.includes("Future Date of Birth")) {
      return "Invalid date of birth: timestamp occurs in the future";
    }
    if (f.title.includes("Sub-Optimal Capture Sharpness")) {
      return "Low optical sharpness: document capture is blurry";
    }
    if (f.title.includes("Adequate Image Sharpness")) {
      return "Optical capture sharpness is clear and readable";
    }
    if (f.title.includes("Uniform Compression Residuals")) {
      return "No significant image manipulation detected";
    }
    if (f.title.includes("ISO/IEC 7810 ID-1 Standard Aspect Ratio Compliant")) {
      return "Document structure is consistent with standard ID-1 template";
    }
    if (f.title.includes("Demographic Field OCR Complete")) {
      return "OCR fields were successfully extracted with high confidence";
    }
    return f.title;
  };

  const getSeverityIcon = (severity: FindingSeverity) => {
    switch (severity) {
      case 'DANGER':
        return <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />;
      case 'WARNING':
        return <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />;
      case 'INFO':
      default:
        return <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />;
    }
  };

  const getSeverityStyle = (severity: FindingSeverity) => {
    switch (severity) {
      case 'DANGER':
        return 'bg-rose-50/70 border-rose-200 text-rose-900';
      case 'WARNING':
        return 'bg-amber-50/70 border-amber-200 text-amber-900';
      case 'INFO':
      default:
        return 'bg-slate-50/80 border-slate-200/80 text-slate-800';
    }
  };

  return (
    <div className="rounded-3xl bg-white border border-slate-200/90 shadow-sm p-6 space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-sky-50 text-sky-600 border border-sky-100">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">AI Findings</h3>
            <p className="text-xs text-slate-500">
              Clear explainable outcomes from computer vision and verification rules
            </p>
          </div>
        </div>
      </div>

      {/* Human-Readable Findings List */}
      <div className="space-y-2.5">
        {findings.length === 0 ? (
          <div className="text-center py-6 text-xs text-slate-400">
            No active findings recorded for this document.
          </div>
        ) : (
          findings.map((finding) => {
            const friendlyTitle = getHumanFriendlyTitle(finding);
            return (
              <div
                key={finding.id}
                className={`p-3.5 rounded-2xl border transition ${getSeverityStyle(finding.severity)}`}
              >
                <div className="flex items-start gap-3">
                  {getSeverityIcon(finding.severity)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-xs font-bold leading-tight">
                        {friendlyTitle}
                      </h4>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/80 border border-slate-200 font-semibold shrink-0">
                        {finding.confidence.toFixed(0)}% confidence
                      </span>
                    </div>
                    <p className="text-xs mt-1 leading-relaxed opacity-90 font-normal">
                      {finding.description}
                    </p>

                    {/* Internal code hidden behind toggle */}
                    {showTechnicalCodes && (
                      <div className="mt-2 pt-1.5 border-t border-slate-200/60 flex items-center gap-2 font-mono text-[10px] text-slate-500">
                        <span>Signal:</span>
                        <code className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-sky-700">
                          {finding.signal_source}
                        </code>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Expandable Technical Code toggle */}
      <div className="pt-2 text-right">
        <button
          onClick={() => setShowTechnicalCodes(!showTechnicalCodes)}
          className="text-[11px] font-medium text-slate-500 hover:text-sky-600 transition inline-flex items-center gap-1"
        >
          <span>{showTechnicalCodes ? 'Hide raw signal sources' : 'Show raw signal sources'}</span>
          {showTechnicalCodes ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>
    </div>
  );
};
