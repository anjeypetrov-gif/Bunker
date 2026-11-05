import React, { useEffect, useState } from 'react';

type Theme = 'dark' | 'light';

function readTheme(): Theme {
  try {
    const t = localStorage.getItem('bunker-theme');
    if (t === 'light' || t === 'dark') return t;
  } catch { /* storage unavailable */ }
  return 'dark';
}

function applyTheme(t: Theme) {
  document.documentElement.setAttribute('data-theme', t);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', t === 'light' ? '#e2e8f0' : '#0b0e14');
}

export const ThemeToggle: React.FC = () => {
  const [theme, setTheme] = useState<Theme>(readTheme);

  useEffect(() => {
    applyTheme(theme);
    try { localStorage.setItem('bunker-theme', theme); } catch { /* ignore */ }
  }, [theme]);

  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={next === 'light' ? 'Включить светлую тему' : 'Включить тёмную тему'}
      title={next === 'light' ? 'Светлая тема' : 'Тёмная тема'}
      className="fixed z-[120] right-2 bottom-2 md:right-3 md:bottom-3 w-9 h-9 flex items-center justify-center rounded-full border border-slate-600 bg-slate-900/90 text-slate-200 hover:border-amber-500 hover:text-amber-400 shadow-lg backdrop-blur cursor-pointer text-base leading-none"
    >
      {theme === 'dark' ? '☀' : '☾'}
    </button>
  );
};
