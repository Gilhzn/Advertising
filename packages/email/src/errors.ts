/** Provider a failure originated from. */
export type EmailProviderName = "cloudflare" | "migadu" | "resend" | "imap" | "provision";

export type EmailErrorCode =
  | "not_found"
  | "not_configured"
  | "rate_limited"
  | "network"
  | "invalid_response"
  | "unknown";

/**
 * Typed error for every external side effect in this package, mirroring
 * `ConnectorError` in `packages/connectors`. Never carries secrets in its
 * message (callers must not interpolate tokens/passwords into `message`).
 */
export class EmailProviderError extends Error {
  constructor(
    message: string,
    public readonly provider: EmailProviderName,
    public readonly code: EmailErrorCode = "unknown",
    public readonly retryable = false,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "EmailProviderError";
  }
}
