"use client";

import { useClerk } from "@clerk/nextjs";

export default function HeaderSignOut() {
  const { signOut } = useClerk();

  return (
    <button
      onClick={async () => {
        await signOut({ redirectUrl: "/" });
      }}
      className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
    >
      Sign out
    </button>
  );
}