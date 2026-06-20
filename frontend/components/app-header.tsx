"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/use-auth";
import { authApi } from "@/lib/auth/auth-api";

export function AppHeader() {
  const { user } = useAuth();
  const router = useRouter();

  async function logout() {
    await authApi.logout();
    router.replace("/login");
  }

  return (
    <header className="flex items-center justify-between border-b border-border px-6 py-3">
      <Link href="/" className="text-lg font-bold">
        StudyPlanner
      </Link>
      <div className="flex items-center gap-4 text-sm">
        {user && <span className="text-muted-foreground">{user.displayName}</span>}
        <Link href="/timeline" className="hover:underline">
          Timeline
        </Link>
        <Link href="/labels" className="hover:underline">
          Labels
        </Link>
        <button onClick={logout} className="hover:underline">
          Log out
        </button>
      </div>
    </header>
  );
}
