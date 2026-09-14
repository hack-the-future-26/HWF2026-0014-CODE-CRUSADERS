import React from 'react';
import { ShieldCheck, Lock, EyeOff, AlertCircle, X, Sparkles } from 'lucide-react';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl rounded-3xl bg-white border border-slate-200 shadow-2xl p-6 sm:p-8 space-y-6">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-xl bg-slate-100 text-slate-400 hover:text-slate-800 transition"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-sky-50 text-sky-600 border border-sky-100">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">About IDShield AI</h3>
            <p className="text-xs text-slate-500">Explainable AI-Assisted Document Risk Screening</p>
          </div>
        </div>

        <div className="space-y-3.5 text-xs text-slate-600 leading-relaxed">
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-start gap-3">
            <Lock className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-slate-900 block mb-0.5">Zero-Retention Privacy Guarantee</span>
              Uploaded images and biometric crops are processed strictly in volatile server RAM. Raw image files are immediately wiped and never saved to database tables or external cloud storage.
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-start gap-3">
            <EyeOff className="w-5 h-5 text-sky-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-slate-900 block mb-0.5">100% Synthetic Demo Specimens</span>
              All bundled demonstration specimens (Alex Morgan Chen, Jordan Taylor Reed, etc.) are synthetically rendered vector mockups conforming to ISO/IEC 7810 ID-1 standard dimensions without containing real individual PII.
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-slate-900 block mb-0.5">AI-Assisted Screening Prototype</span>
              IDShield AI provides explainable risk scoring to assist compliance officers and automated fraud triage. Final identity verification determinations must adhere to certified trust frameworks with human-in-the-loop oversight.
            </div>
          </div>
        </div>

        <div className="pt-2 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-sm transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
