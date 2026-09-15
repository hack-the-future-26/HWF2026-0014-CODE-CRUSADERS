import React from 'react';
import { X, Trash2, History, ShieldCheck, AlertTriangle, ShieldAlert } from 'lucide-react';
import { HistoryItem } from '../types';

interface AuditHistoryModalProps {
  isOpen: boolean;
  history: HistoryItem[];
  onClose: () => void;
  onClear: () => void;
}

export const AuditHistoryModal: React.FC<AuditHistoryModalProps> = ({
  isOpen,
  history,
  onClose,
  onClear
}) => {
  if (!isOpen) return null;

  const getRiskBadge = (level: string) => {
    switch (level) {
      case 'LOW':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <ShieldCheck className="w-3 h-3" /> LOW
          </span>
        );
      case 'MEDIUM':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <AlertTriangle className="w-3 h-3" /> MEDIUM
          </span>
        );
      case 'HIGH':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
            <ShieldAlert className="w-3 h-3" /> HIGH
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl rounded-3xl bg-white border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-sky-50 text-sky-600 border border-sky-100">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Screening Audit Logs</h3>
              <p className="text-xs text-slate-500">Stored locally in SQLite • Raw credential images are zero-retained</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {history.length > 0 && (
              <button
                onClick={onClear}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-rose-50 hover:text-rose-700 text-slate-600 border border-slate-200 hover:border-rose-200 text-xs font-semibold transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear All</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-900 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-3">
          {history.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <History className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm font-medium text-slate-600">No screening sessions logged yet.</p>
              <p className="text-xs text-slate-400 mt-1">Screen a synthetic specimen or upload a card to generate audit trails.</p>
            </div>
          ) : (
            history.map((item) => (
              <div
                key={item.id}
                className="p-4 rounded-2xl bg-slate-50/70 border border-slate-200/80 hover:border-slate-300 transition"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2">
                    {getRiskBadge(item.risk_level)}
                    <span className="text-xs font-mono font-bold text-slate-800">
                      Score: {item.risk_score.toFixed(0)}/100
                    </span>
                    <span className="text-xs text-slate-400">• {item.document_type}</span>
                  </div>
                  <span className="text-[11px] font-mono text-slate-400">{item.timestamp}</span>
                </div>

                <p className="text-xs font-semibold text-slate-800 mb-1">
                  Summary Finding: <span className="font-normal text-slate-600">{item.summary_findings}</span>
                </p>

                <p className="text-[11px] text-slate-500 line-clamp-2">
                  {item.recommendation}
                </p>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 text-right">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition shadow-sm"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
