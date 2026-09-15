import React from 'react';
import { ShieldCheck, History, Info, Sparkles, FileSearch } from 'lucide-react';
import { HealthStatus } from '../types';

interface NavbarProps {
  health: HealthStatus | null;
  onOpenHistory: () => void;
  onOpenAbout: () => void;
  onScrollToSection: (sectionId: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  health,
  onOpenHistory,
  onOpenAbout,
  onScrollToSection
}) => {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur-md shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        
        {/* Brand */}
        <div className="flex items-center gap-8">
          <div 
            onClick={() => onScrollToSection('hero-section')}
            className="flex items-center gap-2.5 cursor-pointer group"
          >
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-600 to-cyan-500 text-white shadow-md shadow-sky-500/20 group-hover:scale-105 transition-transform">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-lg font-bold tracking-tight text-slate-900">IDShield</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-sky-50 text-sky-700 border border-sky-200/80 font-mono">
                AI
              </span>
            </div>
          </div>

          {/* Navigation links */}
          <nav className="hidden md:flex items-center gap-1 text-sm font-medium text-slate-600">
            <button
              onClick={() => onScrollToSection('upload-section')}
              className="px-3 py-1.5 rounded-lg hover:text-sky-600 hover:bg-slate-100/80 transition"
            >
              Analyze
            </button>
            <button
              onClick={() => onScrollToSection('specimens-section')}
              className="px-3 py-1.5 rounded-lg hover:text-sky-600 hover:bg-slate-100/80 transition flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5 text-sky-500" />
              <span>Demo Specimens</span>
            </button>
            <button
              onClick={onOpenHistory}
              className="px-3 py-1.5 rounded-lg hover:text-sky-600 hover:bg-slate-100/80 transition flex items-center gap-1.5"
            >
              <History className="w-3.5 h-3.5 text-slate-400" />
              <span>Audit History</span>
            </button>
            <button
              onClick={onOpenAbout}
              className="px-3 py-1.5 rounded-lg hover:text-sky-600 hover:bg-slate-100/80 transition"
            >
              About
            </button>
          </nav>
        </div>

        {/* Live Engine Status Indicator */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100/80 border border-slate-200/80 text-xs text-slate-700 font-medium">
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                health?.status === 'healthy' ? 'bg-emerald-400' : 'bg-amber-400'
              }`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${
                health?.status === 'healthy' ? 'bg-emerald-500' : 'bg-amber-500'
              }`}></span>
            </span>
            <span className="font-sans">
              {health?.status === 'healthy' ? 'AI Engine Ready' : 'Connecting...'}
            </span>
          </div>

          <button
            onClick={onOpenHistory}
            className="md:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition"
            title="Audit History"
          >
            <History className="w-4 h-4" />
          </button>
        </div>

      </div>
    </header>
  );
};
