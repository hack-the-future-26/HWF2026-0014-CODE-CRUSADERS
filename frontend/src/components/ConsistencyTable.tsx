import React from 'react';
import { CheckCircle2, AlertTriangle, XCircle, FileCheck2 } from 'lucide-react';
import { ConsistencyCheck, CheckStatus } from '../types';

interface ConsistencyTableProps {
  checks: ConsistencyCheck[];
}

export const ConsistencyTable: React.FC<ConsistencyTableProps> = ({ checks }) => {
  const getStatusIcon = (status: CheckStatus) => {
    switch (status) {
      case 'PASS':
        return <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />;
      case 'WARNING':
        return <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />;
      case 'FAIL':
        return <XCircle className="w-4 h-4 text-rose-600 shrink-0" />;
    }
  };

  const getStatusBadge = (status: CheckStatus) => {
    switch (status) {
      case 'PASS':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            PASS
          </span>
        );
      case 'WARNING':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
            WARNING
          </span>
        );
      case 'FAIL':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
            FAIL
          </span>
        );
    }
  };

  return (
    <div className="rounded-3xl bg-white border border-slate-200/90 shadow-sm p-6 space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-sky-50 text-sky-600 border border-sky-100">
            <FileCheck2 className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Cross-Field Logical Consistency
            </h3>
            <p className="text-xs text-slate-500">
              Automated evaluation of chronological sanity, date boundaries, and ID-1 MRZ cross-checks
            </p>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200/70 text-slate-500 uppercase font-mono text-[10px]">
              <th className="py-2.5 px-3">Verification Rule</th>
              <th className="py-2.5 px-3 text-center">Status</th>
              <th className="py-2.5 px-3">Validation Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {checks.map((c, i) => (
              <tr key={i} className="hover:bg-slate-50/60 transition">
                <td className="py-3 px-3 font-semibold text-slate-900 flex items-center gap-2">
                  {getStatusIcon(c.status)}
                  <span>{c.check_name}</span>
                </td>
                <td className="py-3 px-3 text-center">
                  {getStatusBadge(c.status)}
                </td>
                <td className="py-3 px-3 text-slate-600 font-normal">
                  {c.details}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
