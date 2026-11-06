import "server-only";

/** Cause thrown by the owner's rate limiter; the formatter turns it into `retryAfterSeconds`. */
export class RateLimitedError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super(`Rate limited, retry in ${retryAfterSeconds}s`);
    this.name = "RateLimitedError";
  }
}

/** Cause for a server-side check that belongs under one form field. */
export class InputFieldError extends Error {
  constructor(
    readonly field: "url" | "expiry",
    message: string,
  ) {
    super(message);
    this.name = "InputFieldError";
  }
}
