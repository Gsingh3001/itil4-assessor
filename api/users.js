/**
 * /api/users.js — User management backed by Vercel KV
 *
 * Setup (Vercel Dashboard):
 *   1. Storage → Create KV Database → link to project
 *   2. Environment variables KV_URL, KV_REST_API_URL, KV_REST_API_TOKEN,
 *      KV_REST_API_READ_ONLY_TOKEN are injected automatically.
 *
 * Endpoints:
 *   POST  /api/users?action=init   — seed Admin user if KV is empty (no auth required)
 *   POST  /api/users?action=auth   — authenticate { username, password } → { name, role }
 *   GET   /api/users               — list users (admin only, Basic auth)
 *   POST  /api/users               — create user (admin only, Basic auth)
 *   DELETE /api/users?username=X   — delete user (admin only, Basic auth)
 */

import { kv } from "@vercel/kv";

const USERS_KV_KEY = "itsm_tcs_v4_users";
const DEFAULT_ADMIN = {
  Admin: { password: "Guessme0t", role: "admin", name: "Administrator" },
};

/* ── helpers ─────────────────────────────────────────────────────── */
function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
}

async function getUsers() {
  const users = await kv.get(USERS_KV_KEY);
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

/* ── handler ─────────────────────────────────────────────────────── */
export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    /* ── INIT: seed admin on first deploy ──────────────────────── */
    if (req.method === "PUT" && req.query.action === "init") {
      const existing = await kv.get(USERS_KV_KEY);
      if (!existing) {
        await kv.set(USERS_KV_KEY, DEFAULT_ADMIN);
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
      return res.status(200).json({ name: u.name || username, role: u.role || "user" });
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
        name: name || username,
        role: role || "user",
        createdAt: new Date().toISOString(),
      };
      await kv.set(USERS_KV_KEY, users);
      return res.status(201).json({ success: true, username });
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
      await kv.set(USERS_KV_KEY, users);
      return res.status(200).json({ success: true, deleted: username });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("[/api/users] error:", err);
    return res.status(500).json({ error: "Internal server error", detail: err.message });
  }
}
