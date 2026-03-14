export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return new Response("ok", { headers: corsHeaders() });
    }

    if (url.pathname === "/resume/upload" && request.method === "POST") {
      return uploadResume(request, env);
    }

    if (url.pathname === "/workspace/get" && request.method === "GET") {
      return getWorkspace(request, env);
    }

    if (url.pathname === "/workspaces" && request.method === "GET") {
      return listWorkspaces(request, env);
    }

    if (url.pathname === "/workspace/save-parsed" && request.method === "POST") {
      return saveParsedWorkspace(request, env);
    }

    if (url.pathname === "/workspace/mark-paid" && request.method === "POST") {
      return markWorkspacePaid(request, env);
    }

    if (url.pathname === "/workspace/touch" && request.method === "POST") {
      return touchWorkspace(request, env);
    }

    return json({ ok: false, error: "Not Found" }, 404);
  },
};

async function uploadResume(request, env) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    const userId = String(form.get("userId") || "").trim();

    if (!(file instanceof File)) {
      return json({ ok: false, error: "Missing file" }, 400);
    }

    const workspaceId = crypto.randomUUID();
    const key = `resumes/${workspaceId}_${file.name}`;
    const now = new Date().toISOString();

    const buffer = await file.arrayBuffer();
    await env.RESUME_BUCKET.put(key, buffer, {
      httpMetadata: {
        contentType: file.type || "application/octet-stream",
      },
    });

    await env.DB.prepare(`
      INSERT INTO workspaces (
        id,
        user_id,
        resume_r2_key,
        resume_filename,
        structured_json,
        ctx_json,
        section_results_json,
        is_paid,
        created_at,
        updated_at,
        last_opened_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
      .bind(
        workspaceId,
        userId || null,
        key,
        file.name,
        null,
        null,
        null,
        0,
        now,
        now,
        now
      )
      .run();

    return json({
      ok: true,
      workspaceId,
      fileName: file.name,
      r2Key: key,
    });
  } catch (e) {
    return json(
      { ok: false, error: e instanceof Error ? e.message : "Upload failed" },
      500
    );
  }
}

async function saveParsedWorkspace(request, env) {
  try {
    const body = await request.json();
    const workspaceId = String(body?.workspaceId || "").trim();
    const structured = body?.structured ?? null;
    const ctx = body?.ctx ?? null;
    const sectionResults = body?.sectionResults ?? null;

    if (!workspaceId) {
      return json({ ok: false, error: "Missing workspaceId" }, 400);
    }

    const now = new Date().toISOString();

    await env.DB.prepare(`
      UPDATE workspaces
      SET
        structured_json = ?,
        ctx_json = ?,
        section_results_json = COALESCE(?, section_results_json),
        updated_at = ?,
        last_opened_at = ?
      WHERE id = ?
    `)
      .bind(
        structured ? JSON.stringify(structured) : null,
        ctx ? JSON.stringify(ctx) : null,
        sectionResults ? JSON.stringify(sectionResults) : null,
        now,
        now,
        workspaceId
      )
      .run();

    return json({ ok: true });
  } catch (e) {
    return json(
      { ok: false, error: e instanceof Error ? e.message : "Save failed" },
      500
    );
  }
}

async function markWorkspacePaid(request, env) {
  try {
    const body = await request.json();
    const workspaceId = String(body?.workspaceId || "").trim();

    if (!workspaceId) {
      return json({ ok: false, error: "Missing workspaceId" }, 400);
    }

    const now = new Date().toISOString();

    await env.DB.prepare(`
      UPDATE workspaces
      SET
        is_paid = 1,
        updated_at = ?,
        last_opened_at = ?
      WHERE id = ?
    `)
      .bind(now, now, workspaceId)
      .run();

    return json({ ok: true });
  } catch (e) {
    return json(
      { ok: false, error: e instanceof Error ? e.message : "Failed to mark workspace paid" },
      500
    );
  }
}

async function touchWorkspace(request, env) {
  try {
    const body = await request.json();
    const workspaceId = String(body?.workspaceId || "").trim();

    if (!workspaceId) {
      return json({ ok: false, error: "Missing workspaceId" }, 400);
    }

    const now = new Date().toISOString();

    await env.DB.prepare(`
      UPDATE workspaces
      SET
        updated_at = ?,
        last_opened_at = ?
      WHERE id = ?
    `)
      .bind(now, now, workspaceId)
      .run();

    return json({ ok: true });
  } catch (e) {
    return json(
      { ok: false, error: e instanceof Error ? e.message : "Failed to touch workspace" },
      500
    );
  }
}

async function getWorkspace(request, env) {
  try {
    const url = new URL(request.url);
    const id = (url.searchParams.get("id") || "").trim();

    if (!id) {
      return json({ ok: false, error: "Missing id" }, 400);
    }

    const workspace = await env.DB.prepare(`
      SELECT
        id,
        user_id,
        resume_filename,
        resume_r2_key,
        structured_json,
        ctx_json,
        section_results_json,
        is_paid,
        created_at,
        updated_at,
        last_opened_at
      FROM workspaces
      WHERE id = ?
    `)
      .bind(id)
      .first();

    if (!workspace) {
      return json({ ok: false, error: "Workspace not found" }, 404);
    }

    const now = new Date().toISOString();

    await env.DB.prepare(`
      UPDATE workspaces
      SET
        last_opened_at = ?,
        updated_at = ?
      WHERE id = ?
    `)
      .bind(now, now, id)
      .run();

    return json({
      ok: true,
      workspace,
    });
  } catch (e) {
    return json(
      { ok: false, error: e instanceof Error ? e.message : "Fetch failed" },
      500
    );
  }
}

async function listWorkspaces(request, env) {
  try {
    const url = new URL(request.url);
    const userId = (url.searchParams.get("userId") || "").trim();

    if (!userId) {
      return json({ ok: false, error: "Missing userId" }, 400);
    }

    const result = await env.DB.prepare(`
      SELECT
        id,
        user_id,
        resume_filename,
        resume_r2_key,
        structured_json,
        ctx_json,
        section_results_json,
        is_paid,
        created_at,
        updated_at,
        last_opened_at
      FROM workspaces
      WHERE user_id = ?
      ORDER BY
        COALESCE(last_opened_at, updated_at, created_at) DESC,
        updated_at DESC,
        created_at DESC
    `)
      .bind(userId)
      .all();

    const workspaces = (result?.results || []).map((workspace) => {
      let targetRole = null;
      let parsedName = null;
      let sectionsDone = 0;

      try {
        const ctx =
          typeof workspace.ctx_json === "string" && workspace.ctx_json
            ? JSON.parse(workspace.ctx_json)
            : null;

        targetRole = ctx?.targetRole || null;
      } catch {
        targetRole = null;
      }

      try {
        const structured =
          typeof workspace.structured_json === "string" && workspace.structured_json
            ? JSON.parse(workspace.structured_json)
            : null;

        parsedName = structured?.basics?.name || null;
      } catch {
        parsedName = null;
      }

      try {
        const sectionResults =
          typeof workspace.section_results_json === "string" && workspace.section_results_json
            ? JSON.parse(workspace.section_results_json)
            : null;

        if (sectionResults && typeof sectionResults === "object") {
          sectionsDone = Object.values(sectionResults).filter(Boolean).length;
        }
      } catch {
        sectionsDone = 0;
      }

      return {
        id: workspace.id,
        resume_name: workspace.resume_filename || "Untitled Resume",
        parsed_name: parsedName,
        target_role: targetRole,
        is_paid: Number(workspace.is_paid || 0),
        sections_done: sectionsDone,
        created_at: workspace.created_at,
        updated_at: workspace.updated_at,
        last_opened_at: workspace.last_opened_at,
      };
    });

    return json({
      ok: true,
      workspaces,
    });
  } catch (e) {
    return json(
      { ok: false, error: e instanceof Error ? e.message : "Failed to load workspaces" },
      500
    );
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      ...corsHeaders(),
    },
  });
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "Content-Type, Authorization",
  };
}