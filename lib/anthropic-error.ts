// Map an unknown error from the Anthropic SDK to an HTTP status the
// client can act on. The SDK surfaces upstream HTTP status as `.status`
// on the thrown error; mapping it through preserves "retry me" vs
// "stop trying" semantics on the client side.

export interface MappedError {
  status: number;
  message: string;
}

export function mapAnthropicError(err: unknown): MappedError {
  if (typeof err === "object" && err !== null) {
    const e = err as { status?: unknown; message?: unknown; name?: unknown };
    const upstream = typeof e.status === "number" ? e.status : null;
    const message = typeof e.message === "string" ? e.message : "AI-Fehler";

    // 429 / 529 — pass through so client can back off
    if (upstream === 429 || upstream === 529) {
      return { status: upstream, message };
    }
    // 4xx upstream — surface as 502 (we sent something the model rejected
    // through no fault of the client), but keep 401/403 as 502 too: the
    // user can't fix our missing API key.
    if (upstream && upstream >= 400 && upstream < 500) {
      return { status: 502, message };
    }
    // 5xx upstream
    if (upstream && upstream >= 500) {
      return { status: 502, message };
    }
    return { status: 500, message };
  }
  return { status: 500, message: "Unbekannter AI-Fehler" };
}
