"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { handleCallback, consumeReturnPath } from "@/lib/spotify-auth";

function CallbackInner() {
  const params = useSearchParams();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = params.get("code");
    const state = params.get("state");
    const err = params.get("error");
    if (err) {
      setError(err);
      return;
    }
    if (!code) {
      setError("Missing authorization code");
      return;
    }
    handleCallback(code, state)
      .then(() => router.replace(consumeReturnPath() ?? "/"))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [params, router]);

  return (
    <div className="mx-auto mt-24 max-w-md px-4">
      {error ? (
        <div className="rounded-md border border-red-800 bg-red-950/60 p-4 text-sm text-red-100">
          <p className="font-semibold">Sign-in failed</p>
          <p className="mt-1">{error}</p>
          <a className="mt-2 inline-block text-red-200 underline" href="/">
            Go home
          </a>
        </div>
      ) : (
        <p className="text-sm text-zinc-400">Completing sign-in…</p>
      )}
    </div>
  );
}

export default function CallbackPage() {
  return (
    <Suspense fallback={<p className="m-8 text-sm text-zinc-400">Loading…</p>}>
      <CallbackInner />
    </Suspense>
  );
}
