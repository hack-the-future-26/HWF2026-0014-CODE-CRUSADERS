import React from 'react';
import { Sparkles, CheckCircle2, AlertTriangle, XCircle, ArrowRight } from 'lucide-react';
import { SampleDocument, RiskLevel } from '../types';

interface SyntheticSpecimensProps {
  samples: SampleDocument[];
  selectedSampleId: string | null;
  onSelectSample: (sampleId: string) => void;
  isLoading: boolean;
}

export const SyntheticSpecimens: React.FC<SyntheticSpecimensProps> = ({
  samples,
  selectedSampleId,
  onSelectSample,
  isLoading
}) => {
  const getRiskBadge = (risk: RiskLevel) => {
    switch (risk) {
      case 'LOW':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-2.5 h-2.5" /> Low Risk
          </span>
        );
      case 'MEDIUM':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200">
            <AlertTriangle className="w-2.5 h-2.5" /> Medium Risk
          </span>
        );
      case 'HIGH':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="w-2.5 h-2.5" /> High Risk
          </span>
        );
    }
  };

  const getFriendlyTitle = (sampleId: string, fallbackName: string) => {
    switch (sampleId) {
      case 'clean_valid':
        return 'Clean Specimen';
      case 'tampered_photo':
        return 'Tampered Photo';
      case 'inconsistent_dates':
        return 'Inconsistent Dates';
      case 'blurry_capture':
        return 'Blurry Capture';
      default:
        return fallbackName.replace('Specimen: ', '');
    }
  };

  return (
    <div id="specimens-section" className="space-y-3 pt-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-4 rounded-full bg-sky-600 inline-block" />
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
            Try a demo
          </h3>
          <span className="text-xs text-slate-400 font-normal">
            — Select a pre-bundled synthetic specimen test card
          </span>
        </div>
      </div>

      {/* Polished Horizontal Specimen Selector */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {samples.map((sample) => {
          const isSelected = selectedSampleId === sample.sample_id;
          const friendlyTitle = getFriendlyTitle(sample.sample_id, sample.name);

          return (
            <button
              key={sample.sample_id}
              onClick={() => onSelectSample(sample.sample_id)}
              disabled={isLoading}
              className={`p-3.5 rounded-2xl text-left transition-all duration-200 border flex items-center gap-3.5 group bg-white ${
                isSelected
                  ? 'border-sky-500 ring-2 ring-sky-500/20 shadow-md'
                  : 'border-slate-200/80 hover:border-slate-300 hover:shadow-sm'
              } disabled:opacity-50`}
            >
              {/* Thumbnail preview */}
              <div className="w-14 h-11 rounded-lg overflow-hidden border border-slate-200/90 bg-slate-100 shrink-0 relative shadow-inner">
                <img
                  src={sample.image_data_url}
                  alt={friendlyTitle}
                  className="w-full h-full object-cover object-left"
                />
                {isSelected && (
                  <div className="absolute inset-0 bg-sky-600/10 border-2 border-sky-500 rounded-lg" />
                )}
              </div>

              {/* Text info & badge */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1 mb-0.5">
                  <h4 className="text-xs font-bold text-slate-900 group-hover:text-sky-600 transition-colors truncate">
                    {friendlyTitle}
                  </h4>
                </div>
                <div className="mb-1">
                  {getRiskBadge(sample.expected_risk)}
                </div>
                <p className="text-[11px] text-slate-500 truncate font-normal leading-tight">
                  {sample.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
