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
      // Анонимный id посетителя: случайная строка в localStorage, без cookies и без личных данных.
      let vid = '', ret = false;
      try {
        vid = localStorage.getItem('bunker:vid') || '';
        if (vid) ret = true;
        else {
          vid = Math.random().toString(36).slice(2) + Date.now().toString(36);
          localStorage.setItem('bunker:vid', vid);
        }
      } catch { /* приватный режим — считаем как нового */ }
      fetch(`${BASE}/api/hit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vid, ret, lang: (navigator.language || '').slice(0, 2), ref: document.referrer || '' })
      }).catch(() => {});
    }
  } catch { /* приватный режим */ }
}

// Итог попытки видеосвязи (ok=false — не удалось соединиться): помогает находить проблемы с WebRTC/TURN.
export function reportRtc(ok: boolean) {
  try {
    fetch(`${BASE}/api/rtc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok })
    }).catch(() => {});
  } catch { /* ignore */ }
}
