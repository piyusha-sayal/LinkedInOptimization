export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      const pathname = normalizePath(url.pathname);

      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: corsHeaders(request, env),
        });
      }

      if (pathname === "/health" && request.method === "GET") {
        return json({ ok: true }, 200, request, env);
      }

      if (pathname === "/resume/upload" && request.method === "POST") {
        return uploadResume(request, env);
      }

      if (pathname === "/workspace/get" && request.method === "GET") {
        return getWorkspace(request, env);
      }

      if (pathname === "/workspaces" && request.method === "GET") {
        return listWorkspaces(request, env);
      }

      if (pathname === "/workspace/save-parsed" && request.method === "POST") {
        return saveParsedWorkspace(request, env);
      }

      if (pathname === "/workspace/mark-paid" && request.method === "POST") {
        return markWorkspacePaid(request, env);
      }

      if (pathname === "/workspace/touch" && request.method === "POST") {
        return touchWorkspace(request, env);
      }

      if (pathname === "/workspace/clear" && request.method === "POST") {
        return clearWorkspace(request, env);
      }

      return json({ ok: false, error: "Not Found" }, 404, request, env);
    } catch (e) {
      return json(
        { ok: false, error: e instanceof Error ? e.message : "Internal server error" },
        500,
        request,
        env
      );
    }
  },
};

function normalizePath(pathname) {
  if (!pathname) return "/";
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

function getAllowedOrigin(request, env) {
  const requestOrigin = request.headers.get("Origin") || "";
  const configured = String(env.CORS_ORIGIN || "").trim();

  if (!configured) {
    return "*";
  }

  if (configured === "*") {
    return "*";
  }

  const allowedOrigins = configured
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

  if (!requestOrigin) {
    return allowedOrigins[0] || "*";
  }

  if (allowedOrigins.includes(requestOrigin)) {
    return requestOrigin;
  }

  return allowedOrigins[0] || "*";
}

function corsHeaders(request, env) {
  const origin = getAllowedOrigin(request, env);

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(data, status = 200, request, env) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(request, env),
    },
  });
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

async function ensureDbUser(env, clerkUserId, email = null) {
  if (!clerkUserId) return null;

  const existing = await env.DB.prepare(`
    SELECT id
    FROM users
    WHERE clerk_user_id = ?
    LIMIT 1
  `)
    .bind(clerkUserId)
    .first();

  if (existing) {
    if (existing.id) {
      return existing.id;
    }

    const repairedId = crypto.randomUUID();

    await env.DB.prepare(`
      UPDATE users
      SET id = ?
      WHERE clerk_user_id = ?
        AND id IS NULL
    `)
      .bind(repairedId, clerkUserId)
      .run();

    return repairedId;
  }

  const userId = crypto.randomUUID();
  const now = new Date().toISOString();

  await env.DB.prepare(`
    INSERT INTO users (id, clerk_user_id, email, created_at)
    VALUES (?, ?, ?, ?)
  `)
    .bind(userId, clerkUserId, email, now)
    .run();

  return userId;
}

async function uploadResume(request, env) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    const clerkUserId = String(form.get("userId") || "").trim();
    const email = String(form.get("email") || "").trim() || null;

    if (!(file instanceof File)) {
      return json({ ok: false, error: "Missing file" }, 400, request, env);
    }

    const dbUserId = clerkUserId ? await ensureDbUser(env, clerkUserId, email) : null;

    const workspaceId = crypto.randomUUID();
    const safeFileName = String(file.name || "resume").replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = `resumes/${workspaceId}_${safeFileName}`;
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
        is_cleared,
        cleared_at,
        created_at,
        updated_at,
        last_opened_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
      .bind(
        workspaceId,
        dbUserId,
        key,
        file.name,
        null,
        null,
        null,
        0,
        0,
        null,
        now,
        now,
        now
      )
      .run();

    return json(
      {
        ok: true,
        workspaceId,
        fileName: file.name,
        r2Key: key,
      },
      200,
      request,
      env
    );
  } catch (e) {
    return json(
      { ok: false, error: e instanceof Error ? e.message : "Upload failed" },
      500,
      request,
      env
    );
  }
}

async function saveParsedWorkspace(request, env) {
  try {
    const body = await readJson(request);

    if (!body || typeof body !== "object") {
      return json({ ok: false, error: "Invalid JSON body" }, 400, request, env);
    }

    const workspaceId = String(body.workspaceId || "").trim();
    const clerkUserId = String(body.userId || "").trim();
    const structured = body.structured ?? null;
    const ctx = body.ctx ?? null;
    const sectionResults = body.sectionResults ?? null;

    if (!workspaceId) {
      return json({ ok: false, error: "Missing workspaceId" }, 400, request, env);
    }

    const dbUserId = clerkUserId ? await ensureDbUser(env, clerkUserId) : null;
    const now = new Date().toISOString();

    const result = await env.DB.prepare(`
      UPDATE workspaces
      SET
        user_id = COALESCE(user_id, ?),
        structured_json = ?,
        ctx_json = ?,
        section_results_json = COALESCE(?, section_results_json),
        updated_at = ?,
        last_opened_at = ?
      WHERE id = ?
    `)
      .bind(
        dbUserId,
        structured ? JSON.stringify(structured) : null,
        ctx ? JSON.stringify(ctx) : null,
        sectionResults ? JSON.stringify(sectionResults) : null,
        now,
        now,
        workspaceId
      )
      .run();

    if (!result?.meta?.changes) {
      return json({ ok: false, error: "Workspace not found" }, 404, request, env);
    }

    return json({ ok: true }, 200, request, env);
  } catch (e) {
    return json(
      { ok: false, error: e instanceof Error ? e.message : "Save failed" },
      500,
      request,
      env
    );
  }
}

