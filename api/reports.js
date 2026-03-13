/**
 * /api/reports.js — PDF report storage backed by Vercel Blob
 *
 * Setup (Vercel Dashboard):
 *   1. Storage → Create Blob Store → link to project
 *   2. Environment variable BLOB_READ_WRITE_TOKEN is injected automatically.
 *
 * Endpoints:
 *   POST /api/reports          — save HTML report → returns { url, pathname }
 *   GET  /api/reports          — list all reports (admin, Basic auth)
 *   GET  /api/reports?username=X — list reports for a specific user
 *   DELETE /api/reports?pathname=X — delete a report blob (admin, Basic auth)
 *
 * Blob naming convention:
 *   reports/<username>/<YYYY-MM-DD>_<companySlug>_<ts>.html
 */

import { put, list, del } from "@vercel/blob";
import { kv } from "@vercel/kv";

const USERS_KV_KEY = "itsm_tcs_v4_users";

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
}

async function verifyAdmin(req) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Basic ")) return false;
  const decoded = Buffer.from(auth.slice(6), "base64").toString("utf8");
  const colon = decoded.indexOf(":");
  if (colon === -1) return false;
  const username = decoded.slice(0, colon);
  const password = decoded.slice(colon + 1);
  const users = (await kv.get(USERS_KV_KEY)) || {
    Admin: { password: "Guessme0t", role: "admin" },
  };
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
  return new Date(ts).toISOString().slice(0, 10); // YYYY-MM-DD
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    /* ── POST: save report HTML to Blob ────────────────────────── */
    if (req.method === "POST") {
      const { htmlContent, username, companyName, timestamp } = req.body || {};

      if (!htmlContent || typeof htmlContent !== "string")
        return res.status(400).json({ error: "htmlContent (string) is required" });

      const ts = timestamp || Date.now();
      const user = username || "unknown";
      const company = slugify(companyName || "report");
      const date = formatDate(ts);
      const pathname = `reports/${user}/${date}_${company}_${ts}.html`;

      const blob = await put(pathname, htmlContent, {
        access: "public",
        contentType: "text/html; charset=utf-8",
        addRandomSuffix: false,
      });

      // Mark user as submitted in KV
      try {
        const users = (await kv.get(USERS_KV_KEY)) || {};
        if (users[user]) {
          users[user].isSubmitted = true;
          users[user].submittedAt = new Date().toISOString();
          await kv.set(USERS_KV_KEY, users);
        }
      } catch (kvErr) {
        console.warn("Failed to update isSubmitted in KV:", kvErr);
      }

      return res.status(201).json({
        url: blob.url,
        pathname: blob.pathname,
        username: user,
        companyName: companyName || "",
        savedAt: new Date(ts).toISOString(),
      });
    }

    /* ── GET: list reports ─────────────────────────────────────── */
    if (req.method === "GET") {
      const isAdmin = await verifyAdmin(req);
      const callerUsername = getBasicUsername(req);

      // Non-admin users can only see their own reports
      const { username } = req.query;

      if (!isAdmin && (!callerUsername || callerUsername !== username)) {
        return res.status(403).json({ error: "Access denied" });
      }

      const prefix = username
        ? `reports/${username}/`
        : "reports/";

      const { blobs } = await list({ prefix });

      const reports = blobs.map((b) => {
        // Parse username from pathname: reports/<username>/<file>
        const parts = b.pathname.split("/");
        const fileUser = parts[1] || "unknown";
        // Parse company slug and ts from filename: YYYY-MM-DD_companySlug_ts.html
        const filename = parts[2] || "";
        const segments = filename.replace(".html", "").split("_");
        const savedTs = parseInt(segments[segments.length - 1], 10) || 0;

        return {
          url: b.url,
          pathname: b.pathname,
          username: fileUser,
          size: b.size,
          uploadedAt: b.uploadedAt,
          savedAt: savedTs ? new Date(savedTs).toISOString() : b.uploadedAt,
          filename,
        };
      });

      // Sort newest first
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
    // Categorize common errors for easier debugging
    let detail = err.message;
    if (detail.includes("BLOB_READ_WRITE_TOKEN")) {
      detail = "Vercel BLOB_READ_WRITE_TOKEN is missing. Please ensure the Blob store is linked to this project and redeployed.";
    }
    return res.status(500).json({ error: "Internal server error", detail });
  }
}
