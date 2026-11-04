import React from 'react';
import { reportError } from '../utils/telemetry';

/** Если интерфейс упал, показываем понятный экран вместо белой страницы. */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { reportError(`render: ${error.message}`, error.stack); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="min-h-screen bg-[#0b0e14] text-slate-100 flex items-center justify-center p-6 text-center">
        <div className="space-y-4 max-w-sm">
          <div className="text-4xl">⚠️</div>
          <div className="text-lg font-black text-amber-300">Что-то пошло не так</div>
          <p className="text-sm text-slate-400">Мы уже получили отчёт об ошибке. Обновите страницу — игра вернёт вас в комнату.</p>
          <button onClick={() => window.location.reload()} className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm cursor-pointer">
            Обновить страницу
          </button>
        </div>
      </div>
    );
  }
}
