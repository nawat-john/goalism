import * as Sentry from "@sentry/nextjs";

// No-op unless NEXT_PUBLIC_SENTRY_DSN is set (no infra provisioned yet — see
// frontend/.env.staging.example and the CSP connect-src in middleware.ts,
// which already allow-lists the DSN's origin once configured).
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    // The Gemini key only ever lives in memory/sessionStorage (design §6.3)
    // and is never attached to Sentry context, but scrub defensively in
    // case a future change accidentally puts it in an error's extra data.
    beforeSend: scrubSensitiveData,
    beforeBreadcrumb: scrubSensitiveData,
  });
}

function scrubSensitiveData<T>(event: T): T {
  const json = JSON.stringify(event);
  if (!/x-user-gemini-key|"password"/i.test(json)) return event;
  return JSON.parse(
    json
      .replace(/("x-user-gemini-key"\s*:\s*)"[^"]*"/gi, '$1"[Redacted]"')
      .replace(/("password"\s*:\s*)"[^"]*"/gi, '$1"[Redacted]"'),
  );
}
