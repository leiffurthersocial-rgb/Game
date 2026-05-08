import { SESSION_STORAGE_KEY, SOCKET_STORAGE_KEY } from "@/lib/constants";

export interface SessionStorageShape {
  token: string;
  nickname: string;
  roomCode: string;
  playerId: string;
}

export function readSessionStorage(): SessionStorageShape | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionStorageShape;
  } catch {
    return null;
  }
}

export function writeSessionStorage(payload: SessionStorageShape) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(payload));
}

export function clearSessionStorage() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
}

export function readSocketToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(SOCKET_STORAGE_KEY);
}

export function writeSocketToken(token: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SOCKET_STORAGE_KEY, token);
}
