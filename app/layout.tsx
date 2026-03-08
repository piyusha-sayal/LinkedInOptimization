import "./globals.css";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI LinkedIn Optimizer",
  description:
    "Turn a resume into a stronger LinkedIn profile with structured parsing, section optimization, keyword analysis, and scoring.",
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
      <body className="min-h-screen text-white">
        <div className="mx-auto max-w-7xl px-5 py-6 md:px-6 md:py-8">
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