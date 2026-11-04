// Анонимная диагностика: считаем заход и отправляем ошибки браузера на наш сервер.
// Никаких внешних сервисов, cookies и личных данных.

const BASE = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3001';
let sent = 0;

export function reportError(message: string, stack?: string) {
  if (sent >= 10) return; // не заваливаем сервер одной и той же ошибкой в цикле
  sent += 1;
  try {
    fetch(`${BASE}/api/client-error`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, stack, url: window.location.pathname })
    }).catch(() => {});
  } catch { /* ignore */ }
}

export function initTelemetry() {
  window.addEventListener('error', e => reportError(e.message || 'error', e.error?.stack));
  window.addEventListener('unhandledrejection', e => {
    const r: any = e.reason;
    reportError(`unhandledrejection: ${r?.message || String(r)}`, r?.stack);
  });
  try {
    if (!sessionStorage.getItem('bunker:hit')) {
      sessionStorage.setItem('bunker:hit', '1');
      fetch(`${BASE}/api/hit`, { method: 'POST' }).catch(() => {});
    }
  } catch { /* приватный режим */ }
}
