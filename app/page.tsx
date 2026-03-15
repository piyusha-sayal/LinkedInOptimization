import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI LinkedIn Optimizer for Resume-to-Profile Conversion",
  description:
    "Convert your resume into a stronger LinkedIn headline, About section, keyword strategy, ATS-style score, and profile positioning with LinkedUp.",
  keywords: [
    "AI LinkedIn optimizer",
    "resume to LinkedIn profile",
    "LinkedIn headline generator",
    "LinkedIn about section writer",
    "resume keyword optimization",
    "ATS style LinkedIn score",
    "career branding app",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    url: "/",
    title: "AI LinkedIn Optimizer for Resume-to-Profile Conversion",
    description:
      "Convert your resume into a stronger LinkedIn headline, About section, keyword strategy, ATS-style score, and profile positioning with LinkedUp.",
  },
  twitter: {
    title: "AI LinkedIn Optimizer for Resume-to-Profile Conversion",
    description:
      "Convert your resume into a stronger LinkedIn headline, About section, keyword strategy, ATS-style score, and profile positioning with LinkedUp.",
  },
};

const FEATURES = [
  {
    title: "Resume to Structured LinkedIn Profile",
    desc: "Upload a PDF or DOCX resume and turn it into a normalized profile foundation before generating LinkedIn content.",
  },
  {
    title: "Section-by-Section LinkedIn Optimization",
    desc: "Optimize headline, about, experience, skills, projects, and positioning without forcing one heavy all-at-once generation flow.",
  },
  {
    title: "Keyword and Positioning Intelligence",
    desc: "Identify matched, missing, and weak keywords so the profile becomes stronger for recruiter search and LinkedIn discoverability.",
  },
  {
    title: "ATS-Style Scoring and Direction",
    desc: "Get section-level quality feedback and a clear sense of what to improve next before updating your LinkedIn profile.",
  },
];

const STEPS = [
  {
    step: "01",
    title: "Upload resume",
    desc: "Start with your current resume. The app extracts text and builds structured profile data.",
  },
  {
    step: "02",
    title: "Set context",
    desc: "Add target role, industry, seniority, and optional job text to steer the output.",
  },
  {
    step: "03",
    title: "Optimize sections",
    desc: "Generate only the section you need instead of triggering a large fragile batch request.",
  },
  {
    step: "04",
    title: "Refine and export",
    desc: "Review quality, keyword alignment, and positioning before updating LinkedIn.",
  },
];

