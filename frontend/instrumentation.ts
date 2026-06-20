// Server/edge counterpart to instrumentation-client.ts — same no-op-unless-DSN
// contract (design §11: error reporter must not leak secrets).
export async function register() {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;

  const Sentry = await import("@sentry/nextjs");
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  });
}
