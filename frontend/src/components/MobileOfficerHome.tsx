import React from 'react';
import { Camera, Image as ImageIcon, Sparkles, Shield, ShieldCheck, History, Info, AlertTriangle, XCircle, CheckCircle2, ChevronRight, Activity } from 'lucide-react';
import { HealthStatus, SampleDocument, RiskLevel } from '../types';
import { api } from '../services/api';

interface MobileOfficerHomeProps {
  health: HealthStatus | null;
  samples: SampleDocument[];
  selectedSampleId: string | null;
  onScanDocument: () => void;
  onSelectImage: () => void;
  onSelectSample: (sampleId: string) => void;
  onOpenHistory: () => void;
  onOpenAbout: () => void;
  isLoading: boolean;
}

export const MobileOfficerHome: React.FC<MobileOfficerHomeProps> = ({
  health,
  samples,
  selectedSampleId,
  onScanDocument,
  onSelectImage,
  onSelectSample,
  onOpenHistory,
  onOpenAbout,
  isLoading
}) => {
  const isEngineReady = health?.status === 'healthy' || health?.status === 'degraded';

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
            <AlertTriangle className="w-2.5 h-2.5" /> Med Risk
          </span>
        );
      case 'HIGH':
      default:
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
    <div className="space-y-6 pb-8">
      
      {/* Officer Header Card */}
      <div className="rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900 to-sky-950 text-white p-6 sm:p-8 shadow-xl border border-slate-800/80 relative overflow-hidden">
        {/* Background accent glow */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-sky-500/20 border border-sky-400/30 text-sky-400 shadow-sm">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                IDShield <span className="text-sky-400">AI</span>
              </h1>
              <span className="text-[10px] font-mono tracking-wider text-sky-300 uppercase">
                Field Inspection Suite
              </span>
            </div>
          </div>

          {/* Top Quick Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={onOpenHistory}
              className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition active:scale-95"
              title="Audit Logs"
            >
              <History className="w-4 h-4" />
            </button>
            <button
              onClick={onOpenAbout}
              className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition active:scale-95"
              title="About & Ethics"
            >
              <Info className="w-4 h-4" />
            </button>
          </div>
        </div>

        <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-lg mb-4">
          AI-assisted identity document risk screening for authorized field and border inspection officers.
        </p>

        {/* Engine Status Indicator & Active API Target */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-950/70 border border-slate-700 text-xs font-medium">
            <span className={`w-2 h-2 rounded-full ${isEngineReady ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
            <span className="font-mono text-slate-200">
              {isEngineReady ? '● AI Engine Ready' : 'Connecting Engine...'}
            </span>
            {health?.version && (
              <span className="text-[10px] text-slate-400 font-mono pl-1 border-l border-slate-700">
                v{health.version}
              </span>
            )}
          </div>
          <span className="text-[10px] font-mono text-sky-300/80 px-2.5 py-1 rounded-full bg-slate-950/60 border border-slate-800 tracking-tight">
            API: {api.getBaseUrl()}
          </span>
        </div>
      </div>

      {/* Primary & Secondary Officer Action Buttons */}
      <div className="space-y-3">
        
        {/* Primary Action: SCAN DOCUMENT */}
        <button
          onClick={onScanDocument}
          disabled={isLoading}
          className="w-full py-5 px-6 rounded-3xl bg-gradient-to-r from-sky-600 via-sky-500 to-blue-600 hover:from-sky-500 hover:to-blue-500 active:scale-[0.99] text-white shadow-xl shadow-sky-600/25 border border-sky-400/40 flex items-center justify-between transition-all group disabled:opacity-50"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center border border-white/20 shadow-inner group-hover:scale-105 transition-transform">
              <Camera className="w-6 h-6 text-white stroke-[2.5]" />
            </div>
            <div className="text-left">
              <span className="text-base sm:text-lg font-black tracking-wide block uppercase">
                Scan Document
              </span>
              <span className="text-xs text-sky-100 font-medium opacity-90">
                Camera viewfinder with alignment HUD
              </span>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-white/70 group-hover:translate-x-1 transition-transform" />
        </button>

        {/* Secondary Action: SELECT IMAGE */}
        <button
          onClick={onSelectImage}
          disabled={isLoading}
          className="w-full py-4 px-6 rounded-3xl bg-white hover:bg-slate-50 active:scale-[0.99] text-slate-800 shadow-md border border-slate-200/90 flex items-center justify-between transition-all group disabled:opacity-50"
        >
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-2xl bg-slate-100 flex items-center justify-center border border-slate-200 group-hover:bg-sky-50 transition-colors">
              <ImageIcon className="w-5 h-5 text-slate-600 group-hover:text-sky-600" />
            </div>
            <div className="text-left">
              <span className="text-sm sm:text-base font-bold text-slate-900 block">
                Select Image
              </span>
              <span className="text-xs text-slate-500">
                Choose document photo from device gallery
              </span>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-400 group-hover:translate-x-1 transition-transform" />
        </button>

      </div>

      {/* Synthetic Demo Specimens Section */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-4 rounded-full bg-sky-600 inline-block" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900 font-mono">
              Try Demo Specimens
            </h2>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 font-semibold">
            SYNTHETIC DEMO DATA
          </span>
        </div>

        <p className="text-xs text-slate-500">
          Field-ready test cards pre-bundled for instant evaluation and compliance verification:
        </p>

        {/* Compact Specimen Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {samples.map((sample) => {
            const isSelected = selectedSampleId === sample.sample_id;
            const friendlyTitle = getFriendlyTitle(sample.sample_id, sample.name);

            return (
              <button
                key={sample.sample_id}
                onClick={() => onSelectSample(sample.sample_id)}
                disabled={isLoading}
                className={`p-3.5 rounded-2xl text-left transition-all duration-200 border flex items-center gap-3.5 bg-white ${
                  isSelected
                    ? 'border-sky-500 ring-2 ring-sky-500/20 shadow-md'
                    : 'border-slate-200/80 hover:border-slate-300 hover:shadow-sm'
                } disabled:opacity-50 active:scale-[0.98]`}
              >
                {/* Thumbnail */}
                <div className="w-14 h-11 rounded-lg overflow-hidden border border-slate-200 bg-slate-100 shrink-0 relative">
                  <img
                    src={sample.image_data_url}
                    alt={friendlyTitle}
                    className="w-full h-full object-cover object-left"
                  />
                  {isSelected && (
                    <div className="absolute inset-0 bg-sky-600/10 border border-sky-500 rounded-lg" />
                  )}
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <h3 className="text-xs font-bold text-slate-900 truncate">
                      {friendlyTitle}
                    </h3>
                  </div>
                  <div className="mb-1">
                    {getRiskBadge(sample.expected_risk)}
                  </div>
                  <p className="text-[11px] text-slate-500 truncate leading-tight">
                    {sample.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

    </div>
  );
};
