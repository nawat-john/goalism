"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { refreshSession } from "@/lib/api/client";

/**
 * App-wide client providers: TanStack Query + a one-shot session rehydrate.
 * On boot we have no in-memory access token, so we hit /auth/refresh (the
 * httpOnly cookie rides along) to restore the session before rendering gated UI.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
      }),
  );

  const booted = useRef(false);
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    void refreshSession();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
