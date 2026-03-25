/**
 * /api/reports.js — PDF report storage backed by Vercel Blob
 *
 * Endpoints:
 *   POST   /api/reports              — save HTML report → returns { url, pathname }
 *   GET    /api/reports              — list all reports (admin, Basic auth)
 *   GET    /api/reports?username=X   — list reports for a specific user
 *   DELETE /api/reports?pathname=X   — delete a report blob (admin, Basic auth)
 *
 * Blob naming:
 *   reports/<username>/<YYYY-MM-DD>_<companySlug>_<ts>.html
 *
 * Users are verified against: itsm/credentials/users.json (same as users.js)
 */

import { put, list, del } from "@vercel/blob";

const USERS_PATH = "itsm/credentials/users.json";
const DEFAULT_ADMIN = {
  Admin: { password: "Guessme0t", role: "admin", name: "Administrator" },
};

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
}

/* ── shared user helpers (mirrors users.js) ─────────────────────── */
async function readUsers() {
  try {
    const { blobs } = await list({ prefix: USERS_PATH });
    if (!blobs.length) return null;
    const resp = await fetch(blobs[0].url, { cache: "no-store" });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

async function getUsers() {
  const users = await readUsers();
  return users || DEFAULT_ADMIN;
}

async function verifyAdmin(req) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Basic ")) return false;
  const decoded = Buffer.from(auth.slice(6), "base64").toString("utf8");
  const colon = decoded.indexOf(":");
  if (colon === -1) return false;
  const username = decoded.slice(0, colon);
  const password = decoded.slice(colon + 1);
  const users = await getUsers();
  const u = users[username];
  return u && u.password === password && u.role === "admin";
}

function getBasicUsername(req) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Basic ")) return null;
  const decoded = Buffer.from(auth.slice(6), "base64").toString("utf8");
  const colon = decoded.indexOf(":");
  return colon !== -1 ? decoded.slice(0, colon) : null;
}

function slugify(str = "") {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

function formatDate(ts) {
  return new Date(ts).toISOString().slice(0, 10);
}

/* ── handler ─────────────────────────────────────────────────────── */
export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(503).json({
      error: "Blob storage not configured",
      detail: "BLOB_READ_WRITE_TOKEN is not set. Link the Blob store to this project in the Vercel dashboard.",
    });
  }

  try {
    /* ── POST: save report HTML to Blob ────────────────────────── */
    if (req.method === "POST") {
      const { htmlContent, username, companyName, timestamp } = req.body || {};

      if (!htmlContent || typeof htmlContent !== "string")
        return res.status(400).json({ error: "htmlContent (string) is required" });

      const ts       = timestamp || Date.now();
      const user     = username || "unknown";
      const company  = slugify(companyName || "report");
      const date     = formatDate(ts);
      const pathname = `reports/${user}/${date}_${company}_${ts}.html`;

      const blob = await put(pathname, htmlContent, {
        access: "public",
        contentType: "text/html; charset=utf-8",
        addRandomSuffix: false,
      });

      return res.status(201).json({
        url:         blob.url,
        pathname:    blob.pathname,
        username:    user,
        companyName: companyName || "",
        savedAt:     new Date(ts).toISOString(),
      });
    }

    /* ── GET: list reports ─────────────────────────────────────── */
    if (req.method === "GET") {
      const isAdmin        = await verifyAdmin(req);
      const callerUsername = getBasicUsername(req);
      const { username }   = req.query;

      if (!isAdmin && (!callerUsername || callerUsername !== username)) {
        return res.status(403).json({ error: "Access denied" });
      }

      const prefix = username ? `reports/${username}/` : "reports/";
      const { blobs } = await list({ prefix });

      const reports = blobs.map((b) => {
        const parts    = b.pathname.split("/");
        const fileUser = parts[1] || "unknown";
        const filename = parts[2] || "";
        const segments = filename.replace(".html", "").split("_");
        const savedTs  = parseInt(segments[segments.length - 1], 10) || 0;

        return {
          url:        b.url,
          pathname:   b.pathname,
          username:   fileUser,
          size:       b.size,
          uploadedAt: b.uploadedAt,
          savedAt:    savedTs ? new Date(savedTs).toISOString() : b.uploadedAt,
          filename,
        };
      });

      reports.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
      return res.status(200).json(reports);
    }

    /* ── DELETE: remove a report blob (admin only) ─────────────── */
    if (req.method === "DELETE") {
      if (!(await verifyAdmin(req)))
        return res.status(403).json({ error: "Admin credentials required" });
      const { pathname } = req.query;
      if (!pathname) return res.status(400).json({ error: "pathname query param required" });
      await del(pathname);
      return res.status(200).json({ success: true, deleted: pathname });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("[/api/reports] error:", err);
    return res.status(500).json({ error: "Internal server error", detail: err.message });
  }
}
