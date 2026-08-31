// Persists just enough to survive a page refresh or a brief network drop:
// the room code plus a private per-player session token handed back by the
// server on create/join. Never contains anything sensitive — the token is
// meaningless without the matching server-side room, and expires once the
// room itself is gone.

const CODE_KEY = 'bunker_room_code';
const TOKEN_KEY = 'bunker_session_token';

export interface StoredSession {
  code: string;
  sessionToken: string;
}

export function saveSession(code: string, sessionToken: string): void {
  try {
    localStorage.setItem(CODE_KEY, code);
    localStorage.setItem(TOKEN_KEY, sessionToken);
  } catch {
    // Private browsing / storage disabled — reconnect-on-refresh just won't
    // work for this browser, nothing else in the app depends on it.
  }
}

export function loadSession(): StoredSession | null {
  try {
    const code = localStorage.getItem(CODE_KEY);
    const sessionToken = localStorage.getItem(TOKEN_KEY);
    if (code && sessionToken) return { code, sessionToken };
  } catch {
    // ignore
  }
  return null;
}

export function clearSession(): void {
  try {
    localStorage.removeItem(CODE_KEY);
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}
