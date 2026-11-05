import React, { useEffect, useRef, useState } from 'react';

type Theme = 'dark' | 'light';

function readTheme(): Theme {
  try {
    const t = sessionStorage.getItem('bunker-theme');
    if (t === 'light' || t === 'dark') return t;
  } catch { /* storage unavailable */ }
  return 'dark';
}

function applyTheme(t: Theme) {
  document.documentElement.setAttribute('data-theme', t);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', t === 'light' ? '#e2e8f0' : '#0b0e14');
}

const OPTIONS: { id: Theme; label: string; icon: string }[] = [
  { id: 'dark', label: 'Тёмная', icon: '☾' },
  { id: 'light', label: 'Светлая', icon: '☀' }
];

export const ThemeToggle: React.FC = () => {
  const [theme, setTheme] = useState<Theme>(readTheme);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    applyTheme(theme);
    try { sessionStorage.setItem('bunker-theme', theme); } catch { /* ignore */ }
  }, [theme]);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  return (
    <div ref={ref} className="fixed z-[120] top-1.5 right-1.5 md:top-2 md:right-3 text-xs">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Тема оформления"
        className="h-7 px-2 flex items-center gap-1 rounded-full border border-slate-600 bg-slate-900/90 text-slate-200 hover:border-amber-500 hover:text-amber-400 shadow backdrop-blur cursor-pointer font-mono"
      >
        <span className="text-[11px] leading-none font-bold uppercase tracking-wide">Тема</span>
        <span className="text-[10px] leading-none opacity-70">▾</span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 mt-1 min-w-[120px] rounded border border-slate-600 bg-slate-900 shadow-xl overflow-hidden">
          {OPTIONS.map(o => (
            <button
              key={o.id}
              role="menuitemradio"
              aria-checked={o.id === theme}
              onClick={() => { setTheme(o.id); setOpen(false); }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left font-mono cursor-pointer hover:bg-slate-800 ${o.id === theme ? 'text-amber-400 font-bold' : 'text-slate-200'}`}
            >
              <span className="w-4 text-center">{o.icon}</span>{o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
