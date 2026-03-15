import "./globals.css";
import Link from "next/link";
import type { Metadata } from "next";
import { ClerkProvider, SignInButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import InactivitySignOut from "@/components/InactivitySignOut";
import HeaderSignOut from "@/components/HeaderSignOut";
import FlashToastProvider from "@/components/FlashToastProvider";
import StructuredData from "@/components/seo/StructuredData";

const SITE_URL = "https://linked-in-optimization-hazel.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: "LinkedUp",
  title: {
    default: "LinkedUp - AI LinkedIn Optimizer",
    template: "%s | LinkedUp",
  },
  description:
    "Turn your resume into a stronger LinkedIn profile with AI-powered resume parsing, LinkedIn headline generation, About section writing, keyword analysis, and ATS-style scoring.",
  keywords: [
    "AI LinkedIn optimizer",
    "LinkedIn profile optimizer",
    "resume to LinkedIn profile",
    "LinkedIn headline generator",
    "LinkedIn about section generator",
    "resume keyword analysis",
    "ATS score LinkedIn",
    "resume parser",
    "career branding tool",
    "LinkedIn keyword optimization",
  ],
  alternates: {
    canonical: "/",
  },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/apple-icon",
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "LinkedUp",
    title: "LinkedUp - AI LinkedIn Optimizer",
    description:
      "Turn your resume into a stronger LinkedIn profile with AI-powered resume parsing, headline generation, keyword intelligence, and ATS-style scoring.",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "LinkedUp - AI LinkedIn Optimizer",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "LinkedUp - AI LinkedIn Optimizer",
    description:
      "Turn your resume into a stronger LinkedIn profile with AI-powered resume parsing, headline generation, keyword intelligence, and ATS-style scoring.",
    images: ["/twitter-image"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  authors: [{ name: "Piyusha Sayal", url: "https://piyushasayal.com" }],
  creator: "Piyusha Sayal",
  publisher: "Piyusha Sayal",
  category: "career",
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
        <body className="min-h-screen text-white antialiased">
          <StructuredData />
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