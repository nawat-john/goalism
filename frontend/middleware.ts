import { NextRequest, NextResponse } from "next/server";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

/**
 * Strict, nonce-based CSP (design §6.3/§11: "helmet + strict CSP, limit
 * `connect-src` to our own API + Gemini"). `helmet()` on the NestJS side
 * only covers API responses; the page itself is served by Next.js, so the
 * CSP that actually constrains the browser has to live here. Per Next's
 * documented pattern, the nonce set on this response is picked up
 * automatically for Next's own injected scripts — no changes needed in
 * the root layout as long as the app adds no other inline scripts.
 */
export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const apiOrigin = new URL(API_URL).origin;
  // Sentry is disabled unless a DSN is configured; only then does its ingest
  // host need to be allow-listed for the browser to report errors.
  const sentryOrigin = process.env.NEXT_PUBLIC_SENTRY_DSN
    ? new URL(process.env.NEXT_PUBLIC_SENTRY_DSN).origin
    : "";
  // `next dev`'s webpack HMR runtime evaluates code via `eval()`; without
  // 'unsafe-eval' the CSP blocks it outright and the app never hydrates.
  // Production builds (`next build`/`next start`) don't need it.
  const devEval = process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'";

  const csp = `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${devEval};
    style-src 'self' 'unsafe-inline';
    img-src 'self' data: blob:;
    font-src 'self';
    connect-src 'self' ${apiOrigin} https://generativelanguage.googleapis.com ${sentryOrigin};
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    upgrade-insecure-requests;
  `
    .replace(/\s{2,}/g, " ")
    .trim();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    /*
     * Skip static assets and image optimization so the CSP header (and its
     * per-request nonce) is only computed for actual page/route requests.
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
