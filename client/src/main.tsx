import React, { Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ThemeToggle } from './components/ThemeToggle';
import { initTelemetry } from './utils/telemetry';
import './index.css';

const Proto3D = React.lazy(() => import('./proto3d/Proto3D'));
const isProto = new URLSearchParams(window.location.search).has('proto3d');

if (!isProto) initTelemetry();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      {isProto ? (
        <Suspense fallback={<div className="p-6 text-slate-300">Загрузка 3D…</div>}>
          <Proto3D />
        </Suspense>
      ) : (
        <>
          <App />
          <ThemeToggle />
        </>
      )}
    </ErrorBoundary>
  </React.StrictMode>
);
