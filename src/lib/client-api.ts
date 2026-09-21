/**
 * Client-side access to the app8n backend.
 *
 * The mobile shell serves its UI from `capacitor://` or `file://`, where a
 * relative fetch would resolve against the bundle instead of the server. Every
 * client request therefore goes through {@link apiUrl}, which prefixes the
 * configured backend origin. On web the variable is unset and paths stay
 * relative, so the same code works in both.
 */
export function apiBase(): string {
  return process.env.NEXT_PUBLIC_APP8N_API_URL?.replace(/\/$/, "") ?? "";
}

export function apiUrl(path: string): string {
  return `${apiBase()}${path}`;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Fetches JSON and turns a non-2xx response into an {@link ApiError} carrying
 * the server's own error code. Callers branch on that code — the approval
 * cards need to tell "someone else already approved this" (409) apart from
 * "this expired" (410) to show the right message.
 */
export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(apiUrl(path), {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const body = payload as { error?: string; message?: string } | null;
    throw new ApiError(
      body?.message ?? body?.error ?? `Request failed (${response.status}).`,
      response.status,
      body?.error,
    );
  }

  return payload as T;
}