async function markWorkspacePaid(request, env) {
  try {
    const body = await readJson(request);

    if (!body || typeof body !== "object") {
      return json({ ok: false, error: "Invalid JSON body" }, 400, request, env);
    }

    const workspaceId = String(body.workspaceId || "").trim();
    const clerkUserId = String(body.userId || "").trim();

    if (!workspaceId) {
      return json({ ok: false, error: "Missing workspaceId" }, 400, request, env);
    }

    const dbUserId = clerkUserId ? await ensureDbUser(env, clerkUserId) : null;
    const now = new Date().toISOString();

    const result = await env.DB.prepare(`
      UPDATE workspaces
      SET
        user_id = COALESCE(user_id, ?),
        is_paid = 1,
        updated_at = ?,
        last_opened_at = ?
      WHERE id = ?
    `)
      .bind(dbUserId, now, now, workspaceId)
      .run();

    if (!result?.meta?.changes) {
      return json({ ok: false, error: "Workspace not found" }, 404, request, env);
    }

    return json({ ok: true }, 200, request, env);
  } catch (e) {
    return json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "Failed to mark workspace paid",
      },
      500,
      request,
      env
    );
  }
}

async function touchWorkspace(request, env) {
  try {
    const body = await readJson(request);

    if (!body || typeof body !== "object") {
      return json({ ok: false, error: "Invalid JSON body" }, 400, request, env);
    }

    const workspaceId = String(body.workspaceId || "").trim();

    if (!workspaceId) {
      return json({ ok: false, error: "Missing workspaceId" }, 400, request, env);
    }

    const now = new Date().toISOString();

    const result = await env.DB.prepare(`
      UPDATE workspaces
      SET
        updated_at = ?,
        last_opened_at = ?
      WHERE id = ?
    `)
      .bind(now, now, workspaceId)
      .run();

    if (!result?.meta?.changes) {
      return json({ ok: false, error: "Workspace not found" }, 404, request, env);
    }

    return json({ ok: true }, 200, request, env);
  } catch (e) {
    return json(
      { ok: false, error: e instanceof Error ? e.message : "Failed to touch workspace" },
      500,
      request,
      env
    );
  }
}

async function clearWorkspace(request, env) {
  try {
    const body = await readJson(request);

    if (!body || typeof body !== "object") {
      return json({ ok: false, error: "Invalid JSON body" }, 400, request, env);
    }

    const workspaceId = String(body.workspaceId || "").trim();
    const clerkUserId = String(body.userId || "").trim();

    if (!workspaceId) {
      return json({ ok: false, error: "Missing workspaceId" }, 400, request, env);
    }

    const dbUserId = clerkUserId ? await ensureDbUser(env, clerkUserId) : null;
    const now = new Date().toISOString();

    const result = await env.DB.prepare(`
      UPDATE workspaces
      SET
        user_id = COALESCE(user_id, ?),
        is_cleared = 1,
        cleared_at = ?,
        updated_at = ?,
        last_opened_at = ?
      WHERE id = ?
    `)
      .bind(dbUserId, now, now, now, workspaceId)
      .run();

    if (!result?.meta?.changes) {
      return json({ ok: false, error: "Workspace not found" }, 404, request, env);
    }

    return json({ ok: true }, 200, request, env);
  } catch (e) {
    return json(
      { ok: false, error: e instanceof Error ? e.message : "Failed to clear workspace" },
      500,
      request,
      env
    );
  }
}

async function getWorkspace(request, env) {
  try {
    const url = new URL(request.url);
    const id = String(url.searchParams.get("id") || "").trim();

    if (!id) {
      return json({ ok: false, error: "Missing id" }, 400, request, env);
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
        is_cleared,
        cleared_at,
        created_at,
        updated_at,
        last_opened_at
      FROM workspaces
      WHERE id = ?
    `)
      .bind(id)
      .first();

    if (!workspace) {
      return json({ ok: false, error: "Workspace not found" }, 404, request, env);
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

    return json(
      {
        ok: true,
        workspace,
      },
      200,
      request,
      env
    );
  } catch (e) {
    return json(
      { ok: false, error: e instanceof Error ? e.message : "Fetch failed" },
      500,
      request,
      env
    );
  }
}

async function listWorkspaces(request, env) {
  try {
    const url = new URL(request.url);
    const clerkUserId = String(url.searchParams.get("userId") || "").trim();

    if (!clerkUserId) {
      return json({ ok: false, error: "Missing userId" }, 400, request, env);
    }

    const user = await env.DB.prepare(`
      SELECT id
      FROM users
      WHERE clerk_user_id = ?
      LIMIT 1
    `)
      .bind(clerkUserId)
      .first();

    if (!user?.id) {
      return json({ ok: true, workspaces: [] }, 200, request, env);
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
        is_cleared,
        cleared_at,
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
      .bind(user.id)
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
          sectionsDone = Object.values(sectionResults).filter(
            (section) =>
              section &&
              typeof section === "object" &&
              section.status === "success"
          ).length;
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
        is_cleared: Number(workspace.is_cleared || 0),
        cleared_at: workspace.cleared_at,
        created_at: workspace.created_at,
        updated_at: workspace.updated_at,
        last_opened_at: workspace.last_opened_at,
      };
    });

    return json(
      {
        ok: true,
        workspaces,
      },
      200,
      request,
      env
    );
  } catch (e) {
    return json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "Failed to load workspaces",
      },
      500,
      request,
      env
    );
  }
}