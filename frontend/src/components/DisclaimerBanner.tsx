import React from 'react';
import { ShieldCheck, Lock, EyeOff, AlertCircle, X } from 'lucide-react';

interface DisclaimerBannerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DisclaimerBanner: React.FC<DisclaimerBannerProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl p-6">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white transition"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 rounded-xl bg-sky-950 text-sky-400 border border-sky-800">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">IDShield AI Architecture & Ethics</h3>
            <p className="text-xs text-slate-400">Explainable Screening Prototype</p>
          </div>
        </div>

        <div className="space-y-3.5 text-xs text-slate-300 leading-relaxed">
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-start gap-2.5">
            <Lock className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-white block mb-0.5">Zero-Retention Privacy Policy</span>
              Raw image uploads and biometric portrait crops are processed strictly in volatile server memory and are never saved to disk or external cloud buckets.
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-start gap-2.5">
            <EyeOff className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-white block mb-0.5">Synthetic Test Specimen Bundles</span>
              All bundled demonstration credentials (e.g. Jordan Reed, Alex Morgan) are synthetically generated vector mockups conforming to ISO/IEC 7810 ID-1 standard dimensions without containing real individual PII.
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-white block mb-0.5">Non-Government Screening Tool</span>
              This system is an automated risk-assistance prototype. Final identity verification determinations must adhere to certified trust frameworks with human-in-the-loop oversight.
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-md transition"
          >
            I Understand
          </button>
        </div>
      </div>
    </div>
  );
};
