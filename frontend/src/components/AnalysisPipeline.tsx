import React, { useEffect, useState } from 'react';
import { Check, Loader2, Sparkles, Shield, Cpu, Scan, FileCheck } from 'lucide-react';

interface AnalysisPipelineProps {
  documentImage: string;
}

interface Step {
  id: string;
  name: string;
  desc: string;
}

const STEPS: Step[] = [
  { id: 'quality', name: 'Image Quality', desc: 'Laplacian sharpness & noise variance' },
  { id: 'ocr', name: 'OCR Extraction', desc: 'Demographic field & token recognition' },
  { id: 'structure', name: 'Structure Analysis', desc: 'ISO/IEC 7810 ID-1 aspect ratio & zones' },
  { id: 'tamper', name: 'Tamper Analysis', desc: 'Error Level Analysis & border cutlines' },
  { id: 'consistency', name: 'Consistency Check', desc: 'Chronological date boundaries & MRZ' },
  { id: 'risk', name: 'Risk Assessment', desc: 'Multi-signal Bayesian risk scoring' },
];

export const AnalysisPipeline: React.FC<AnalysisPipelineProps> = ({ documentImage }) => {
  const [activeStepIndex, setActiveStepIndex] = useState<number>(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveStepIndex((prev) => (prev < STEPS.length - 1 ? prev + 1 : prev));
    }, 450);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="rounded-3xl bg-white border border-slate-200/90 shadow-xl p-6 sm:p-10 my-6 animate-in fade-in duration-300">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8 space-y-1">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-50 text-sky-700 text-xs font-semibold border border-sky-200">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-600" />
            <span>Multi-Modal Forensic Screening in Progress</span>
          </div>
          <h3 className="text-2xl font-bold text-slate-900 tracking-tight">
            Analyzing Document Signals
          </h3>
          <p className="text-xs sm:text-sm text-slate-500">
            Evaluating optical sharpness, compression residuals, layout compliance, and cross-field logic
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Document Preview with Scanning Laser */}
          <div className="lg:col-span-6 flex flex-col items-center justify-center">
            <div className="relative rounded-2xl overflow-hidden shadow-lg border border-slate-200 bg-slate-950 max-h-[300px] w-full flex items-center justify-center p-2">
              <img
                src={documentImage}
                alt="Scanning Document"
                className="max-h-[280px] w-auto object-contain rounded-lg opacity-85 select-none"
              />
              {/* Laser Scanning Effect */}
              <div className="animate-laser" />
              
              {/* Corner HUD markers */}
              <div className="absolute top-3 left-3 w-4 h-4 border-t-2 border-l-2 border-sky-400 pointer-events-none" />
              <div className="absolute top-3 right-3 w-4 h-4 border-t-2 border-r-2 border-sky-400 pointer-events-none" />
              <div className="absolute bottom-3 left-3 w-4 h-4 border-b-2 border-l-2 border-sky-400 pointer-events-none" />
              <div className="absolute bottom-3 right-3 w-4 h-4 border-b-2 border-r-2 border-sky-400 pointer-events-none" />
              
              <div className="absolute bottom-3 px-3 py-1 rounded-full bg-slate-900/80 backdrop-blur-sm border border-slate-700 text-[10px] font-mono text-sky-300 flex items-center gap-1.5 shadow">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-ping" />
                <span>AI SCAN ACTIVE</span>
              </div>
            </div>
          </div>

          {/* Animated Vertical Pipeline */}
          <div className="lg:col-span-6 space-y-3">
            {STEPS.map((step, idx) => {
              const isCompleted = idx < activeStepIndex;
              const isCurrent = idx === activeStepIndex;
              const isPending = idx > activeStepIndex;

              return (
                <div key={step.id} className="relative">
                  <div
                    className={`flex items-center gap-3.5 p-3 rounded-xl transition-all duration-300 border ${
                      isCurrent
                        ? 'bg-sky-50/80 border-sky-300 shadow-sm ring-1 ring-sky-300'
                        : isCompleted
                        ? 'bg-slate-50/70 border-slate-200 text-slate-800'
                        : 'bg-white border-transparent text-slate-400 opacity-60'
                    }`}
                  >
                    {/* Status Circle */}
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold transition-colors ${
                        isCompleted
                          ? 'bg-emerald-500 text-white shadow-sm'
                          : isCurrent
                          ? 'bg-sky-600 text-white shadow-sm shadow-sky-500/30'
                          : 'bg-slate-200 text-slate-500'
                      }`}
                    >
                      {isCompleted ? (
                        <Check className="w-4 h-4 stroke-[3]" />
                      ) : isCurrent ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <span className="text-[11px] font-mono">{idx + 1}</span>
                      )}
                    </div>

                    {/* Step details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-bold ${isCurrent ? 'text-sky-900' : isCompleted ? 'text-slate-900' : 'text-slate-500'}`}>
                          {step.name}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">
                          {isCompleted ? 'Complete' : isCurrent ? 'Analyzing...' : 'Queued'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 truncate">
                        {step.desc}
                      </p>
                    </div>
                  </div>

                  {/* Vertical connector line */}
                  {idx < STEPS.length - 1 && (
                    <div className="ml-6 w-0.5 h-2 bg-slate-200" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
