"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

import type { OptimizeResponse } from "@/lib/types";
import { ProfileTabs, type ResultsTab } from "@/components/ProfileTabs";
import { KeywordInsights } from "@/components/KeywordInsights";
import { ScoreDashboard } from "@/components/ScoreDashboard";
import { LinkedInImages } from "@/components/LinkedInImages";

type ErrorPayload = { error?: string };

function isErrorPayload(v: unknown): v is ErrorPayload {
  return typeof v === "object" && v !== null && "error" in v;
}

function getStringParam(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

export default function ResultsPage() {
  const params = useParams();
  const resultId = getStringParam(params?.id as string | string[] | undefined);

  const [data, setData] = useState<OptimizeResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<ResultsTab>("Branding Version");

  useEffect(() => {
    let cancelled = false;

    if (!resultId) {
      setErr("Missing result id.");
      return;
    }

    (async () => {
      try {
        setErr(null);
        const res = await fetch(`/api/results/${encodeURIComponent(resultId)}`, {
          cache: "no-store",
        });
        const json: unknown = await res.json();

        if (!res.ok) {
          const msg = isErrorPayload(json) ? json.error : undefined;
          throw new Error(msg || "Not found");
        }

        if (!cancelled) setData(json as OptimizeResponse);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Failed to load results";
        if (!cancelled) setErr(msg);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [resultId]);

  const activeModeKey = useMemo(() => {
    if (tab === "Recruiter Version") return "Recruiter" as const;
    if (tab === "Branding Version") return "Branding" as const;
    return "Branding" as const; // default for keyword/score tabs too
  }, [tab]);

  const activeModeResult = data?.results?.[activeModeKey];
  const section =
    activeModeResult?.profile ??
    (activeModeKey === "Branding" ? data?.branding_version : data?.recruiter_version) ??
    null;

  if (err) {
    return (
      <main className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-red-200">
        {err}
      </main>
    );
  }

  if (!data) {
    return (
      <main className="rounded-2xl border border-white/10 bg-[color:var(--card)] p-6 text-gray-300">
        Loading results...
      </main>
    );
  }

  return (
    <main className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-3xl font-bold">Results</div>
          <div className="text-gray-400 mt-1">
            Session: <span className="text-gray-200">{data.id}</span>
          </div>
        </div>
        <div className="text-sm text-gray-500">
          Model: <span className="text-gray-300">{data.meta?.model ?? "—"}</span>
        </div>
      </div>

      <ProfileTabs active={tab} onChange={setTab} />

      {tab === "Keyword Insights" ? (
        activeModeResult?.keywords ? (
          <KeywordInsights data={activeModeResult.keywords} />
        ) : (
          <Card title="Keyword Insights">
            <div className="text-gray-400">Keyword insights not available.</div>
          </Card>
        )
      ) : null}

      {tab === "Optimization Score" ? (
        activeModeResult?.score ? (
          <ScoreDashboard score={activeModeResult.score} />
        ) : (
          <Card title="Optimization Score">
            <div className="text-gray-400">Score data not available.</div>
          </Card>
        )
      ) : null}

      {tab === "Branding Version" || tab === "Recruiter Version" ? (
        <LinkedInImages
          resultId={data.id}
          initialProfileUrl={data.images?.profilePhotoUrl}
          initialCoverUrl={data.images?.coverUrl}
        />
      ) : null}

      {(tab === "Branding Version" || tab === "Recruiter Version") && section ? (
        <div className="grid grid-cols-1 gap-4">
          <Card title="Headline">
            <div className="text-gray-200">{section.headline}</div>
          </Card>

          <Card title="Banner Tagline">
            <div className="text-gray-200">{section.banner_tagline}</div>
          </Card>

          <Card title="About">
            <pre className="whitespace-pre-wrap text-gray-200">{section.about}</pre>
          </Card>

          <Card title="Experience">
            <div className="space-y-4">
              {(section.experience ?? []).map((r, idx) => (
                <div key={idx} className="rounded-xl border border-white/10 bg-black/30 p-4">
                  <div className="font-semibold">
                    {r.title} • <span className="text-gray-300">{r.company}</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {[r.location, r.startDate, r.endDate].filter(Boolean).join(" • ")}
                  </div>
                  <ul className="mt-3 space-y-2 list-disc pl-5 text-gray-200">
                    {(r.bullets ?? []).map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Skills">
            <div className="flex flex-wrap gap-2">
              {(section.skills ?? []).map((s) => (
                <span
                  key={s}
                  className="text-xs rounded-full border border-white/10 bg-black/30 px-3 py-1 text-gray-200"
                >
                  {s}
                </span>
              ))}
            </div>
          </Card>
        </div>
      ) : null}

      <Card title="Positioning Advice">
        <pre className="whitespace-pre-wrap text-gray-200">
          {activeModeResult?.positioning_advice ?? "Positioning advice not available."}
        </pre>
      </Card>
    </main>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[color:var(--card)] p-6">
      <div className="text-lg font-semibold">{title}</div>
      <div className="mt-3">{children}</div>
    </div>
  );
}