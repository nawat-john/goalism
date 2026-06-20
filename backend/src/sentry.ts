import * as Sentry from "@sentry/node";

const SENSITIVE_HEADERS = ["x-user-gemini-key", "authorization", "cookie"];
const SENSITIVE_BODY_FIELDS = ["password", "x-user-gemini-key"];

/**
 * No-op unless SENTRY_DSN is set (no infra is provisioned yet — see
 * backend/.env.staging.example). Strips the same fields nestjs-pino redacts
 * in app.module.ts so an error report can never leak the BYOK Gemini key or
 * a password (design §7.3/§11).
 */
export function initSentry() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    beforeSend(event) {
      if (event.request?.headers) {
        for (const header of SENSITIVE_HEADERS) {
          delete event.request.headers[header];
          delete event.request.headers[header.toLowerCase()];
        }
      }
      if (event.request?.data && typeof event.request.data === "object") {
        for (const field of SENSITIVE_BODY_FIELDS) {
          delete (event.request.data as Record<string, unknown>)[field];
        }
      }
      return event;
    },
  });
}
