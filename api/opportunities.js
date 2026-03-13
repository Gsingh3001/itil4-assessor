/**
 * /api/opportunities.js — CRM-style lead storage backed by Vercel KV
 *
 * Endpoints:
 *   POST /api/opportunities — Create a new opportunity log
 *   GET  /api/opportunities — List all opportunities (Admin only)
 *   DELETE /api/opportunities?id=X — Delete an entry (Admin only)
 */

import { kv } from "@vercel/kv";

const USERS_KV_KEY = "itsm_v4_users";
const OPPORTUNITIES_KV_KEY = "itsm_v4_opportunities";

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

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    /* ── POST: Log new business opportunities ────────────────────── */
    if (req.method === "POST") {
      const opportunity = req.body;
      if (!opportunity || !opportunity.companyName) {
        return res.status(400).json({ error: "Opportunity data with companyName is required" });
      }

      const id = `opp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const newEntry = {
        id,
        ...opportunity,
        createdAt: new Date().toISOString(),
      };

      // Get existing logs
      const logs = (await kv.get(OPPORTUNITIES_KV_KEY)) || [];
      logs.push(newEntry);
      
      // Store back
      await kv.set(OPPORTUNITIES_KV_KEY, logs);

      return res.status(201).json({ success: true, id });
    }

    /* ── GET: List all opportunities (Admin Only) ────────────────── */
    if (req.method === "GET") {
      if (!(await verifyAdmin(req))) {
        return res.status(403).json({ error: "Admin credentials required" });
      }

      const logs = (await kv.get(OPPORTUNITIES_KV_KEY)) || [];
      // Sort newest first
      logs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      
      return res.status(200).json(logs);
    }

    /* ── DELETE: Remove an entry (Admin Only) ─────────────────────── */
    if (req.method === "DELETE") {
      if (!(await verifyAdmin(req))) {
        return res.status(403).json({ error: "Admin credentials required" });
      }

      const { id } = req.query;
      if (!id) return res.status(400).json({ error: "id param required" });

      let logs = (await kv.get(OPPORTUNITIES_KV_KEY)) || [];
      const newLogs = logs.filter(l => l.id !== id);
      
      await kv.set(OPPORTUNITIES_KV_KEY, newLogs);
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("[/api/opportunities] error:", err);
    return res.status(500).json({ error: "Internal server error", detail: err.message });
  }
}
