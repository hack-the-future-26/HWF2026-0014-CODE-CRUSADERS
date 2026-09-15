import React, { useRef, useState } from 'react';
import { Upload, Camera, FileText, ShieldAlert, CheckCircle, Sparkles, ArrowUpRight } from 'lucide-react';

interface UploadSectionProps {
  onUploadFile: (file: File) => void;
  isLoading: boolean;
}

export const UploadSection: React.FC<UploadSectionProps> = ({
  onUploadFile,
  isLoading
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onUploadFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onUploadFile(e.target.files[0]);
    }
  };

  return (
    <div id="upload-section" className="space-y-8 py-6">
      {/* Hero Header */}
      <div id="hero-section" className="text-center max-w-3xl mx-auto space-y-3">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-50 border border-sky-200 text-sky-700 text-xs font-semibold tracking-wide">
          <Sparkles className="w-3.5 h-3.5 text-sky-600" />
          <span>AI-assisted identity document risk screening</span>
        </div>

        <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900 tracking-tight">
          IDShield <span className="bg-gradient-to-r from-sky-600 to-cyan-600 bg-clip-text text-transparent">AI</span>
        </h1>

        <p className="text-base sm:text-lg text-slate-600 leading-relaxed max-w-2xl mx-auto font-normal">
          Analyze multiple document signals in seconds — and understand exactly why a document requires attention.
        </p>
      </div>

      {/* Prominent Central Upload Card */}
      <div className="max-w-2xl mx-auto">
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative group rounded-3xl p-8 sm:p-10 text-center cursor-pointer transition-all duration-300 border-2 ${
            isDragging
              ? 'border-sky-500 bg-sky-50/70 shadow-lg ring-4 ring-sky-500/10'
              : 'border-slate-200/90 bg-white hover:border-sky-300 hover:shadow-xl shadow-sm'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={handleFileInputChange}
            disabled={isLoading}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileInputChange}
            disabled={isLoading}
          />

          <div className="flex flex-col items-center justify-center space-y-4">
            {/* Upload Icon */}
            <div className="w-16 h-16 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center border border-sky-100 group-hover:scale-110 group-hover:bg-sky-100/80 transition-all duration-200 shadow-sm">
              <Upload className="w-8 h-8" />
            </div>

            {/* Headline and CTA */}
            <div className="space-y-1">
              <h2 className="text-lg sm:text-xl font-bold text-slate-900">
                Drop a synthetic document here
              </h2>
              <p className="text-sm text-slate-500">
                or <span className="text-sky-600 font-semibold underline underline-offset-2">Choose document</span> from your device
              </p>
            </div>

            {/* File Format & Feature Pills */}
            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              <span className="px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 text-xs font-mono font-medium">PNG</span>
              <span className="px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 text-xs font-mono font-medium">JPG</span>
              <span className="px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 text-xs font-mono font-medium">WEBP</span>
              <span className="px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 text-xs font-sans font-medium">Drag and drop</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  cameraInputRef.current?.click();
                }}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-md bg-sky-50 text-sky-700 hover:bg-sky-100 text-xs font-medium border border-sky-200 transition"
              >
                <Camera className="w-3 h-3" />
                <span>Capture</span>
              </button>
            </div>
          </div>
        </div>

        {/* Three Compact Feature Indicators below uploader */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6">
          <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-white border border-slate-200/80 shadow-sm">
            <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0 border border-sky-100">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900">OCR Analysis</h3>
              <p className="text-[11px] text-slate-500">Field parsing & clarity</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-white border border-slate-200/80 shadow-sm">
            <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 border border-rose-100">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900">Tamper Detection</h3>
              <p className="text-[11px] text-slate-500">ELA & border cutlines</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-white border border-slate-200/80 shadow-sm">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100">
              <CheckCircle className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900">Consistency Checking</h3>
              <p className="text-[11px] text-slate-500">Date chronology logic</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
