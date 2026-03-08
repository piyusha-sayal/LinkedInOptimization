import Link from "next/link";

const FEATURES = [
  {
    title: "Resume → Structured Profile",
    desc: "Upload a PDF or DOCX and turn it into a normalized profile foundation before generating any LinkedIn content.",
  },
  {
    title: "Section-by-Section Optimization",
    desc: "Optimize headline, about, experience, skills, projects, and positioning without forcing one heavy all-at-once generation flow.",
  },
  {
    title: "Keyword + Positioning Intelligence",
    desc: "Identify matched, missing, and weak keywords so the profile becomes stronger for search and recruiter scans.",
  },
  {
    title: "Scoring + Direction",
    desc: "Get section-level quality feedback and a clear sense of what to improve next.",
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
              Build a sharper LinkedIn profile without sending one giant prompt every time.
            </h1>

            <p className="mt-5 max-w-2xl text-base leading-7 text-white/72 md:text-lg">
              This workflow is designed to parse once, optimize deliberately, and improve each
              section with less rate-limit risk and better control.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/optimize"
                className="rounded-xl bg-[color:var(--luna-200)] px-5 py-3 font-semibold text-[#001018] transition hover:bg-[color:var(--luna-100)]"
              >
                Start optimizing
              </Link>

              <a
                href="#how-it-works"
                className="rounded-xl border border-white/10 bg-black/30 px-5 py-3 text-white/80 transition hover:border-white/20 hover:text-white"
              >
                See how it works
              </a>
            </div>

            <div className="mt-8 flex flex-wrap gap-3 text-sm text-white/58">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                Structured parsing
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                Section generation
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                Keyword intelligence
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                Scored output
              </span>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="rounded-2xl border border-white/10 bg-black/25 p-5">
              <div className="text-sm font-medium text-white/60">Why this structure works</div>
              <div className="mt-3 text-sm leading-7 text-white/78">
                The landing page explains the product. The optimization page handles the workflow.
                That reduces clutter, improves perceived quality, and prepares the UI for
                section-by-section generation later.
              </div>
            </div>

            <div className="rounded-2xl border border-[color:var(--luna-200)]/20 bg-[color:var(--luna-400)]/20 p-5">
              <div className="text-sm font-medium text-white/60">Current direction</div>
              <div className="mt-3 text-sm leading-7 text-white/78">
                Parse the resume first. Then optimize one section at a time. That is the better UX
                and the safer backend pattern.
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
            This split gives the product a much cleaner first impression and makes the actual
            optimization workspace feel more focused.
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
          Use the dedicated page for upload, context, generation, and results.
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
    </main>
  );
}