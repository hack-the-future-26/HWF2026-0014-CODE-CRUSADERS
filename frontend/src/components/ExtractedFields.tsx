import React, { useState } from 'react';
import { FileText, Copy, Check, Target, Info, AlertCircle } from 'lucide-react';
import { ExtractedField } from '../types';

interface ExtractedFieldsProps {
  fields: ExtractedField[];
  highlightedField?: ExtractedField | null;
  onSelectField?: (field: ExtractedField | null) => void;
  isDemo?: boolean;
}

export const ExtractedFields: React.FC<ExtractedFieldsProps> = ({
  fields,
  highlightedField,
  onSelectField,
  isDemo = false
}) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Stage 5 Development logging to trace extracted fields rendered in UI
  console.log(`[STAGE 5: UI Extracted Fields Render] ExtractedFields Component (isDemo=${isDemo}):`, fields.map(f => `${f.field_name}: "${f.value}" (conf: ${f.confidence}%)`));

  const handleCopy = (key: string, val: string) => {
    navigator.clipboard.writeText(val);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const formatDateIfPossible = (fieldName: string, val: string) => {
    if (val === 'Not detected' || val === 'Low OCR confidence') {
      return val;
    }
    if (fieldName.toLowerCase().includes('date') || fieldName.toLowerCase().includes('birth')) {
      const match = val.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (match) {
        const year = match[1];
        const month = parseInt(match[2], 10);
        const day = parseInt(match[3], 10);
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        if (month >= 1 && month <= 12) {
          return `${day} ${monthNames[month - 1]} ${year}`;
        }
      }
    }
    return val;
  };

  return (
    <div className="rounded-3xl bg-white border border-slate-200/90 shadow-sm p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-sky-50 text-sky-600 border border-sky-100">
            <FileText className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Extracted Information</h3>
            <p className="text-xs text-slate-500">
              Parsed demographic fields (click any field to highlight on document canvas)
            </p>
          </div>
        </div>

        {/* Dynamic Badge: Specimen vs Live Upload */}
        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold border ${
          isDemo
            ? 'bg-slate-100 text-slate-600 border-slate-200'
            : 'bg-sky-50 text-sky-700 border-sky-200'
        }`}>
          <Info className="w-3 h-3 text-current" />
          <span>{isDemo ? 'Synthetic Demo Data' : 'Live Document OCR'}</span>
        </span>
      </div>

      {/* Clean Two-Column Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {fields.length === 0 ? (
          <div className="col-span-2 text-center py-6 text-xs text-slate-400">
            No fields extracted.
          </div>
        ) : (
          fields.map((field) => {
            const isHighlighted = highlightedField?.field_name === field.field_name;
            const displayVal = formatDateIfPossible(field.field_name, field.value);
            const isUndetected = field.value === 'Not detected' || field.value === 'Low OCR confidence';
            const isAddress = field.field_name.toLowerCase() === 'address';

            return (
              <div
                key={field.field_name}
                onClick={() => onSelectField && onSelectField(isHighlighted ? null : field)}
                className={`p-3.5 rounded-2xl border transition-all duration-200 cursor-pointer flex flex-col justify-between group ${
                  isAddress ? 'sm:col-span-2' : ''
                } ${
                  isHighlighted
                    ? 'bg-sky-50/90 border-sky-500 ring-2 ring-sky-500/20 shadow-sm'
                    : isUndetected
                    ? 'bg-slate-50/40 border-slate-200/60 hover:border-slate-300'
                    : 'bg-slate-50/70 border-slate-200/80 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    {field.field_name}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {field.bounding_box && !isUndetected && (
                      <span className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded bg-white text-sky-700 border border-slate-200 font-mono">
                        <Target className="w-2.5 h-2.5" /> BBox
                      </span>
                    )}
                    {!isUndetected && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopy(field.field_name, displayVal);
                        }}
                        className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-white transition"
                        title="Copy value"
                      >
                        {copiedKey === field.field_name ? (
                          <Check className="w-3 h-3 text-emerald-600" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    )}
                  </div>
                </div>

                <div className={`text-sm font-mono break-words leading-snug ${
                  isUndetected
                    ? 'font-normal italic text-slate-400'
                    : 'font-bold text-slate-900'
                }`}>
                  {isUndetected ? (
                    <span className="inline-flex items-center gap-1 text-slate-400">
                      <AlertCircle className="w-3.5 h-3.5 text-slate-300 inline shrink-0" />
                      <span>{displayVal}</span>
                    </span>
                  ) : (
                    displayVal
                  )}
                </div>

                <div className="mt-2 pt-1.5 border-t border-slate-200/50 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                  <span>Confidence</span>
                  <span className={`font-semibold ${
                    isUndetected ? 'text-slate-400' : 'text-emerald-600'
                  }`}>
                    {isUndetected ? '0%' : `${field.confidence.toFixed(0)}%`}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
