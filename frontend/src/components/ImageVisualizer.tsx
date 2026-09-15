import React, { useState } from 'react';
import { Eye, Flame, LayoutGrid, Scan, Info, Maximize2 } from 'lucide-react';
import { ExtractedField } from '../types';

interface ImageVisualizerProps {
  originalImage: string;
  elaOverlay?: string;
  zonesOverlay?: string;
  extractedFields: ExtractedField[];
  highlightedField?: ExtractedField | null;
}

type VisualizerMode = 'standard' | 'ela' | 'zones';

export const ImageVisualizer: React.FC<ImageVisualizerProps> = ({
  originalImage,
  elaOverlay,
  zonesOverlay,
  extractedFields,
  highlightedField
}) => {
  const [mode, setMode] = useState<VisualizerMode>('standard');
  const [imgDim, setImgDim] = useState<{ w: number; h: number }>({ w: 860, h: 540 });

  const getImageSource = () => {
    switch (mode) {
      case 'ela':
        return elaOverlay || originalImage;
      case 'zones':
        return zonesOverlay || originalImage;
      case 'standard':
      default:
        return originalImage;
    }
  };

  return (
    <div className="rounded-3xl bg-white border border-slate-200/90 shadow-sm overflow-hidden flex flex-col h-full">
      {/* Visualizer Mode Toolbar */}
      <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-white border border-slate-200 shadow-2xs">
          <button
            onClick={() => setMode('standard')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              mode === 'standard'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Document Preview</span>
          </button>

          <button
            onClick={() => setMode('ela')}
            disabled={!elaOverlay}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition disabled:opacity-40 ${
              mode === 'ela'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Flame className="w-3.5 h-3.5" />
            <span>ELA Thermal Heatmap</span>
          </button>

          <button
            onClick={() => setMode('zones')}
            disabled={!zonesOverlay}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition disabled:opacity-40 ${
              mode === 'zones'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>Zone Segmentation</span>
          </button>
        </div>

        <div className="text-[11px] font-mono text-slate-500 flex items-center gap-1.5">
          <Scan className="w-3.5 h-3.5 text-sky-600" />
          <span>Multi-Layer Canvas</span>
        </div>
      </div>

      {/* Dark Navy Inspection Canvas */}
      <div className="relative flex-1 min-h-[340px] flex items-center justify-center p-6 bg-navy-950 overflow-hidden">
        <div className="relative max-w-full max-h-[460px] rounded-2xl overflow-hidden shadow-2xl border border-slate-800/80">
          <img
            src={getImageSource()}
            alt="Screened Credential Canvas"
            className="w-auto h-auto max-h-[430px] object-contain select-none"
            onLoad={(e) => {
              const nw = e.currentTarget.naturalWidth;
              const nh = e.currentTarget.naturalHeight;
              if (nw && nh) {
                setImgDim({ w: nw, h: nh });
              }
            }}
          />

          {/* Interactive Bounding Box Highlight */}
          {highlightedField && highlightedField.bounding_box && (
            <div
              className="absolute border-2 border-sky-400 bg-sky-500/25 rounded-md shadow-glow pointer-events-none transition-all duration-300"
              style={{
                left: `${(highlightedField.bounding_box.x / imgDim.w) * 100}%`,
                top: `${(highlightedField.bounding_box.y / imgDim.h) * 100}%`,
                width: `${(highlightedField.bounding_box.width / imgDim.w) * 100}%`,
                height: `${(highlightedField.bounding_box.height / imgDim.h) * 100}%`,
              }}
            >
              <span className="absolute -top-6 left-0 px-2 py-0.5 rounded-md bg-sky-600 text-[10px] font-mono font-bold text-white whitespace-nowrap shadow-md">
                {highlightedField.field_name}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Mode Context Explainer & Legend */}
      <div className="p-3.5 border-t border-slate-100 bg-white text-xs text-slate-500 flex items-center justify-between">
        {mode === 'standard' && (
          <div className="flex items-center gap-2">
            <Info className="w-3.5 h-3.5 text-sky-600 shrink-0" />
            <span>Normalized specimen preview conforming to ISO/IEC 7810 ID-1 standard dimensions.</span>
          </div>
        )}
        {mode === 'ela' && (
          <div className="flex flex-wrap items-center gap-3 text-[11px]">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />
              <span>Blue: Uniform baseline compression</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
              <span className="font-semibold text-rose-700">Red/Orange: Error level disparity (digital tampering indicator)</span>
            </div>
          </div>
        )}
        {mode === 'zones' && (
          <div className="flex flex-wrap items-center gap-3 text-[11px]">
            <span className="text-sky-700 font-medium">Cyan: Header</span>
            <span className="text-emerald-700 font-medium">Green: Portrait</span>
            <span className="text-blue-700 font-medium">Blue: Demographics</span>
            <span className="text-purple-700 font-medium">Purple: MRZ Strip</span>
          </div>
        )}
      </div>
    </div>
  );
};
