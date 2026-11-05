import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ThemeToggle } from './components/ThemeToggle';
import { initTelemetry } from './utils/telemetry';
import './index.css';

initTelemetry();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
      <ThemeToggle />
    </ErrorBoundary>
  </React.StrictMode>
);
