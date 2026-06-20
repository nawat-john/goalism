"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { loginSchema, registerSchema } from "@study-planner/shared";
import { authApi } from "@/lib/auth/auth-api";
import { ApiError } from "@/lib/api/client";
import { cn } from "@/lib/utils";

type Mode = "login" | "register";

const copy = {
  login: {
    title: "Welcome back",
    submit: "Log in",
    altText: "Need an account?",
    altHref: "/register",
    altLabel: "Create one",
  },
  register: {
    title: "Create your account",
    submit: "Sign up",
    altText: "Already have an account?",
    altHref: "/login",
    altLabel: "Log in",
  },
} as const;

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const text = copy[mode];

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    setPending(true);
    try {
      // Validate client-side with the same shared zod schema the backend uses.
      if (mode === "register") {
        const parsed = registerSchema.safeParse({ email, password, displayName });
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message ?? "Invalid input");
          return;
        }
        await authApi.register(parsed.data);
      } else {
        const parsed = loginSchema.safeParse({ email, password });
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message ?? "Invalid input");
          return;
        }
        await authApi.login(parsed.data);
      }
      router.push("/");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Something went wrong. Try again.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-card p-6 shadow-sm"
    >
      <h1 className="text-2xl font-bold">{text.title}</h1>

      {mode === "register" && (
        <Field
          label="Display name"
          type="text"
          value={displayName}
          onChange={setDisplayName}
          autoComplete="name"
        />
      )}
      <Field
        label="Email"
        type="email"
        value={email}
        onChange={setEmail}
        autoComplete="email"
      />
      <Field
        label="Password"
        type="password"
        value={password}
        onChange={setPassword}
        autoComplete={mode === "register" ? "new-password" : "current-password"}
      />

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className={cn(
          "w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground",
          "transition-colors hover:bg-primary/90 disabled:opacity-50",
        )}
      >
        {pending ? "Please wait…" : text.submit}
      </button>

      <p className="text-center text-sm text-muted-foreground">
        {text.altText}{" "}
        <Link href={text.altHref} className="font-medium text-primary underline">
          {text.altLabel}
        </Link>
      </p>
    </form>
  );
}

function Field({
  label,
  type,
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      <input
        type={type}
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
    </label>
  );
}
