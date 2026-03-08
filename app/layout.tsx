import "./globals.css";
import Link from "next/link";
import type { Metadata } from "next";

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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
      </head>
      <body className="min-h-screen text-white">
        <div className="mx-auto max-w-7xl px-5 py-6 md:px-6 md:py-8">

          {/* ── Top brand bar ── */}
          {/* Replace the top brand bar div */}
<div className="mb-4 flex items-center justify-center">
  <Link href="/" className="flex flex-col items-center">
    <img src="/logo.svg" alt="LinkedUp logo" height={36} style={{ height: 36, width: "auto" }} />
    <div className="flex flex-col items-center">
      <span className="text-2xl font-bold tracking-tight text-white leading-none">
        Linked<span className="text-[color:var(--luna-200)]">Up</span>
      </span>
      <span className="mt-1 text-[11px] font-medium tracking-[0.18em] uppercase text-white/35">
        AI LinkedIn Optimizer
      </span>
    </div>
  </Link>
</div>

          {/* ── Original navbar — untouched ── */}
          <header className="mb-8 rounded-2xl border border-white/10 bg-black/25 backdrop-blur-xl">
            <div className="flex flex-col gap-4 px-5 py-4 md:flex-row md:items-center md:justify-between">
              <Link href="/" className="group">
                <div className="text-xl font-semibold tracking-tight">
                  <span className="text-white">AI</span>{" "}
                  <span className="text-[color:var(--luna-200)] group-hover:text-[color:var(--luna-100)] transition">
                    LinkedIn Optimizer
                  </span>
                </div>
                <div className="mt-1 text-xs text-white/55">
                  Premium • Modular • Startup-scalable
                </div>
              </Link>

              <nav className="flex items-center gap-2">
                {nav.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            </div>
          </header>

          {children}
        </div>
      </body>
    </html>
  );
}
