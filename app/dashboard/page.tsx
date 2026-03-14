import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

type WorkspaceItem = {
  id: string;
  resume_name?: string | null;
  target_role?: string | null;
  is_paid?: number | boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
};

async function getWorkspaces(userId: string): Promise<WorkspaceItem[]> {
  const workerBase = process.env.NEXT_PUBLIC_LINKEDUP_WORKER_URL;

  if (!workerBase) {
    throw new Error("Missing NEXT_PUBLIC_LINKEDUP_WORKER_URL.");
  }

  const res = await fetch(
    `${workerBase}/workspaces?userId=${encodeURIComponent(userId)}`,
    {
      method: "GET",
      cache: "no-store",
    }
  );

  const json = await res.json();

  if (!res.ok || !json?.ok) {
    throw new Error(json?.error || "Failed to load workspaces.");
  }

  return (json.workspaces || []) as WorkspaceItem[];
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

export default async function DashboardPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/");
  }

  let workspaces: WorkspaceItem[] = [];
  let loadError: string | null = null;

  try {
    workspaces = await getWorkspaces(userId);
  } catch (error) {
    loadError =
      error instanceof Error ? error.message : "Failed to load dashboard.";
  }

  const total = workspaces.length;
  const paid = workspaces.filter((w) => Boolean(w.is_paid)).length;

  return (
    <main className="flex flex-col gap-6">
      <section className="rounded-2xl border border-white/10 bg-black/25 p-6 backdrop-blur-xl">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--luna-200)]">
              Dashboard
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white">
              Your LinkedUp Workspaces
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-white/55">
              View your previously parsed resumes, paid workspaces, and saved optimization results.
            </p>
          </div>

          <Link
            href="/optimize"
            className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
          >
            New Resume
          </Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="text-xs uppercase tracking-[0.16em] text-white/35">
            Total Workspaces
          </div>
          <div className="mt-3 text-3xl font-bold text-white">{total}</div>
          <div className="mt-2 text-sm text-white/45">
            All resumes saved for this account.
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="text-xs uppercase tracking-[0.16em] text-white/35">
            Paid Workspaces
          </div>
          <div className="mt-3 text-3xl font-bold text-white">{paid}</div>
          <div className="mt-2 text-sm text-white/45">
            Payment-unlocked resume workspaces.
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="text-xs uppercase tracking-[0.16em] text-white/35">
            Pending Workspaces
          </div>
          <div className="mt-3 text-3xl font-bold text-white">{total - paid}</div>
          <div className="mt-2 text-sm text-white/45">
            Parsed but not fully unlocked yet.
          </div>
        </div>
      </section>

      {loadError && (
        <section className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-200">
          {loadError}
        </section>
      )}

      {workspaces.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-8 text-center">
          <div className="mx-auto max-w-2xl">
            <div className="text-lg font-semibold text-white">
              No saved workspaces yet
            </div>
            <p className="mt-2 text-sm leading-6 text-white/50">
              Parse a resume and unlock Generate All to start building your dashboard history.
            </p>

            <div className="mt-5">
              <Link
                href="/optimize"
                className="inline-flex items-center justify-center rounded-xl bg-[color:var(--luna-200)] px-5 py-2.5 text-sm font-medium text-black transition hover:opacity-90"
              >
                Go to Optimize
              </Link>
            </div>
          </div>
        </section>
      ) : (
        <section className="grid gap-4">
          {workspaces.map((workspace) => (
            <div
              key={workspace.id}
              className="rounded-2xl border border-white/10 bg-white/5 p-5"
            >
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-lg font-semibold text-white">
                    {workspace.resume_name || "Untitled Resume"}
                  </div>
                  <div className="mt-1 text-sm text-white/50">
                    Target role: {workspace.target_role || "Not set"}
                  </div>
                  <div className="mt-2 text-xs text-white/35">
                    Created: {formatDate(workspace.created_at)} • Updated: {formatDate(workspace.updated_at)}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      workspace.is_paid
                        ? "border border-emerald-400/20 bg-emerald-500/10 text-emerald-300"
                        : "border border-amber-400/20 bg-amber-500/10 text-amber-300"
                    }`}
                  >
                    {workspace.is_paid ? "Paid" : "Pending"}
                  </span>

                  <Link
                    href={`/optimize?workspaceId=${encodeURIComponent(workspace.id)}`}
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
                  >
                    Open
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}