export default function LandingPage() {
  return (
    <>
      <main className="space-y-10 md:space-y-14">
        <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute -top-24 -left-24 h-80 w-80 rounded-full bg-[color:var(--luna-200)]/20 blur-3xl" />
            <div className="absolute top-0 right-0 h-72 w-72 rounded-full bg-[color:var(--luna-100)]/10 blur-3xl" />
            <div className="absolute -bottom-24 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-[color:var(--luna-400)]/35 blur-3xl" />
          </div>

          <div className="relative grid gap-10 p-8 md:grid-cols-[1.2fr_.8fr] md:p-12">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/30 px-4 py-2 text-xs text-white/75">
                <span className="h-2 w-2 rounded-full bg-[color:var(--luna-200)]" />
                Resume-first LinkedIn optimization
              </div>

              <h1 className="mt-6 max-w-4xl text-4xl font-semibold leading-tight tracking-tight md:text-6xl">
                Build a sharper LinkedIn profile from your resume with AI.
              </h1>

              <p className="mt-5 max-w-2xl text-base leading-7 text-white/72 md:text-lg">
                LinkedUp helps you parse once, optimize deliberately, and improve
                your LinkedIn headline, About section, keywords, and profile
                positioning with less rate-limit risk and better control.
              </p>

              <div className="mt-8 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
                <Link
                  href="/optimize"
                  className="inline-flex w-full items-center justify-center rounded-xl bg-[color:var(--luna-200)] px-4 py-3 text-center font-semibold text-[#001018] transition hover:bg-[color:var(--luna-100)] sm:w-auto sm:px-5"
                >
                  Start optimizing
                </Link>

                <a
                  href="#how-it-works"
                  className="inline-flex w-full items-center justify-center rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-center text-white/80 transition hover:border-white/20 hover:text-white sm:w-auto sm:px-5"
                >
                  See how it works
                </a>
              </div>

              <div className="mt-8 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:gap-3 text-sm text-white/58">
  {[
    "Structured parsing",
    "Section generation",
    "Keyword intelligence",
    "Scored output",
  ].map((item) => (
    <div key={item} className="flex justify-center sm:block">
      <span className="inline-flex min-h-[40px] items-center justify-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-center whitespace-nowrap shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition hover:border-[color:var(--luna-200)]/25 hover:bg-white/[0.07]">
        {item}
      </span>
    </div>
  ))}
</div>
            </div>

            <div className="grid gap-4">
              <div className="rounded-2xl border border-white/10 bg-black/25 p-5">
                <div className="text-sm font-medium text-white/60">
                  Who is this for?
                </div>
                <div className="mt-3 text-sm leading-7 text-white/78">
                  Job seekers, career changers, and professionals who want a
                  stronger LinkedIn profile without spending hours rewriting it
                  from scratch.
                </div>
              </div>

              <div className="rounded-2xl border border-[color:var(--luna-200)]/20 bg-[color:var(--luna-400)]/20 p-5">
                <div className="text-sm font-medium text-white/60">
                  What you get
                </div>
                <div className="mt-3 text-sm leading-7 text-white/78">
                  A keyword-optimized LinkedIn headline, a compelling About
                  section, stronger experience bullets, and a clear positioning
                  strategy tailored to your target role.
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {FEATURES.map((item) => (
            <div
              key={item.title}
              className="rounded-2xl border border-white/10 bg-white/5 p-6 transition hover:border-[color:var(--luna-200)]/35 hover:bg-white/[0.07]"
            >
              <div className="text-lg font-semibold">{item.title}</div>
              <p className="mt-3 text-sm leading-7 text-white/68">{item.desc}</p>
            </div>
          ))}
        </section>

        <section
          id="how-it-works"
          className="rounded-3xl border border-white/10 bg-black/20 p-6 md:p-8"
        >
          <div className="max-w-2xl">
            <div className="text-sm font-medium uppercase tracking-[0.18em] text-white/45">
              How it works
            </div>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
              Clear flow first. Optimization second.
            </h2>
            <p className="mt-4 text-white/68">
              This split gives the product a cleaner first impression and makes
              the optimization workspace feel more focused.
            </p>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {STEPS.map((item) => (
              <div
                key={item.step}
                className="rounded-2xl border border-white/10 bg-white/5 p-6"
              >
                <div className="text-xs font-semibold tracking-[0.2em] text-[color:var(--luna-200)]">
                  {item.step}
                </div>
                <div className="mt-2 text-xl font-semibold">{item.title}</div>
                <p className="mt-3 text-sm leading-7 text-white/68">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center">
          <h3 className="text-2xl font-semibold tracking-tight md:text-3xl">
            Ready to move into the optimization workspace?
          </h3>
          <p className="mx-auto mt-4 max-w-2xl text-white/68">
            Use the dedicated page for upload, context, generation, scoring, and results.
          </p>
          <div className="mt-6">
            <Link
              href="/optimize"
              className="inline-flex rounded-xl bg-[color:var(--luna-200)] px-5 py-3 font-semibold text-[#001018] transition hover:bg-[color:var(--luna-100)]"
            >
              Open optimization workspace
            </Link>
          </div>
        </section>

        <section className="flex items-start gap-4 rounded-2xl border border-amber-400/20 bg-amber-400/[0.04] p-5">
          <span className="mt-0.5 shrink-0 text-lg">⚠</span>
          <div>
            <p className="mb-1 text-sm font-semibold text-amber-300">
              Disclaimer — please review all AI-generated content before use
            </p>
            <p className="text-sm leading-7 text-white/45">
              This tool uses AI to suggest LinkedIn profile content based on your
              resume. Outputs may contain inaccuracies, embellishments, or
              misrepresentations. Always verify facts, dates, job titles, and
              metrics before publishing. Never claim skills or experience you do
              not have. The author accepts no liability for how this content is used.
            </p>
          </div>
        </section>

        <section className="flex flex-wrap items-center justify-between gap-5 rounded-3xl border border-[color:var(--luna-200)]/30 bg-[color:var(--luna-400)]/10 p-8">
          <div>
            <h3 className="text-xl font-semibold tracking-tight">
              Need help optimizing your LinkedIn or resume?
            </h3>
            <p className="mt-2 text-sm leading-7 text-white/55">
              Reach out directly and I can help you craft a standout profile.
            </p>
          </div>
          <a
            href="mailto:piyusha.2510@gmail.com"
            className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-[color:var(--luna-200)] px-5 py-3 font-semibold text-[#001018] transition hover:bg-[color:var(--luna-100)]"
          >
            <span>✉</span> Email me
          </a>
        </section>
      </main>

      <footer className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-white/[0.07] py-6 text-sm text-white/30">
        <p>© {new Date().getFullYear()} Piyusha Sayal. All rights reserved.</p>
        <div className="flex flex-wrap items-center gap-6">
          <a
            href="https://piyushasayal.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 transition hover:text-white/70"
          >
            <span>◈</span> Portfolio
          </a>
          <a
            href="https://linkedin.com/in/piyusha-sayal"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 transition hover:text-white/70"
          >
            <span className="text-[color:var(--luna-200)]">in</span> LinkedIn
          </a>
          <a
            href="mailto:piyusha.2510@gmail.com"
            className="flex items-center gap-1.5 transition hover:text-white/70"
          >
            <span>✉</span> Email me
          </a>
        </div>
      </footer>
    </>
  );
}