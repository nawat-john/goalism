import type { User } from "@study-planner/shared";
import { useAuthStore } from "../auth/token-store";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

/** Mirrors the backend's `{ error: { code, message, details } }` envelope. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown[],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface SessionResponse {
  accessToken: string;
  user: User;
}

// De-dupe concurrent refreshes: many in-flight 401s share one /auth/refresh call.
let refreshPromise: Promise<string | null> | null = null;

async function performRefresh(): Promise<string | null> {
  const res = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) {
    useAuthStore.getState().clear();
    return null;
  }
  const data = (await res.json()) as SessionResponse;
  useAuthStore.getState().setSession(data.accessToken, data.user);
  return data.accessToken;
}

/** Rehydrate the in-memory session from the refresh cookie. Safe to call on boot. */
export function refreshSession(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = performRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

interface ApiFetchOptions extends RequestInit {
  /** Skip the automatic 401 → refresh → retry (used by the auth endpoints themselves). */
  skipAuthRetry?: boolean;
}

/**
 * Thin fetch wrapper that attaches the Bearer access token, sends the refresh
 * cookie, and on a 401 transparently refreshes once and retries the request.
 */
export async function apiFetch<T>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<T> {
  const { skipAuthRetry, ...init } = options;

  const send = (token: string | null) =>
    fetch(`${API_URL}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });

  let res = await send(useAuthStore.getState().accessToken);

  if (res.status === 401 && !skipAuthRetry) {
    const newToken = await refreshSession();
    if (newToken) {
      res = await send(newToken);
    }
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as
      | { error?: { code?: string; message?: string; details?: unknown[] } }
      | null;
    const err = body?.error;
    throw new ApiError(
      res.status,
      err?.code ?? "ERROR",
      err?.message ?? res.statusText,
      err?.details,
    );
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}
