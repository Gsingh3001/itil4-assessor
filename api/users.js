/**
 * /api/users.js — User management backed by Vercel Blob
 *
 * Users are stored at: itsm/credentials/users.json
 * The BLOB_READ_WRITE_TOKEN env var must be present (same store as reports.js).
 *
 * Endpoints:
 *   PUT  /api/users?action=init   — seed Admin user if Blob is empty (no auth)
 *   POST /api/users?action=auth   — authenticate { username, password } → { name, role }
 *   GET  /api/users               — list users (admin only, Basic auth)
 *   POST /api/users               — create user (admin only, Basic auth)
 *   PUT  /api/users?username=X    — update user (admin only, Basic auth)
 *   DELETE /api/users?username=X  — delete user (admin only, Basic auth)
 */

import { put, list, del } from "@vercel/blob";

const USERS_PATH    = "itsm/credentials/users.json";
const DEFAULT_ADMIN = {
  Admin: { password: "Guessme0t", role: "admin", name: "Administrator" },
};

/* ── helpers ─────────────────────────────────────────────────────── */
function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
}

/** Convert array-of-user-objects to { username: userObj } map (handles legacy format) */
function normalizeUsers(data) {
  if (!data) return null;
  if (Array.isArray(data)) {
    const obj = {};
    for (const u of data) {
      if (u.username) {
        obj[u.username] = {
          password:  u.password,
          role:      u.role      || "user",
          name:      u.name      || u.username,
          email:     u.email     || "",
          createdAt: u.createdAt || new Date().toISOString(),
        };
      }
    }
    return Object.keys(obj).length > 0 ? obj : null;
  }
  // Already object/map format
  return typeof data === "object" ? data : null;
}

async function readUsers() {
  try {
    const { blobs } = await list({ prefix: USERS_PATH });
    if (!blobs.length) return null;
    // Prefer downloadUrl (bypasses CDN cache) — falls back to url if absent
    const fetchUrl = blobs[0].downloadUrl || blobs[0].url;
    const resp = await fetch(fetchUrl, { cache: "no-store" });
    if (!resp.ok) return null;
    return normalizeUsers(await resp.json());
  } catch {
    return null;
  }
}

async function writeUsers(users) {
  await put(USERS_PATH, JSON.stringify(users), {
    access: "public",
    addRandomSuffix: false,
    contentType: "application/json",
  });
}

async function getUsers() {
  const users = await readUsers();
  if (!users) {
    // First run: seed default admin and persist
    await writeUsers(DEFAULT_ADMIN);
    return DEFAULT_ADMIN;
  }
  return users;
}

async function verifyAdmin(req) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Basic ")) return false;
  const decoded = Buffer.from(auth.slice(6), "base64").toString("utf8");
  const colon   = decoded.indexOf(":");
  if (colon === -1) return false;
  const username = decoded.slice(0, colon);
  const password = decoded.slice(colon + 1);
  const users = await getUsers();
  const u = users[username];
  return u && u.password === password && u.role === "admin";
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
    /* ── DEBUG: inspect blob state (no auth) ───────────────────── */
    if (req.method === "GET" && req.query.action === "debug") {
      const { blobs } = await list({ prefix: USERS_PATH });
      const raw = await readUsers();
      const usernames = raw ? Object.keys(raw) : [];
      return res.status(200).json({
        blobFound: blobs.length > 0,
        blobUrl:   blobs[0]?.url || null,
        downloadUrl: blobs[0]?.downloadUrl || null,
        uploadedAt: blobs[0]?.uploadedAt || null,
        userCount: usernames.length,
        usernames,
      });
    }

    /* ── INIT: seed admin on first deploy ──────────────────────── */
    if (req.method === "PUT" && req.query.action === "init") {
      const existing = await readUsers();
      if (!existing) {
        await writeUsers(DEFAULT_ADMIN);
        return res.status(200).json({ seeded: true });
      }
      return res.status(200).json({ seeded: false, message: "Already initialised" });
    }

    /* ── AUTH: validate credentials ────────────────────────────── */
    if (req.method === "POST" && req.query.action === "auth") {
      const { username, password } = req.body || {};
      if (!username || !password)
        return res.status(400).json({ error: "username and password required" });
      const users = await getUsers();
      const u = users[username];
      if (!u || u.password !== password)
        return res.status(401).json({ error: "Invalid credentials" });
      return res.status(200).json({
        name:        u.name || username,
        role:        u.role || "user",
        isSubmitted: !!u.isSubmitted,
      });
    }

    /* ── GET: list users (admin only) ──────────────────────────── */
    if (req.method === "GET") {
      if (!(await verifyAdmin(req)))
        return res.status(403).json({ error: "Admin credentials required" });
      const users = await getUsers();
      // Strip passwords before returning
      const safe = Object.fromEntries(
        Object.entries(users).map(([k, v]) => [k, { name: v.name, role: v.role }])
      );
      return res.status(200).json(safe);
    }

    /* ── POST: create user (admin only) ────────────────────────── */
    if (req.method === "POST") {
      if (!(await verifyAdmin(req)))
        return res.status(403).json({ error: "Admin credentials required" });
      const { username, password, name, role } = req.body || {};
      if (!username || !password)
        return res.status(400).json({ error: "username and password required" });
      const users = await getUsers();
      if (users[username])
        return res.status(409).json({ error: `User '${username}' already exists` });
      users[username] = {
        password,
        name:      name || username,
        role:      role || "user",
        createdAt: new Date().toISOString(),
      };
      await writeUsers(users);
      return res.status(201).json({ success: true, username });
    }

    /* ── PUT: update user (admin only) ─────────────────────────── */
    if (req.method === "PUT") {
      if (!(await verifyAdmin(req)))
        return res.status(403).json({ error: "Admin credentials required" });
      const { username } = req.query;
      if (!username) return res.status(400).json({ error: "username query param required" });
      const { password, name, role, isSubmitted } = req.body || {};
      const users = await getUsers();
      if (!users[username])
        return res.status(404).json({ error: `User '${username}' not found` });
      if (password)      users[username].password    = password;
      if (name)          users[username].name        = name;
      if (role)          users[username].role        = role;
      if (isSubmitted !== undefined) users[username].isSubmitted = isSubmitted;
      await writeUsers(users);
      return res.status(200).json({ success: true, username });
    }

    /* ── DELETE: remove user (admin only) ──────────────────────── */
    if (req.method === "DELETE") {
      if (!(await verifyAdmin(req)))
        return res.status(403).json({ error: "Admin credentials required" });
      const { username } = req.query;
      if (!username) return res.status(400).json({ error: "username query param required" });
      if (username === "Admin")
        return res.status(400).json({ error: "Cannot delete the Admin account" });
      const users = await getUsers();
      if (!users[username])
        return res.status(404).json({ error: `User '${username}' not found` });
      delete users[username];
      await writeUsers(users);
      return res.status(200).json({ success: true, deleted: username });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("[/api/users] error:", err);
    return res.status(500).json({ error: "Internal server error", detail: err.message });
  }
}
