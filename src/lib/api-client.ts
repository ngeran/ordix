// ============================================================
// SECTION: Fetch wrapper (client-side)
// ------------------------------------------------------------
// Thin typed wrapper around fetch used by every client
// component. Responsibilities:
//   - JSON encode/decode + headers
//   - throw ApiError with the server's message (routes return
//     { error: string } envelopes)
//   - no-store everywhere: data must never be cached by the
//     browser because stock/status change constantly
// ============================================================

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  url: string,
  init?: RequestInit & { json?: unknown }
): Promise<T> {
  const { json, ...rest } = init ?? {};
  const response = await fetch(url, {
    ...rest,
    cache: "no-store",
    headers: {
      ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      ...rest.headers,
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const data = (await response.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      // keep the generic message
    }
    throw new ApiError(message, response.status);
  }

  // 204 No Content (used by DELETE endpoints)
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** Typed REST helpers — `api.get<OrderSummary[]>("/api/orders?scope=active")`. */
export const api = {
  get: <T>(url: string) => request<T>(url),
  post: <T>(url: string, json?: unknown) =>
    request<T>(url, { method: "POST", json }),
  patch: <T>(url: string, json?: unknown) =>
    request<T>(url, { method: "PATCH", json }),
  delete: <T>(url: string) => request<T>(url, { method: "DELETE" }),
};
