import "./globals.css";
import Link from "next/link";
import type { Metadata } from "next";
import { ClerkProvider, SignInButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import InactivitySignOut from "@/components/InactivitySignOut";
import HeaderSignOut from "@/components/HeaderSignOut";
import FlashToastProvider from "@/components/FlashToastProvider";

export const metadata: Metadata = {
  title: "LinkedUp — AI LinkedIn Optimizer",
  description:
    "Turn a resume into a stronger LinkedIn profile with structured parsing, section optimization, keyword analysis, and scoring.",
  icons: {
    icon: "/favicon.svg",
  },
};

const nav = [
  { href: "/", label: "Overview" },
  { href: "/optimize", label: "Optimize" },
];

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();

  return (
    <ClerkProvider>
      <html lang="en">
        <head>
          <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        </head>
        <body className="min-h-screen text-white">
          <InactivitySignOut />
          <FlashToastProvider />

          <div className="mx-auto max-w-7xl px-4 py-5 sm:px-5 md:px-6 md:py-8">
            <div className="mb-4 flex items-center justify-center">
              <Link href="/" className="flex flex-col items-center text-center">
                <img
                  src="/logo.svg"
                  alt="LinkedUp logo"
                  height={36}
                  style={{ height: 36, width: "auto" }}
                />
                <div className="mt-1 flex flex-col items-center">
                  <span className="text-2xl font-bold leading-none tracking-tight text-white">
                    Linked
                    <span className="text-[color:var(--luna-200)]">Up</span>
                  </span>
                  <span className="mt-1 text-[11px] font-medium uppercase tracking-[0.18em] text-white/35">
                    AI LinkedIn Optimizer
                  </span>
                </div>
              </Link>
            </div>

            <header className="mb-8 rounded-[24px] border border-white/10 bg-black/30 shadow-[0_20px_70px_rgba(0,0,0,0.24)] backdrop-blur-2xl">
              <div className="flex flex-col gap-4 px-4 py-4 sm:px-5 md:flex-row md:items-center md:justify-between">
                <Link href="/" className="group">
                  <div className="text-lg font-semibold tracking-tight sm:text-xl">
                    <span className="text-white">AI</span>{" "}
                    <span className="text-[color:var(--luna-200)] transition group-hover:text-[color:var(--luna-100)]">
                      LinkedIn Optimizer
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-white/55">
                    Premium • Modular • Startup-scalable
                  </div>
                </Link>

                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                  <nav className="flex flex-wrap items-center gap-2">
                    {nav.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
                      >
                        {item.label}
                      </Link>
                    ))}

                    {userId ? (
                      <Link
                        href="/dashboard"
                        className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
                      >
                        Dashboard
                      </Link>
                    ) : (
                      <SignInButton mode="modal">
                        <button className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 transition hover:border-white/20 hover:bg-white/10 hover:text-white">
                          Sign in
                        </button>
                      </SignInButton>
                    )}
                  </nav>

                  {userId ? <HeaderSignOut /> : null}
                </div>
              </div>
            </header>

            {children}
          </div>
        </body>
      </html>
    </ClerkProvider>
  );
}