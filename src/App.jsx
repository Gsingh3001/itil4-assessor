import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import * as XLSX from "xlsx";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer
} from "recharts";

/* ─── Branding ─────────────────────────────────────────────────── */
const TOOL_NAME = "ITSM Maturity Assessor";
const ORG_BRAND = "TCS ITSM Practice";
const VERSION   = "V4.0";
const TC  = "#003087";
const TCR = "#c8102e";
const TCL = "#009BDE";
const TCG = "#00A94F";

/* ─── Storage Keys ──────────────────────────────────────────────── */
const USERS_KEY    = "itsm_tcs_v4_users";
const USER_SES_KEY = "itsm_tcs_v4_usersession";
const STORAGE_KEY  = "itsm_tcs_v4";
const HISTORY_KEY  = "itsm_tcs_history";
const PROFILE_KEY  = "itsm_tcs_v4_profile";   // per-user: itsm_tcs_v4_profile_<username>
const SEL_PRAC_KEY = "itsm_tcs_v4_selprac";   // per-user: itsm_tcs_v4_selprac_<username>
const SUBMIT_KEY   = "itsm_tcs_v4_submitted";  // per-user: itsm_tcs_v4_submitted_<username>
const SUBMISSION_KEY = "itsm_tcs_v4_submission"; // per-user: full submission data for admin PDF

const ITSM_TOOLS = ["ServiceNow","Jira","BMC Remedy","Freshservice","Zendesk","ManageEngine","Other"];
const INDUSTRIES = ["Banking & Financial Services","Insurance","Healthcare & Life Sciences","Retail & Consumer",
  "Manufacturing","Telecommunications","Energy & Utilities","Public Sector / Government",
  "Media & Entertainment","Technology","Professional Services","Other"];
const EMP_SIZES  = ["<500","500–2000","2000–10000","10000+"];

/* ─── Dimensions ────────────────────────────────────────────────── */
const DIMS = {
  PE: { label: "Process Existence",      weight: 0.20, color: "#22c55e" },
  PC: { label: "Process Consistency",    weight: 0.25, color: "#3b82f6" },
  MM: { label: "Measurement Maturity",   weight: 0.25, color: "#eab308" },
  CI: { label: "Continuous Improvement", weight: 0.20, color: "#f97316" },
  TI: { label: "Tool Integration",       weight: 0.10, color: "#a855f7" },
};
const DIM_KEYS = Object.keys(DIMS);

/* ─── 34 Practices ──────────────────────────────────────────────── */
const PRACTICES = [
  // General Management (14)
  { id:"architecture_mgmt",      name:"Architecture Management",          group:"General Management" },
  { id:"continual_improvement",   name:"Continual Improvement",            group:"General Management" },
  { id:"info_security_mgmt",      name:"Information Security Management",  group:"General Management" },
  { id:"knowledge_mgmt",          name:"Knowledge Management",             group:"General Management" },
  { id:"measurement_reporting",   name:"Measurement & Reporting",          group:"General Management" },
  { id:"org_change_mgmt",         name:"Organizational Change Management", group:"General Management" },
  { id:"portfolio_mgmt",          name:"Portfolio Management",             group:"General Management" },
  { id:"project_mgmt",            name:"Project Management",               group:"General Management" },
  { id:"relationship_mgmt",       name:"Relationship Management",          group:"General Management" },
  { id:"risk_mgmt",               name:"Risk Management",                  group:"General Management" },
  { id:"service_financial_mgmt",  name:"Service Financial Management",     group:"General Management" },
  { id:"strategy_mgmt",           name:"Strategy Management",              group:"General Management" },
  { id:"supplier_mgmt",           name:"Supplier Management",              group:"General Management" },
  { id:"workforce_talent_mgmt",   name:"Workforce & Talent Management",    group:"General Management" },
  // Service Management (17)
  { id:"availability_mgmt",       name:"Availability Management",          group:"Service Management" },
  { id:"business_analysis",       name:"Business Analysis",                group:"Service Management" },
  { id:"capacity_performance_mgmt",name:"Capacity & Performance Management",group:"Service Management"},
  { id:"change_enablement",       name:"Change Enablement",                group:"Service Management" },
  { id:"incident_mgmt",           name:"Incident Management",              group:"Service Management" },
  { id:"it_asset_mgmt",           name:"IT Asset Management",              group:"Service Management" },
  { id:"monitoring_event_mgmt",   name:"Monitoring & Event Management",    group:"Service Management" },
  { id:"problem_mgmt",            name:"Problem Management",               group:"Service Management" },
  { id:"release_mgmt",            name:"Release Management",               group:"Service Management" },
  { id:"service_catalog_mgmt",    name:"Service Catalogue Management",     group:"Service Management" },
  { id:"service_config_mgmt",     name:"Service Configuration Management", group:"Service Management" },
  { id:"service_continuity_mgmt", name:"Service Continuity Management",    group:"Service Management" },
  { id:"service_design",          name:"Service Design",                   group:"Service Management" },
  { id:"service_desk",            name:"Service Desk",                     group:"Service Management" },
  { id:"service_level_mgmt",      name:"Service Level Management",         group:"Service Management" },
  { id:"service_request_mgmt",    name:"Service Request Management",       group:"Service Management" },
  { id:"service_validation_testing",name:"Service Validation & Testing",   group:"Service Management" },
  // Technical Management (3)
  { id:"deployment_mgmt",              name:"Deployment Management",              group:"Technical Management" },
  { id:"infrastructure_platform_mgmt", name:"Infrastructure & Platform Management",group:"Technical Management"},
  { id:"software_dev_mgmt",            name:"Software Development Management",    group:"Technical Management" },
];

const GROUPS = ["General Management","Service Management","Technical Management"];

/* ─── QB Parser (SheetJS) ───────────────────────────────────────── */
function parseQBFromSheet(rows) {
  // rows: array of objects with headers matching Excel columns
  const qb = {};
  for (const r of rows) {
    const pid  = (r.practice_id || "").trim();
    const lvl  = (r.competency_level || "").trim().toLowerCase();
    const dim  = (r.dimension || "PE").trim().toUpperCase();
    if (!pid || !lvl) continue;
    if (!qb[pid]) qb[pid] = { beginner: [], practitioner: [], expert: [] };
    if (!qb[pid][lvl]) continue;
    qb[pid][lvl].push({
      qid:       String(r.question_id || "").trim(),
      text:      String(r.question_text || "").trim(),
      hint:      String(r.hint || "").trim(),
      dim:       DIM_KEYS.includes(dim) ? dim : "PE",
      fup_p:     String(r.followup_if_partial || "").trim(),
      fup_n:     String(r.followup_if_no || "").trim(),
      mandatory: String(r.is_mandatory || "N").trim().toUpperCase() === "Y",
      order:     Number(r.question_order) || 999,
    });
  }
  // sort by order
  for (const pid of Object.keys(qb)) {
    for (const lvl of ["beginner","practitioner","expert"]) {
      if (qb[pid][lvl]) qb[pid][lvl].sort((a,b) => a.order - b.order);
    }
  }
  return qb;
}

async function loadQBFromExcel() {
  try {
    const resp = await fetch("/question-bank.xlsx", { cache: "no-store" });
    if (!resp.ok) return null;
    const ab   = await resp.arrayBuffer();
    const wb   = XLSX.read(ab, { type: "array" });
    const ws   = wb.Sheets["Questions"] || wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
    const qb   = parseQBFromSheet(rows);
    if (Object.keys(qb).length === 0) return null;
    return qb;
  } catch(e) {
    console.warn("QB load failed:", e);
    return null;
  }
}

/* ─── Minimal Fallback QB (skeleton — 3 questions per level) ────── */
function makeFallbackQB() {
  const qb = {};
  const LEVELS = ["beginner","practitioner","expert"];
  const SAMPLE_DIMS = ["PE","PC","MM","CI","TI","PE","MM","CI"];
  for (const p of PRACTICES) {
    qb[p.id] = {};
    for (const lvl of LEVELS) {
      const count = lvl === "beginner" ? 6 : lvl === "practitioner" ? 8 : 10;
      qb[p.id][lvl] = Array.from({length: count}, (_,i) => ({
        qid:  `${p.id.slice(0,4)}_${lvl.slice(0,3)}_${String(i+1).padStart(2,"0")}`,
        text: `[${lvl}] ${p.name} — Question ${i+1}`,
        hint: "Load question-bank.xlsx for full question text.",
        dim:  SAMPLE_DIMS[i % SAMPLE_DIMS.length],
        fup_p:"",
        fup_n:"",
        mandatory: i === 0,
        order: i+1,
      }));
    }
  }
  return qb;
}

/* ─── v10 Scoring Engine ────────────────────────────────────────── */
// ans: { [qid]: { main: 2|1|0, fup: 2|1|0|null } }
// Returns { PE, PC, MM, CI, TI, overall }
function computeDimScores(questions, answers) {
  const earned = { PE:0, PC:0, MM:0, CI:0, TI:0 };
  const maxPts  = { PE:0, PC:0, MM:0, CI:0, TI:0 };

  for (const q of questions) {
    const d = q.dim;
    const a = answers[q.qid] || {};
    // main question: Yes=2, Partial=1, No=0; max=2
    maxPts[d]  += 2;
    earned[d]  += (a.main ?? 0);
    // follow-up: if shown, half-weight (max=1)
    const hasFup = (a.main === 1 && q.fup_p) || (a.main === 0 && q.fup_n);
    if (hasFup) {
      maxPts[d]  += 1;
      const fv = a.fup ?? 0;
      // fup: Yes=1, Partial=0.5, No=0
      earned[d]  += fv;
    }
  }

  const dimScores = {};
  for (const dk of DIM_KEYS) {
    dimScores[dk] = maxPts[dk] > 0 ? 1 + (earned[dk] / maxPts[dk]) * 4 : 1;
  }
  const overall = DIM_KEYS.reduce((s,dk) => s + dimScores[dk] * DIMS[dk].weight, 0);
  return { ...dimScores, overall };
}

/* backward-compatible: overall 1.0–5.0, same as before */
function calcScore(dimResult) {
  return Math.round(dimResult.overall * 10) / 10;
}

function maturityLabel(score) {
  if (score < 1.5) return "Initial";
  if (score < 2.5) return "Managed";
  if (score < 3.5) return "Defined";
  if (score < 4.5) return "Quantitatively Managed";
  return "Optimizing";
}
function maturityColor(score) {
  if (score < 1.5) return "#ef4444";
  if (score < 2.5) return "#f97316";
  if (score < 3.5) return "#eab308";
  if (score < 4.5) return TCL;
  return TCG;
}

/* ─── Storage helpers ───────────────────────────────────────────── */
const ls = {
  get: (k, def=null) => { try { const v=localStorage.getItem(k); return v?JSON.parse(v):def; } catch{ return def; } },
  set: (k,v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch{} },
};
const ss = {
  get: (k, def=null) => { try { const v=sessionStorage.getItem(k); return v?JSON.parse(v):def; } catch{ return def; } },
  set: (k,v) => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch{} },
};

function initUsers() {
  const users = ls.get(USERS_KEY, null);
  if (!users) ls.set(USERS_KEY, { Admin: { password:"Guessme0t", role:"admin", name:"Administrator" } });
}

/* ─── Remote API helpers ────────────────────────────────────────── */
// Detect if we're running on Vercel (API routes available)
const IS_VERCEL = typeof window !== "undefined" &&
  (window.location.hostname !== "localhost" &&
   window.location.hostname !== "127.0.0.1");

// Store admin credentials (Base64) in sessionStorage for authenticated API calls
const TOKEN_KEY = "itsm_tcs_v4_apitoken";
const api = {
  setToken: (username, password) =>
    ss.set(TOKEN_KEY, btoa(`${username}:${password}`)),
  getToken: () => ss.get(TOKEN_KEY, null),
  clearToken: () => ss.set(TOKEN_KEY, null),

  authHeader: () => {
    const t = ss.get(TOKEN_KEY, null);
    return t ? { Authorization: `Basic ${t}` } : {};
  },

  // Try remote, fall back to null on network error
  async call(method, path, body) {
    try {
      const opts = {
        method,
        headers: { "Content-Type": "application/json", ...api.authHeader() },
      };
      if (body !== undefined) opts.body = JSON.stringify(body);
      const res = await fetch(path, opts);
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok, status: res.status, data };
    } catch {
      return { ok: false, status: 0, data: {} };
    }
  },
};

/* ─── App Root ──────────────────────────────────────────────────── */
export default function App() {
  const [screen,    setScreen]    = useState("loading");
  const [user,      setUser]      = useState(null);       // { username, name, role }
  const [qb,        setQb]        = useState(null);       // loaded QB or null
  const [qbReady,   setQbReady]   = useState(false);
  const [scores,    setScores]    = useState({});         // { practiceId: 1.0–5.0 }
  const [dimScores, setDimScores] = useState({});         // { practiceId: { PE,PC,MM,CI,TI,overall } }
  const [answers,   setAnswers]   = useState({});         // { practiceId: { [qid]: {main,fup} } }
  const [levels,    setLevels]    = useState({});         // { practiceId: "beginner"|"practitioner"|"expert" }
  const [selectedPractice, setSelectedPractice] = useState(null);
  const [historyList, setHistoryList] = useState([]);
  const [reportData,  setReportData]  = useState(null);  // for report screen
  const [modal,       setModal]       = useState(null);   // { title, msg, onOk }
  const [toast,       setToast]       = useState(null);
  // ── New state for BUG 1/2/3/5 ──
  const [companyProfile,    setCompanyProfile]    = useState(null);  // { companyName, industry, employeeStrength, itsmTools[] }
  const [selectedPractices, setSelectedPractices] = useState([]);    // practice ids chosen by user
  const [submitted,         setSubmitted]         = useState(false); // final submit lock

  const showToast = useCallback((msg, type="info") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Load QB from Excel on mount + seed remote users
  useEffect(() => {
    // Seed local users (always)
    initUsers();
    // Seed remote KV on Vercel (no-op if already seeded)
    if (IS_VERCEL) {
      api.call("PUT", "/api/users?action=init").catch(() => {});
    }
    loadQBFromExcel().then(loaded => {
      if (loaded) {
        setQb(loaded);
        console.log("QB loaded from question-bank.xlsx:", Object.keys(loaded).length, "practices");
      } else {
        setQb(makeFallbackQB());
        console.warn("Using fallback QB — question-bank.xlsx not found");
      }
      setQbReady(true);
    });
  }, []);

  // Helper: route user after login/restore
  function routeAfterLogin(username) {
    const saved = ls.get(STORAGE_KEY);
    if (saved && saved.username === username) {
      setScores(saved.scores || {});
      setDimScores(saved.dimScores || {});
      setAnswers(saved.answers || {});
      setLevels(saved.levels || {});
    }
    const profile   = ls.get(`${PROFILE_KEY}_${username}`);
    const selprac   = ls.get(`${SEL_PRAC_KEY}_${username}`);
    const isSubmit  = ls.get(`${SUBMIT_KEY}_${username}`);
    if (isSubmit || user?.isSubmitted) {
      if (profile) setCompanyProfile(profile);
      if (selprac) setSelectedPractices(selprac);
      setSubmitted(true);
      setScreen("submitted");
    } else if (!profile) {
      setScreen("companyprofile");
    } else {
      setCompanyProfile(profile);
      if (!selprac || !selprac.length) {
        setScreen("practiceconfig");
      } else {
        setSelectedPractices(selprac);
        setScreen("welcome");
      }
    }
  }

  // Restore session
  useEffect(() => {
    if (!qbReady) return;
    const ses = ss.get(USER_SES_KEY);
    if (ses?.username) {
      setUser(ses);
      routeAfterLogin(ses.username);
    } else {
      setScreen("userlogin");
    }
  }, [qbReady]);

  // Persist state on change
  useEffect(() => {
    if (user && Object.keys(scores).length > 0) {
      ls.set(STORAGE_KEY, { scores, dimScores, answers, levels, username: user.username });
    }
  }, [scores, dimScores, answers, levels, user]);

  async function login(username, password) {
    // ── Try remote API first (Vercel deployment) ──
    if (IS_VERCEL) {
      const { ok, data } = await api.call("POST", "/api/users?action=auth",
        { username, password });
      if (ok) {
        const ses = {
          username,
          name: data.name || username,
          role: data.role || "user",
          isSubmitted: !!data.isSubmitted
        };
        setUser(ses);
        ss.set(USER_SES_KEY, ses);
        // Store credentials token for subsequent admin API calls
        api.setToken(username, password);
        return true;
      }
      // If we got a real 401/403 from the server, reject immediately
      if (data?.error && data.error !== "Internal server error") return false;
      // Otherwise fall through to local fallback (network error / cold start)
    }
    // ── Local localStorage fallback ──
    const users = ls.get(USERS_KEY, {});
    const u = users[username];
    if (!u || u.password !== password) return false;
    const ses = { username, name: u.name || username, role: u.role || "user" };
    setUser(ses);
    ss.set(USER_SES_KEY, ses);
    api.setToken(username, password);
    return true;
  }

  function logout() {
    ss.set(USER_SES_KEY, null);
    api.clearToken();
    setUser(null);
    setScores({}); setDimScores({}); setAnswers({}); setLevels({});
    setCompanyProfile(null); setSelectedPractices([]); setSubmitted(false);
    setScreen("userlogin");
  }

  function goAssess(practiceId) {
    setSelectedPractice(practiceId);
    setScreen("assess");
  }

  function submitAssessment(practiceId, practiceAnswers, practiceLevel) {
    const qs  = qb[practiceId]?.[practiceLevel] || [];
    const dim = computeDimScores(qs, practiceAnswers);
    const sc  = calcScore(dim);
    const newScores    = { ...scores,    [practiceId]: sc };
    const newDimScores = { ...dimScores, [practiceId]: dim };
    const newAnswers   = { ...answers,   [practiceId]: practiceAnswers };
    const newLevels    = { ...levels,    [practiceId]: practiceLevel };
    setScores(newScores); setDimScores(newDimScores);
    setAnswers(newAnswers); setLevels(newLevels);
    setScreen("practices");
    showToast(`Assessment saved — Score: ${sc.toFixed(1)} (${maturityLabel(sc)})`, "success");
  }

  function viewReport(data) {
    setReportData(data);
    setScreen("report");
  }

  function saveProfile(profile) {
    ls.set(`${PROFILE_KEY}_${user.username}`, profile);
    setCompanyProfile(profile);
    setScreen("practiceconfig");
  }

  function savePracticeConfig(practices) {
    ls.set(`${SEL_PRAC_KEY}_${user.username}`, practices);
    setSelectedPractices(practices);
    setScreen("welcome");
  }

  function finalSubmit() {
    const practiceRows = PRACTICES.filter(p => scores[p.id] != null);
    const n = practiceRows.length;
    const avgScore = n > 0 ? practiceRows.reduce((s,p)=>s+scores[p.id],0)/n : 0;
    const submissionData = {
      username: user.username,
      ts: Date.now(),
      scores, dimScores, levels,
      completedCount: n,
      avgScore,
      companyProfile,
    };
    ls.set(`${SUBMIT_KEY}_${user.username}`, true);
    ls.set(`${SUBMISSION_KEY}_${user.username}`, submissionData);
    // Also save to shared history for admin view
    const hist = ls.get(HISTORY_KEY, []);
    hist.push(submissionData);
    ls.set(HISTORY_KEY, hist);
    setSubmitted(true);
    setScreen("submitted");
    showToast("Assessment submitted. Saving to cloud...", "info");

    // Automatic cloud upload
    if (IS_VERCEL) {
      saveToCloud().then(success => {
        if (success) showToast("Assessment submitted & saved to cloud!", "success");
        else showToast("Assessment submitted locally, but cloud save failed.", "error");
      });
    } else {
      showToast("Assessment submitted successfully!", "success");
    }
  }

  const completedCount = Object.keys(scores).length;

  if (!qbReady) return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
      height:"100vh",background:TC,color:"#fff",fontFamily:"system-ui,sans-serif"}}>
      <div style={{fontSize:28,fontWeight:700,marginBottom:8}}>{TOOL_NAME}</div>
      <div style={{fontSize:14,opacity:.7,marginBottom:32}}>{ORG_BRAND}</div>
      <div className="spinner" style={{width:40,height:40,border:"4px solid rgba(255,255,255,.3)",
        borderTopColor:"#fff",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{fontFamily:"system-ui,-apple-system,sans-serif",minHeight:"100vh",background:"#f0f4f8"}}>
      {toast && (
        <div style={{position:"fixed",top:16,right:16,zIndex:9999,
          background:toast.type==="success"?TCG:toast.type==="error"?TCR:"#334155",
          color:"#fff",padding:"12px 20px",borderRadius:8,boxShadow:"0 4px 12px rgba(0,0,0,.2)",
          fontSize:14,maxWidth:360}}>
          {toast.msg}
        </div>
      )}
      {modal && <ModalDialog {...modal} onClose={() => setModal(null)} />}
      {screen === "userlogin"  && <UserLogin onLogin={async (username, p) => {
        const ok = await login(username, p);
        if (ok) routeAfterLogin(username);
        return ok;
      }} />}
      {screen === "companyprofile" && <CompanyProfile user={user} onSave={saveProfile} onLogout={logout} />}
      {screen === "practiceconfig" && <PracticeConfig user={user} companyProfile={companyProfile}
        onSave={savePracticeConfig} onBack={() => setScreen("companyprofile")} onLogout={logout} />}
      {screen === "welcome"    && <Welcome user={user} completedCount={Object.keys(scores).filter(id=>selectedPractices.includes(id)).length}
        totalCount={selectedPractices.length}
        onStart={() => setScreen("practices")} onLogout={logout}
        onAdmin={() => setScreen("adminlogin")} onReport={() => {
          const hist = ls.get(HISTORY_KEY,[]);
          setHistoryList(hist);
          setReportData({ scores, dimScores, levels, username: user?.username, ts: Date.now(), companyProfile });
          setScreen("report");
        }} scores={scores} submitted={submitted} />}
      {screen === "adminlogin" && <AdminLogin onLogin={async (u, p) => {
        const ok = await login(u, p);
        if (ok && user?.role === "admin") { setScreen("admindash"); return true; }
        // fallback: check local store
        const users = ls.get(USERS_KEY,{});
        const u2 = users[u];
        if (u2?.password===p && u2?.role==="admin") {
          api.setToken(u, p);
          setScreen("admindash"); return true;
        }
        showToast("Admin credentials incorrect","error"); return false;
      }} onBack={() => setScreen("welcome")} />}
      {screen === "admindash"  && <AdminDashboard onBack={() => setScreen("welcome")}
        showToast={showToast} />}
      {screen === "practices"  && <PracticeSelect scores={scores} dimScores={dimScores}
        onSelect={goAssess} onBack={() => setScreen("welcome")}
        user={user} onLogout={logout}
        selectedPractices={selectedPractices}
        submitted={submitted}
        onFinalSubmit={() => setModal({
          title: "Submit Assessment",
          msg: "Once submitted, your answers cannot be changed. Are you sure you want to finalise this assessment?",
          onOk: finalSubmit,
        })}
        onReport={() => {
          setReportData({ scores, dimScores, levels, username: user?.username, ts: Date.now(), companyProfile });
          setScreen("report");
        }} />}
      {screen === "assess"     && <AssessScreen
        practice={PRACTICES.find(p=>p.id===selectedPractice)}
        qb={qb} existingLevel={levels[selectedPractice]}
        existingAnswers={answers[selectedPractice]}
        onSubmit={submitAssessment} onBack={() => setScreen("practices")}
        showToast={showToast} readOnly={submitted} />}
      {screen === "submitted"  && <SubmittedScreen user={user} scores={scores}
        dimScores={dimScores} levels={levels} companyProfile={companyProfile}
        selectedPractices={selectedPractices}
        onLogout={logout} onReport={() => {
          setReportData({ scores, dimScores, levels, username: user?.username, ts: Date.now(), companyProfile });
          setScreen("report");
        }} />}
      {screen === "report"     && <ReportView
        scores={scores} dimScores={dimScores} levels={levels}
        reportData={reportData} historyList={historyList}
        onBack={() => setScreen(user?.role==="admin"?"admindash":"practices")}
        onLogout={logout} user={user} companyProfile={companyProfile} />}
    </div>
  );
}

function ModalDialog({ title, msg, onOk, onClose }) {
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:8888,
      display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{background:"#fff",borderRadius:12,padding:32,maxWidth:420,width:"90%",
        boxShadow:"0 20px 60px rgba(0,0,0,.3)"}}>
        <h3 style={{margin:"0 0 12px",color:TC}}>{title}</h3>
        <p style={{margin:"0 0 24px",color:"#475569",lineHeight:1.6}}>{msg}</p>
        <div style={{display:"flex",gap:12,justifyContent:"flex-end"}}>
          <button onClick={onClose} style={{padding:"8px 20px",borderRadius:6,border:"1px solid #e2e8f0",
            background:"#f8fafc",cursor:"pointer",fontWeight:500}}>Cancel</button>
          <button onClick={()=>{onOk?.(); onClose();}} style={{padding:"8px 20px",borderRadius:6,
            border:"none",background:TCR,color:"#fff",cursor:"pointer",fontWeight:600}}>Confirm</button>
        </div>
      </div>
    </div>
  );
}

/* ─── UserLogin ─────────────────────────────────────────────────── */
function UserLogin({ onLogin }) {
  const [u, setU] = useState(""); const [p, setP] = useState("");
  const [err, setErr] = useState(""); const [loading, setLoading] = useState(false);
  async function handle() {
    if (!u.trim() || !p.trim()) { setErr("Enter username and password."); return; }
    setLoading(true); setErr("");
    const ok = await onLogin(u, p);
    setLoading(false);
    if (!ok) setErr("Invalid username or password.");
  }
  return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",
      background:`linear-gradient(135deg,${TC} 0%,#001f5c 100%)`}}>
      <div style={{background:"#fff",borderRadius:16,padding:40,width:360,boxShadow:"0 20px 60px rgba(0,0,0,.4)"}}>
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{width:60,height:60,borderRadius:14,background:TC,display:"flex",
            alignItems:"center",justifyContent:"center",margin:"0 auto 16px",
            fontSize:26}}>🏢</div>
          <div style={{fontSize:20,fontWeight:700,color:TC}}>{TOOL_NAME}</div>
          <div style={{fontSize:12,color:"#94a3b8",marginTop:4}}>{ORG_BRAND} · {VERSION}</div>
        </div>
        {err && <div style={{background:"#fef2f2",border:"1px solid #fecaca",color:"#dc2626",
          padding:"10px 14px",borderRadius:8,marginBottom:16,fontSize:13}}>{err}</div>}
        <div style={{marginBottom:16}}>
          <label style={{fontSize:12,fontWeight:600,color:"#475569",display:"block",marginBottom:6}}>USERNAME</label>
          <input value={u} onChange={e=>setU(e.target.value)} placeholder="Enter username"
            onKeyDown={e=>e.key==="Enter"&&handle()} disabled={loading}
            style={{width:"100%",padding:"10px 14px",borderRadius:8,border:"1px solid #e2e8f0",
              fontSize:14,boxSizing:"border-box",outline:"none"}} />
        </div>
        <div style={{marginBottom:24}}>
          <label style={{fontSize:12,fontWeight:600,color:"#475569",display:"block",marginBottom:6}}>PASSWORD</label>
          <input type="password" value={p} onChange={e=>setP(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&handle()} placeholder="Enter password" disabled={loading}
            style={{width:"100%",padding:"10px 14px",borderRadius:8,border:"1px solid #e2e8f0",
              fontSize:14,boxSizing:"border-box",outline:"none"}} />
        </div>
        <button onClick={handle} disabled={loading}
          style={{width:"100%",padding:"12px",borderRadius:8,border:"none",
            background:loading?"#94a3b8":TC,color:"#fff",fontSize:15,fontWeight:600,
            cursor:loading?"not-allowed":"pointer"}}>
          {loading ? "Signing in…" : "Sign In"}
        </button>
        <p style={{textAlign:"center",fontSize:11,color:"#94a3b8",marginTop:20,marginBottom:0}}>
          ITIL 4 Process Maturity Assessment · {ORG_BRAND}
        </p>
      </div>
    </div>
  );
}

/* ─── AdminLogin ────────────────────────────────────────────────── */
function AdminLogin({ onLogin, onBack }) {
  const [u,setU]=useState(""); const [p,setP]=useState("");
  const [err,setErr]=useState(""); const [loading,setLoading]=useState(false);
  async function handle() {
    if (!u.trim()||!p.trim()) { setErr("Enter credentials."); return; }
    setLoading(true); setErr("");
    const ok = await onLogin(u, p);
    setLoading(false);
    if (!ok) setErr("Invalid admin credentials");
  }
  return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",
      background:`linear-gradient(135deg,#1e1b4b 0%,#312e81 100%)`}}>
      <div style={{background:"#fff",borderRadius:16,padding:40,width:360,boxShadow:"0 20px 60px rgba(0,0,0,.4)"}}>
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{fontSize:30,marginBottom:8}}>🔐</div>
          <div style={{fontSize:18,fontWeight:700,color:"#1e1b4b"}}>Admin Portal</div>
          <div style={{fontSize:12,color:"#94a3b8"}}>{TOOL_NAME}</div>
        </div>
        {err && <div style={{background:"#fef2f2",border:"1px solid #fecaca",color:"#dc2626",
          padding:"10px 14px",borderRadius:8,marginBottom:16,fontSize:13}}>{err}</div>}
        <div style={{marginBottom:16}}>
          <label style={{fontSize:12,fontWeight:600,color:"#475569",display:"block",marginBottom:6}}>ADMIN USERNAME</label>
          <input value={u} onChange={e=>setU(e.target.value)} disabled={loading}
            onKeyDown={e=>e.key==="Enter"&&handle()}
            style={{width:"100%",padding:"10px 14px",borderRadius:8,border:"1px solid #e2e8f0",
              fontSize:14,boxSizing:"border-box"}} />
        </div>
        <div style={{marginBottom:24}}>
          <label style={{fontSize:12,fontWeight:600,color:"#475569",display:"block",marginBottom:6}}>PASSWORD</label>
          <input type="password" value={p} onChange={e=>setP(e.target.value)} disabled={loading}
            onKeyDown={e=>e.key==="Enter"&&handle()}
            style={{width:"100%",padding:"10px 14px",borderRadius:8,border:"1px solid #e2e8f0",
              fontSize:14,boxSizing:"border-box"}} />
        </div>
        <button onClick={handle} disabled={loading}
          style={{width:"100%",padding:"12px",borderRadius:8,border:"none",
            background:loading?"#94a3b8":"#1e1b4b",color:"#fff",fontSize:15,fontWeight:600,
            cursor:loading?"not-allowed":"pointer",marginBottom:12}}>
          {loading ? "Signing in…" : "Admin Sign In"}
        </button>
        <button onClick={onBack} disabled={loading}
          style={{width:"100%",padding:"10px",borderRadius:8,
            border:"1px solid #e2e8f0",background:"transparent",cursor:"pointer",fontSize:14,color:"#64748b"}}>
          ← Back
        </button>
      </div>
    </div>
  );
}

/* ─── AdminDashboard ─────────────────────────────────────────────── */
function AdminDashboard({ onBack, showToast }) {
  const [tab,      setTab]      = useState("users");
  const [users,    setUsers]    = useState(() => ls.get(USERS_KEY, {}));
  const [newU,     setNewU]     = useState("");
  const [newP,     setNewP]     = useState("");
  const [newN,     setNewN]     = useState("");
  const [saving,   setSaving]   = useState(false);   // create user busy
  const [deleting, setDeleting] = useState(null);    // username being deleted
  const [viewUser, setViewUser] = useState(null);    // filter for data/reports tab
  // Cloud reports state
  const [cloudReports,     setCloudReports]     = useState([]);
  const [cloudLoading,     setCloudLoading]     = useState(false);
  const [cloudErr,         setCloudErr]         = useState("");
  const [deletingReport,   setDeletingReport]   = useState(null);
  const [savingPdfFor,     setSavingPdfFor]     = useState(null); // username being cloud-saved

  // Reload users — try remote first, fall back to localStorage
  async function reloadUsers() {
    if (IS_VERCEL) {
      const { ok, data } = await api.call("GET", "/api/users");
      if (ok && data && typeof data === "object") {
        // Merge with local so we have full records (remote strips passwords)
        const local = ls.get(USERS_KEY, {});
        const merged = {};
        for (const [k, v] of Object.entries(data)) {
          merged[k] = { ...local[k], ...v };
        }
        setUsers(merged);
        return;
      }
    }
    setUsers(ls.get(USERS_KEY, {}));
  }
  useEffect(() => { reloadUsers(); }, []);

  // Load cloud reports when tab is opened
  useEffect(() => {
    if (tab !== "reports") return;
    loadCloudReports();
  }, [tab, viewUser]);

  async function loadCloudReports() {
    if (!IS_VERCEL) { setCloudErr("Cloud reports require a Vercel deployment."); return; }
    setCloudLoading(true); setCloudErr("");
    const path = viewUser
      ? `/api/reports?username=${encodeURIComponent(viewUser)}`
      : "/api/reports";
    const { ok, data } = await api.call("GET", path);
    setCloudLoading(false);
    if (ok && Array.isArray(data)) { setCloudReports(data); }
    else { setCloudErr("Could not load cloud reports. Check Vercel Blob is linked."); }
  }

  async function addUser() {
    if (!newU.trim() || !newP.trim()) { showToast("Username and password required","error"); return; }
    setSaving(true);
    const username = newU.trim();

    // ── Remote first ──
    if (IS_VERCEL) {
      const { ok, status, data } = await api.call("POST", "/api/users",
        { username, password: newP, name: newN || username, role: "user" });
      if (!ok) {
        setSaving(false);
        showToast(data?.error || `Failed to create user (HTTP ${status})`, "error");
        return;
      }
    }

    // ── Always mirror to localStorage (offline access + session restore) ──
    const updated = {
      ...ls.get(USERS_KEY, {}),
      [username]: { password: newP, name: newN || username, role: "user" },
    };
    ls.set(USERS_KEY, updated);

    setSaving(false);
    setNewU(""); setNewP(""); setNewN("");
    await reloadUsers();
    showToast(`User '${username}' created${IS_VERCEL ? " (remote + local)" : " (local)"}`, "success");
  }

  async function deleteUser(username) {
    if (username === "Admin") { showToast("Cannot delete Admin", "error"); return; }
    setDeleting(username);

    // ── Remote first ──
    if (IS_VERCEL) {
      const { ok, data } = await api.call("DELETE", `/api/users?username=${encodeURIComponent(username)}`);
      if (!ok) {
        setDeleting(null);
        showToast(data?.error || "Failed to delete user remotely", "error");
        return;
      }
    }

    // ── Mirror locally ──
    const updated = { ...ls.get(USERS_KEY, {}) };
    delete updated[username];
    ls.set(USERS_KEY, updated);

    setDeleting(null);
    await reloadUsers();
    showToast(`User '${username}' deleted`, "success");
  }

  async function saveReportToCloud(h, cp) {
    if (!IS_VERCEL) { showToast("Cloud save requires a Vercel deployment", "error"); return; }
    setSavingPdfFor(h.username);
    const html = generatePDFHTML({
      scores:        h.scores    || {},
      dimScores:     h.dimScores || {},
      levels:        h.levels    || {},
      username:      h.username,
      ts:            h.ts,
      companyProfile: cp,
    });
    const { ok, data } = await api.call("POST", "/api/reports", {
      htmlContent:  html,
      username:     h.username,
      companyName:  cp?.companyName || h.username,
      timestamp:    h.ts,
    });
    setSavingPdfFor(null);
    if (ok) {
      showToast("Report saved to cloud ✅", "success");
    } else {
      showToast(data?.error || "Cloud save failed", "error");
    }
  }

  async function deleteCloudReport(pathname) {
    setDeletingReport(pathname);
    const { ok, data } = await api.call("DELETE", `/api/reports?pathname=${encodeURIComponent(pathname)}`);
    setDeletingReport(null);
    if (ok) {
      showToast("Report deleted", "success");
      setCloudReports(prev => prev.filter(r => r.pathname !== pathname));
    } else {
      showToast(data?.error || "Delete failed", "error");
    }
  }

  const tabStyle = active => ({
    padding:"8px 20px", borderRadius:8, border:"none", cursor:"pointer", fontWeight:600, fontSize:13,
    background: active ? TC : "transparent",
    color:      active ? "#fff" : "#64748b",
  });

  const inputStyle = {
    flex:1, minWidth:120, padding:"10px 14px", borderRadius:8,
    border:"1px solid #e2e8f0", fontSize:14,
  };

  return (
    <div style={{minHeight:"100vh", background:"#f0f4f8"}}>
      {/* Header */}
      <div style={{background:TC, padding:"16px 24px", display:"flex", alignItems:"center", gap:16}}>
        <div style={{width:36, height:36, borderRadius:8, background:"rgba(255,255,255,.15)",
          display:"flex", alignItems:"center", justifyContent:"center", fontSize:18}}>⚙️</div>
        <div>
          <div style={{color:"#fff", fontWeight:700, fontSize:16}}>Admin Dashboard</div>
          <div style={{color:"rgba(255,255,255,.6)", fontSize:12}}>
            {TOOL_NAME} · {ORG_BRAND}
            {IS_VERCEL &&
              <span style={{marginLeft:8, background:"rgba(0,169,79,.3)", borderRadius:10,
                padding:"2px 8px", fontSize:10, fontWeight:700}}>☁️ Cloud</span>}
          </div>
        </div>
        <button onClick={onBack} style={{marginLeft:"auto", padding:"8px 16px", borderRadius:8,
          border:"1px solid rgba(255,255,255,.3)", background:"transparent", color:"#fff",
          cursor:"pointer", fontSize:13}}>← Back</button>
      </div>

      <div style={{maxWidth:960, margin:"24px auto", padding:"0 16px"}}>
        {/* Tab bar */}
        <div style={{background:"#fff", borderRadius:12, padding:6,
          display:"inline-flex", gap:4, marginBottom:24}}>
          <button style={tabStyle(tab==="users")}   onClick={()=>setTab("users")}>
            👥 Users
          </button>
          <button style={tabStyle(tab==="data")}    onClick={()=>setTab("data")}>
            📋 Assessments
          </button>
          <button style={tabStyle(tab==="reports")} onClick={()=>setTab("reports")}>
            ☁️ Cloud Reports
          </button>
        </div>

        {/* ══════════ USERS TAB ══════════ */}
        {tab === "users" && (
          <div>
            {/* Create user */}
            <div style={{background:"#fff", borderRadius:12, padding:24, marginBottom:20,
              boxShadow:"0 1px 4px rgba(0,0,0,.08)"}}>
              <h3 style={{margin:"0 0 8px", color:TC, fontSize:16}}>Create New User</h3>
              <p style={{margin:"0 0 16px", fontSize:13, color:"#64748b"}}>
                {IS_VERCEL
                  ? "User is saved to Vercel KV (cloud) and mirrored locally."
                  : "⚠️ Running locally — user saved to localStorage only. Deploy to Vercel for cloud storage."}
              </p>
              <div style={{display:"flex", gap:12, flexWrap:"wrap"}}>
                <input value={newU} onChange={e=>setNewU(e.target.value)}
                  placeholder="Username *" style={inputStyle} />
                <input value={newN} onChange={e=>setNewN(e.target.value)}
                  placeholder="Display Name" style={inputStyle} />
                <input type="password" value={newP} onChange={e=>setNewP(e.target.value)}
                  placeholder="Password *" style={inputStyle} />
                <button onClick={addUser} disabled={saving}
                  style={{padding:"10px 20px", borderRadius:8, border:"none",
                    background:saving?"#94a3b8":TCG, color:"#fff",
                    fontWeight:600, cursor:saving?"not-allowed":"pointer", whiteSpace:"nowrap"}}>
                  {saving ? "Creating…" : IS_VERCEL ? "☁️ Add User" : "+ Add User"}
                </button>
              </div>
            </div>

            {/* User list */}
            <div style={{background:"#fff", borderRadius:12, padding:24,
              boxShadow:"0 1px 4px rgba(0,0,0,.08)"}}>
              <div style={{display:"flex", justifyContent:"space-between", alignItems:"center",
                marginBottom:16}}>
                <h3 style={{margin:0, color:TC, fontSize:16}}>
                  All Users ({Object.keys(users).length})
                </h3>
                <button onClick={reloadUsers}
                  style={{padding:"6px 14px", borderRadius:8, border:"1px solid #e2e8f0",
                    background:"#f8fafc", cursor:"pointer", fontSize:12, color:"#64748b"}}>
                  ↻ Refresh
                </button>
              </div>
              {Object.entries(users).map(([un, ud]) => {
                const isSubmitted = ls.get(`${SUBMIT_KEY}_${un}`);
                const profile     = ls.get(`${PROFILE_KEY}_${un}`);
                const isDeleting  = deleting === un;
                return (
                  <div key={un} style={{display:"flex", alignItems:"center", padding:"12px 0",
                    borderBottom:"1px solid #f1f5f9", flexWrap:"wrap", gap:8}}>
                    <div style={{width:36, height:36, borderRadius:"50%",
                      background:un==="Admin"?"#1e1b4b":TC, color:"#fff",
                      display:"flex", alignItems:"center", justifyContent:"center",
                      fontWeight:700, fontSize:14, marginRight:12, flexShrink:0}}>
                      {(ud.name||un)[0].toUpperCase()}
                    </div>
                    <div style={{flex:1, minWidth:160}}>
                      <div style={{fontWeight:600, color:"#1e293b", fontSize:14}}>
                        {ud.name || un}
                      </div>
                      <div style={{fontSize:12, color:"#94a3b8"}}>
                        @{un} · {ud.role}
                        {profile && ` · ${profile.companyName}`}
                        {isSubmitted &&
                          <span style={{marginLeft:6, color:"#15803d", fontWeight:700}}>
                            ✅ Submitted
                          </span>}
                      </div>
                    </div>
                    {un !== "Admin" && (
                      <>
                        <button onClick={()=>{ setViewUser(un); setTab("data"); }}
                          style={{padding:"6px 12px", borderRadius:6,
                            border:"1px solid #e2e8f0", background:"transparent",
                            cursor:"pointer", fontSize:12, color:"#475569"}}>
                          📋 View
                        </button>
                        <button onClick={()=>{ setViewUser(un); setTab("reports"); }}
                          style={{padding:"6px 12px", borderRadius:6,
                            border:"1px solid #e2e8f0", background:"transparent",
                            cursor:"pointer", fontSize:12, color:"#475569"}}>
                          ☁️ Reports
                        </button>
                        <button onClick={()=>deleteUser(un)} disabled={isDeleting}
                          style={{padding:"6px 12px", borderRadius:6,
                            border:"none", background:"#fef2f2", color:TCR,
                            cursor:isDeleting?"not-allowed":"pointer",
                            fontSize:12, fontWeight:600}}>
                          {isDeleting ? "…" : "Delete"}
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ══════════ ASSESSMENTS TAB ══════════ */}
        {tab === "data" && (
          <div>
            {/* User filter pills */}
            <div style={{background:"#fff", borderRadius:12, padding:16, marginBottom:16,
              boxShadow:"0 1px 4px rgba(0,0,0,.06)"}}>
              <div style={{fontSize:13, fontWeight:600, color:"#475569", marginBottom:10}}>
                Filter by user
              </div>
              <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
                <button onClick={()=>setViewUser(null)}
                  style={{padding:"7px 14px", borderRadius:8,
                    border:`1px solid ${!viewUser?TC:"#e2e8f0"}`,
                    background:!viewUser?TC:"#fff",
                    color:!viewUser?"#fff":"#475569",
                    fontWeight:600, fontSize:13, cursor:"pointer"}}>
                  All
                </button>
                {Object.keys(users)
                  .filter(u => u !== "Admin" && ls.get(`${SUBMIT_KEY}_${u}`))
                  .map(un => (
                    <button key={un} onClick={()=>setViewUser(un)}
                      style={{padding:"7px 14px", borderRadius:8,
                        border:`1px solid ${viewUser===un?TC:"#e2e8f0"}`,
                        background:viewUser===un?TC:"#fff",
                        color:viewUser===un?"#fff":"#475569",
                        fontWeight:600, fontSize:13, cursor:"pointer"}}>
                      {users[un]?.name || un}
                    </button>
                  ))}
              </div>
            </div>

            {/* Submission cards */}
            {(() => {
              const all      = ls.get(HISTORY_KEY, []);
              const filtered = viewUser
                ? all.filter(h => h.username === viewUser)
                : all;
              const sorted   = filtered.slice().reverse();
              if (!sorted.length) return (
                <div style={{background:"#fff", borderRadius:12, padding:60, textAlign:"center",
                  boxShadow:"0 1px 4px rgba(0,0,0,.06)"}}>
                  <div style={{fontSize:40, marginBottom:12}}>📭</div>
                  <div style={{color:"#94a3b8"}}>No submitted assessments yet.</div>
                </div>
              );
              return sorted.map((h, i) => {
                const submissionData = ls.get(`${SUBMISSION_KEY}_${h.username}`) || h;
                const cp = submissionData.companyProfile || h.companyProfile;
                const isSavingThis = savingPdfFor === h.username;
                return (
                  <div key={i} style={{background:"#fff", borderRadius:12, padding:24,
                    marginBottom:16, boxShadow:"0 1px 4px rgba(0,0,0,.06)"}}>
                    <div style={{display:"flex", alignItems:"flex-start",
                      gap:16, flexWrap:"wrap"}}>
                      <div style={{flex:1, minWidth:200}}>
                        {/* User + timestamp row */}
                        <div style={{display:"flex", alignItems:"center",
                          gap:10, marginBottom:8}}>
                          <div style={{width:32, height:32, borderRadius:"50%",
                            background:TC, color:"#fff",
                            display:"flex", alignItems:"center", justifyContent:"center",
                            fontWeight:700, fontSize:13}}>
                            {(users[h.username]?.name||h.username||"?")[0].toUpperCase()}
                          </div>
                          <div>
                            <div style={{fontWeight:700, color:"#1e293b", fontSize:14}}>
                              {users[h.username]?.name || h.username}
                            </div>
                            <div style={{fontSize:11, color:"#94a3b8"}}>
                              {new Date(h.ts).toLocaleString("en-GB")}
                            </div>
                          </div>
                          <div style={{marginLeft:"auto", padding:"4px 10px",
                            borderRadius:20, background:"#dcfce7",
                            color:"#15803d", fontSize:11, fontWeight:700}}>
                            ✅ Submitted
                          </div>
                        </div>
                        {/* Company row */}
                        {cp && (
                          <div style={{background:"#f8fafc", borderRadius:8,
                            padding:"10px 14px", fontSize:12,
                            color:"#475569", marginBottom:10}}>
                            <strong>{cp.companyName}</strong>
                            {" · "}{cp.industry}
                            {" · "}{cp.employeeStrength} employees
                            {cp.itsmTools?.length > 0 &&
                              ` · ${cp.itsmTools.join(", ")}`}
                          </div>
                        )}
                        {/* Score chips */}
                        <div style={{display:"flex", gap:12, flexWrap:"wrap"}}>
                          <div style={{textAlign:"center"}}>
                            <div style={{fontSize:22, fontWeight:800,
                              color:maturityColor(h.avgScore)}}>
                              {h.avgScore?.toFixed(2) || "—"}
                            </div>
                            <div style={{fontSize:10, color:"#94a3b8"}}>Overall</div>
                          </div>
                          {DIM_KEYS.map(dk => {
                            const vals = Object.values(h.dimScores||{})
                              .map(d => d[dk]).filter(v => v != null);
                            const avg = vals.length
                              ? vals.reduce((a,b)=>a+b,0)/vals.length : null;
                            return avg != null ? (
                              <div key={dk} style={{textAlign:"center"}}>
                                <div style={{fontSize:16, fontWeight:700,
                                  color:DIMS[dk].color}}>
                                  {avg.toFixed(1)}
                                </div>
                                <div style={{fontSize:10, color:"#94a3b8"}}>{dk}</div>
                              </div>
                            ) : null;
                          })}
                          <div style={{textAlign:"center"}}>
                            <div style={{fontSize:16, fontWeight:700,
                              color:"#64748b"}}>
                              {h.completedCount}
                            </div>
                            <div style={{fontSize:10, color:"#94a3b8"}}>practices</div>
                          </div>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div style={{display:"flex", flexDirection:"column",
                        gap:8, alignSelf:"center", flexShrink:0}}>
                        {/* Print locally */}
                        <button
                          onClick={()=>printReport({
                            scores:        h.scores    || {},
                            dimScores:     h.dimScores || {},
                            levels:        h.levels    || {},
                            username:      h.username,
                            ts:            h.ts,
                            companyProfile: cp,
                          })}
                          style={{padding:"9px 18px", borderRadius:8, border:"none",
                            background:TC, color:"#fff", fontWeight:700,
                            cursor:"pointer", fontSize:13}}>
                          🖨️ Print PDF
                        </button>
                        {/* Save to cloud */}
                        {IS_VERCEL && (
                          <button
                            onClick={()=>saveReportToCloud(h, cp)}
                            disabled={isSavingThis}
                            style={{padding:"9px 18px", borderRadius:8,
                              border:`1px solid ${TCL}`,
                              background:isSavingThis?"#f1f5f9":"#fff",
                              color:isSavingThis?"#94a3b8":TCL,
                              fontWeight:700, cursor:isSavingThis?"not-allowed":"pointer",
                              fontSize:13}}>
                            {isSavingThis ? "Saving…" : "☁️ Save to Cloud"}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        )}

        {/* ══════════ CLOUD REPORTS TAB ══════════ */}
        {tab === "reports" && (
          <div>
            {/* Filter + refresh row */}
            <div style={{background:"#fff", borderRadius:12, padding:16,
              marginBottom:16, boxShadow:"0 1px 4px rgba(0,0,0,.06)"}}>
              <div style={{display:"flex", justifyContent:"space-between",
                alignItems:"center", flexWrap:"wrap", gap:12}}>
                <div>
                  <div style={{fontSize:14, fontWeight:700, color:TC, marginBottom:4}}>
                    ☁️ Cloud-Saved Reports (Vercel Blob)
                  </div>
                  <div style={{fontSize:12, color:"#64748b"}}>
                    {IS_VERCEL
                      ? "Reports are stored as HTML files in Vercel Blob and accessible via permanent URLs."
                      : "⚠️ Cloud reports are only available on Vercel deployments."}
                  </div>
                </div>
                <div style={{display:"flex", gap:8}}>
                  <button onClick={()=>setViewUser(null)}
                    style={{padding:"7px 14px", borderRadius:8,
                      border:`1px solid ${!viewUser?TC:"#e2e8f0"}`,
                      background:!viewUser?TC:"#fff",
                      color:!viewUser?"#fff":"#475569",
                      fontWeight:600, fontSize:13, cursor:"pointer"}}>
                    All
                  </button>
                  {Object.keys(users).filter(u=>u!=="Admin").map(un=>(
                    <button key={un} onClick={()=>setViewUser(un)}
                      style={{padding:"7px 14px", borderRadius:8,
                        border:`1px solid ${viewUser===un?TC:"#e2e8f0"}`,
                        background:viewUser===un?TC:"#fff",
                        color:viewUser===un?"#fff":"#475569",
                        fontWeight:600, fontSize:13, cursor:"pointer"}}>
                      {users[un]?.name||un}
                    </button>
                  ))}
                  <button onClick={loadCloudReports} disabled={cloudLoading}
                    style={{padding:"7px 14px", borderRadius:8,
                      border:"1px solid #e2e8f0", background:"#f8fafc",
                      cursor:"pointer", fontSize:13, color:"#64748b"}}>
                    {cloudLoading ? "Loading…" : "↻ Refresh"}
                  </button>
                </div>
              </div>
            </div>

            {/* Error */}
            {cloudErr && (
              <div style={{background:"#fef2f2", border:"1px solid #fecaca",
                borderRadius:10, padding:"14px 18px", marginBottom:16,
                color:"#dc2626", fontSize:13}}>
                ⚠️ {cloudErr}
              </div>
            )}

            {/* Loading skeleton */}
            {cloudLoading && !cloudErr && (
              <div style={{background:"#fff", borderRadius:12, padding:40,
                textAlign:"center", boxShadow:"0 1px 4px rgba(0,0,0,.06)"}}>
                <div style={{fontSize:28, marginBottom:12}}>☁️</div>
                <div style={{color:"#94a3b8", fontSize:14}}>Loading reports from Vercel Blob…</div>
              </div>
            )}

            {/* Report cards */}
            {!cloudLoading && !cloudErr && cloudReports.length === 0 && (
              <div style={{background:"#fff", borderRadius:12, padding:60,
                textAlign:"center", boxShadow:"0 1px 4px rgba(0,0,0,.06)"}}>
                <div style={{fontSize:40, marginBottom:12}}>📭</div>
                <div style={{color:"#94a3b8"}}>
                  No cloud reports yet. Use "☁️ Save to Cloud" in the Assessments tab.
                </div>
              </div>
            )}

            {!cloudLoading && cloudReports.map((r, i) => (
              <div key={i} style={{background:"#fff", borderRadius:12, padding:20,
                marginBottom:12, boxShadow:"0 1px 4px rgba(0,0,0,.06)",
                display:"flex", alignItems:"center", gap:16, flexWrap:"wrap"}}>
                <div style={{width:40, height:40, borderRadius:10,
                  background:"#f1f5f9", display:"flex", alignItems:"center",
                  justifyContent:"center", fontSize:20, flexShrink:0}}>
                  📄
                </div>
                <div style={{flex:1, minWidth:180}}>
                  <div style={{fontWeight:700, color:"#1e293b", fontSize:14}}>
                    {r.filename?.replace(".html","") || r.pathname}
                  </div>
                  <div style={{fontSize:12, color:"#94a3b8", marginTop:2}}>
                    User: <strong>{r.username}</strong>
                    {" · "}
                    {new Date(r.savedAt).toLocaleString("en-GB")}
                    {" · "}
                    {r.size ? `${Math.round(r.size/1024)} KB` : ""}
                  </div>
                </div>
                <div style={{display:"flex", gap:8, flexShrink:0}}>
                  <a href={r.url} target="_blank" rel="noreferrer"
                    style={{padding:"8px 16px", borderRadius:8,
                      background:TC, color:"#fff", fontWeight:700,
                      fontSize:13, textDecoration:"none", display:"inline-block"}}>
                    🔗 Open
                  </a>
                  <button
                    onClick={()=>navigator.clipboard?.writeText(r.url).then(()=>
                      showToast("URL copied!", "success"))}
                    style={{padding:"8px 14px", borderRadius:8,
                      border:"1px solid #e2e8f0", background:"#fff",
                      cursor:"pointer", fontSize:13, color:"#475569"}}>
                    📋 Copy URL
                  </button>
                  <button
                    onClick={()=>deleteCloudReport(r.pathname)}
                    disabled={deletingReport === r.pathname}
                    style={{padding:"8px 14px", borderRadius:8, border:"none",
                      background:"#fef2f2", color:TCR,
                      cursor:deletingReport===r.pathname?"not-allowed":"pointer",
                      fontSize:13, fontWeight:600}}>
                    {deletingReport===r.pathname ? "…" : "🗑️"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Welcome ───────────────────────────────────────────────────── */
function Welcome({ user, completedCount, totalCount, onStart, onLogout, onAdmin, onReport, scores, submitted }) {
  const avgScore = completedCount > 0
    ? Object.values(scores).reduce((a,b)=>a+b,0) / Object.values(scores).length : 0;

  return (
    <div style={{minHeight:"100vh",background:`linear-gradient(135deg,${TC} 0%,#001f5c 100%)`,
      display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{textAlign:"center",marginBottom:40}}>
        <div style={{fontSize:48,marginBottom:16}}>📊</div>
        <h1 style={{color:"#fff",fontSize:28,fontWeight:700,margin:"0 0 8px"}}>{TOOL_NAME}</h1>
        <p style={{color:"rgba(255,255,255,.7)",margin:0,fontSize:15}}>{ORG_BRAND} · {VERSION}</p>
      </div>
      <div style={{background:"rgba(255,255,255,.12)",backdropFilter:"blur(10px)",borderRadius:20,
        padding:32,width:"100%",maxWidth:480,border:"1px solid rgba(255,255,255,.2)"}}>
        <div style={{color:"rgba(255,255,255,.8)",fontSize:13,marginBottom:4}}>Welcome back,</div>
        <div style={{color:"#fff",fontSize:20,fontWeight:700,marginBottom:24}}>{user?.name || user?.username}</div>
        {completedCount > 0 && (
          <div style={{background:"rgba(255,255,255,.1)",borderRadius:12,padding:"16px 20px",marginBottom:24,
            display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{color:"rgba(255,255,255,.6)",fontSize:12}}>Practices Assessed</div>
              <div style={{color:"#fff",fontSize:22,fontWeight:700}}>{completedCount} / {totalCount}</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{color:"rgba(255,255,255,.6)",fontSize:12}}>Average Score</div>
              <div style={{color:maturityColor(avgScore),fontSize:22,fontWeight:700}}>{avgScore.toFixed(1)}</div>
            </div>
          </div>
        )}
        {submitted ? (
          <div style={{background:"rgba(0,169,79,.2)",border:"1px solid rgba(0,169,79,.4)",
            borderRadius:10,padding:"12px 16px",marginBottom:16,textAlign:"center"}}>
            <div style={{color:"#4ade80",fontWeight:700,fontSize:14}}>✅ Assessment Submitted</div>
            <div style={{color:"rgba(255,255,255,.6)",fontSize:12,marginTop:4}}>Your responses are locked</div>
          </div>
        ) : (
          <button onClick={onStart} style={{width:"100%",padding:"14px",borderRadius:10,border:"none",
            background:"#fff",color:TC,fontSize:15,fontWeight:700,cursor:"pointer",marginBottom:12}}>
            {completedCount>0 ? "Continue Assessment →" : "Start Assessment →"}
          </button>
        )}
        {completedCount>0 && (
          <button onClick={onReport} style={{width:"100%",padding:"12px",borderRadius:10,
            border:"1px solid rgba(255,255,255,.4)",background:"transparent",color:"#fff",
            fontSize:14,fontWeight:600,cursor:"pointer",marginBottom:12}}>
            View Report
          </button>
        )}
        <div style={{display:"flex",gap:8}}>
          {user?.role==="admin" && (
            <button onClick={onAdmin} style={{flex:1,padding:"10px",borderRadius:8,
              border:"1px solid rgba(255,255,255,.3)",background:"rgba(255,255,255,.1)",
              color:"rgba(255,255,255,.8)",cursor:"pointer",fontSize:13}}>⚙️ Admin</button>
          )}
          <button onClick={onLogout} style={{flex:1,padding:"10px",borderRadius:8,
            border:"1px solid rgba(255,255,255,.3)",background:"transparent",
            color:"rgba(255,255,255,.7)",cursor:"pointer",fontSize:13}}>Sign Out</button>
        </div>
      </div>
    </div>
  );
}

/* ─── PracticeSelect ─────────────────────────────────────────────── */
function PracticeSelect({ scores, dimScores, onSelect, onBack, user, onLogout, onReport,
  selectedPractices, submitted, onFinalSubmit }) {
  const [filter, setFilter] = useState("All");

  // Only show practices the user chose
  const activePractices = PRACTICES.filter(p => selectedPractices.includes(p.id));
  const completedIds    = activePractices.filter(p => scores[p.id] != null).map(p => p.id);
  const completedCount  = completedIds.length;
  const avgScore        = completedCount > 0
    ? completedIds.reduce((s,id)=>s+scores[id],0) / completedCount : 0;
  const allDone         = completedCount === activePractices.length && activePractices.length > 0;

  const groupOptions = ["All", ...GROUPS];
  const visibleGroup = filter === "All" ? activePractices : activePractices.filter(p=>p.group===filter);

  return (
    <div style={{minHeight:"100vh",background:"#f0f4f8"}}>
      {/* Header */}
      <div style={{background:TC,padding:"16px 24px",display:"flex",alignItems:"center",gap:12,
        position:"sticky",top:0,zIndex:100}}>
        <button onClick={onBack} style={{background:"rgba(255,255,255,.15)",border:"none",
          color:"#fff",borderRadius:8,padding:"6px 12px",cursor:"pointer",fontSize:13}}>← Home</button>
        <div style={{flex:1}}>
          <div style={{color:"#fff",fontWeight:700,fontSize:15}}>{TOOL_NAME}</div>
          <div style={{color:"rgba(255,255,255,.6)",fontSize:11}}>
            {completedCount}/{activePractices.length} practices · Avg {avgScore>0?avgScore.toFixed(1):"—"}
            {submitted && " · 🔒 Submitted"}
          </div>
        </div>
        {completedCount>0 && (
          <button onClick={onReport} style={{padding:"7px 14px",borderRadius:8,border:"1px solid rgba(255,255,255,.3)",
            background:"transparent",color:"#fff",cursor:"pointer",fontSize:13,fontWeight:600}}>📄 Report</button>
        )}
        <button onClick={onLogout} style={{padding:"7px 12px",borderRadius:8,border:"1px solid rgba(255,255,255,.25)",
          background:"transparent",color:"rgba(255,255,255,.7)",cursor:"pointer",fontSize:12}}>Sign Out</button>
      </div>

      <div style={{maxWidth:1100,margin:"24px auto",padding:"0 16px"}}>
        {/* Submitted banner */}
        {submitted && (
          <div style={{background:"#dcfce7",border:"1px solid #86efac",borderRadius:12,
            padding:"16px 20px",marginBottom:20,display:"flex",alignItems:"center",gap:12}}>
            <div style={{fontSize:24}}>🔒</div>
            <div>
              <div style={{fontWeight:700,color:"#15803d",fontSize:15}}>Assessment Submitted & Locked</div>
              <div style={{fontSize:13,color:"#166534"}}>Your answers are read-only. Contact your assessor to re-open.</div>
            </div>
          </div>
        )}

        {/* Progress bar */}
        <div style={{background:"#fff",borderRadius:12,padding:"20px 24px",marginBottom:20,
          boxShadow:"0 1px 4px rgba(0,0,0,.06)"}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
            <span style={{fontWeight:700,color:TC,fontSize:15}}>Assessment Progress</span>
            <span style={{fontSize:13,color:"#64748b"}}>{completedCount} of {activePractices.length} completed</span>
          </div>
          <div style={{background:"#f1f5f9",borderRadius:999,height:8,overflow:"hidden"}}>
            <div style={{height:"100%",background:`linear-gradient(90deg,${TCG},${TCL})`,
              width:`${activePractices.length>0?(completedCount/activePractices.length)*100:0}%`,
              transition:"width .4s ease",borderRadius:999}}/>
          </div>
          {/* Final Submit button — BUG 2 */}
          {!submitted && completedCount > 0 && (
            <div style={{marginTop:16,paddingTop:16,borderTop:"1px solid #f1f5f9",
              display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
              <div>
                <div style={{fontWeight:600,color:"#334155",fontSize:13}}>
                  {allDone ? "All selected practices complete — ready to finalise!" : `${activePractices.length - completedCount} practice(s) still pending`}
                </div>
                <div style={{fontSize:12,color:"#94a3b8",marginTop:2}}>
                  Final submission locks all answers permanently
                </div>
              </div>
              <button onClick={onFinalSubmit}
                style={{padding:"10px 24px",borderRadius:10,border:"none",fontWeight:700,fontSize:14,
                  cursor:"pointer",background:allDone?TCR:"#f97316",color:"#fff",
                  boxShadow:`0 4px 12px ${allDone?TCR+"66":"#f9731666"}`}}>
                🚀 Final Submit Assessment
              </button>
            </div>
          )}
        </div>

        {/* Group filter */}
        <div style={{display:"flex",gap:8,marginBottom:20,flexWrap:"wrap"}}>
          {groupOptions.map(g => (
            <button key={g} onClick={()=>setFilter(g)} style={{
              padding:"7px 16px",borderRadius:20,border:"1px solid",fontSize:13,cursor:"pointer",fontWeight:500,
              background: filter===g ? TC : "#fff",
              color: filter===g ? "#fff" : "#475569",
              borderColor: filter===g ? TC : "#e2e8f0",
            }}>{g}</button>
          ))}
        </div>

        {/* Practices grid */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:12}}>
          {visibleGroup.map(p => {
            const sc  = scores[p.id];
            const dim = dimScores[p.id];
            const done = sc != null;
            return (
              <div key={p.id}
                onClick={submitted ? undefined : ()=>onSelect(p.id)}
                style={{background:"#fff",borderRadius:12,padding:20,
                  cursor: submitted ? "default" : "pointer",
                  boxShadow:"0 1px 4px rgba(0,0,0,.06)",
                  border:`2px solid ${done?maturityColor(sc):"#e2e8f0"}`,
                  transition:"all .2s",position:"relative",overflow:"hidden",
                  opacity: submitted && !done ? 0.7 : 1}}
                onMouseEnter={e=>{ if(!submitted) e.currentTarget.style.transform="translateY(-2px)"; }}
                onMouseLeave={e=>e.currentTarget.style.transform="translateY(0)"}>
                {submitted && (
                  <div style={{position:"absolute",top:8,right:8,fontSize:14}}>🔒</div>
                )}
                {done && !submitted && (
                  <div style={{position:"absolute",top:0,right:0,width:0,height:0,
                    borderStyle:"solid",borderWidth:"0 40px 40px 0",
                    borderColor:`transparent ${maturityColor(sc)} transparent transparent`}}>
                    <span style={{position:"absolute",top:3,right:-35,color:"#fff",fontSize:11,fontWeight:700}}>
                      {sc.toFixed(1)}
                    </span>
                  </div>
                )}
                <div style={{fontSize:11,color:"#94a3b8",fontWeight:600,textTransform:"uppercase",
                  letterSpacing:.5,marginBottom:6}}>{p.group}</div>
                <div style={{fontWeight:700,color:done?maturityColor(sc):TC,fontSize:14,
                  marginBottom:done?10:0,lineHeight:1.4}}>{p.name}</div>
                {done && (
                  <>
                    <div style={{fontSize:12,color:"#64748b",marginBottom:8}}>{maturityLabel(sc)}</div>
                    <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                      {DIM_KEYS.map(dk => (
                        <div key={dk} style={{fontSize:10,padding:"2px 6px",borderRadius:4,
                          background:DIMS[dk].color+"22",color:DIMS[dk].color,fontWeight:600}}>
                          {dk} {dim?.[dk]?.toFixed(1)||"—"}
                        </div>
                      ))}
                    </div>
                  </>
                )}
                {!done && !submitted && (
                  <div style={{fontSize:12,color:"#94a3b8",marginTop:6}}>Click to assess →</div>
                )}
                {!done && submitted && (
                  <div style={{fontSize:12,color:"#94a3b8",marginTop:6}}>Not assessed</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ─── CompanyProfile (BUG 5) ─────────────────────────────────────── */
function CompanyProfile({ user, onSave, onLogout }) {
  const [companyName, setCompanyName] = useState("");
  const [industry,    setIndustry]    = useState("");
  const [empSize,     setEmpSize]     = useState("");
  const [tools,       setTools]       = useState([]);
  const [err,         setErr]         = useState("");

  function toggleTool(t) {
    setTools(prev => prev.includes(t) ? prev.filter(x=>x!==t) : [...prev, t]);
  }
  function handleSave() {
    if (!companyName.trim()) { setErr("Company Name is required."); return; }
    if (!industry)            { setErr("Please select an Industry."); return; }
    if (!empSize)             { setErr("Please select Employee Strength."); return; }
    onSave({ companyName: companyName.trim(), industry, employeeStrength: empSize, itsmTools: tools });
  }

  const inputStyle = {
    width:"100%",padding:"10px 14px",borderRadius:8,border:"1px solid #e2e8f0",
    fontSize:14,boxSizing:"border-box",outline:"none",
  };
  const labelStyle = { fontSize:12,fontWeight:600,color:"#475569",display:"block",marginBottom:6 };

  return (
    <div style={{minHeight:"100vh",background:`linear-gradient(135deg,${TC} 0%,#001f5c 100%)`,
      display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{background:"#fff",borderRadius:20,padding:40,width:"100%",maxWidth:560,
        boxShadow:"0 20px 60px rgba(0,0,0,.35)"}}>
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{width:60,height:60,borderRadius:14,background:TC,display:"flex",
            alignItems:"center",justifyContent:"center",margin:"0 auto 16px",fontSize:28}}>🏢</div>
          <div style={{fontSize:20,fontWeight:700,color:TC}}>Company Profile</div>
          <div style={{fontSize:13,color:"#94a3b8",marginTop:4}}>
            Tell us about your organisation · {user?.name || user?.username}
          </div>
        </div>

        {err && (
          <div style={{background:"#fef2f2",border:"1px solid #fecaca",color:"#dc2626",
            padding:"10px 14px",borderRadius:8,marginBottom:16,fontSize:13}}>{err}</div>
        )}

        <div style={{marginBottom:18}}>
          <label style={labelStyle}>COMPANY NAME <span style={{color:TCR}}>*</span></label>
          <input value={companyName} onChange={e=>{ setCompanyName(e.target.value); setErr(""); }}
            placeholder="e.g. Acme Corporation" style={inputStyle} />
        </div>

        <div style={{marginBottom:18}}>
          <label style={labelStyle}>INDUSTRY / SECTOR <span style={{color:TCR}}>*</span></label>
          <select value={industry} onChange={e=>{ setIndustry(e.target.value); setErr(""); }}
            style={{...inputStyle,color:industry?"#1e293b":"#94a3b8"}}>
            <option value="">Select industry…</option>
            {INDUSTRIES.map(i=><option key={i} value={i}>{i}</option>)}
          </select>
        </div>

        <div style={{marginBottom:18}}>
          <label style={labelStyle}>EMPLOYEE STRENGTH <span style={{color:TCR}}>*</span></label>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {EMP_SIZES.map(s => (
              <button key={s} onClick={()=>{ setEmpSize(s); setErr(""); }}
                style={{padding:"8px 18px",borderRadius:8,border:`2px solid ${empSize===s?TC:"#e2e8f0"}`,
                  background:empSize===s?TC:"#fff",color:empSize===s?"#fff":"#475569",
                  fontWeight:600,fontSize:13,cursor:"pointer",transition:"all .15s"}}>
                {s}
              </button>
            ))}
          </div>
        </div>

        <div style={{marginBottom:28}}>
          <label style={labelStyle}>ITSM TOOLS USED (select all that apply)</label>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {ITSM_TOOLS.map(t => (
              <button key={t} onClick={()=>toggleTool(t)}
                style={{padding:"7px 14px",borderRadius:8,border:`2px solid ${tools.includes(t)?TCL:"#e2e8f0"}`,
                  background:tools.includes(t)?TCL+"22":"#fff",
                  color:tools.includes(t)?TCL:"#475569",
                  fontWeight:600,fontSize:12,cursor:"pointer",transition:"all .15s"}}>
                {tools.includes(t) ? "✓ " : ""}{t}
              </button>
            ))}
          </div>
        </div>

        <button onClick={handleSave}
          style={{width:"100%",padding:"13px",borderRadius:10,border:"none",background:TC,
            color:"#fff",fontSize:15,fontWeight:700,cursor:"pointer",marginBottom:12}}>
          Continue to Practice Selection →
        </button>
        <button onClick={onLogout}
          style={{width:"100%",padding:"10px",borderRadius:8,border:"1px solid #e2e8f0",
            background:"transparent",color:"#94a3b8",cursor:"pointer",fontSize:13}}>
          Sign Out
        </button>
      </div>
    </div>
  );
}

/* ─── PracticeConfig (BUG 1) ─────────────────────────────────────── */
function PracticeConfig({ user, companyProfile, onSave, onBack, onLogout }) {
  const [selected, setSelected] = useState(PRACTICES.map(p=>p.id)); // default all
  const [filter,   setFilter]   = useState("All");
  const [err,      setErr]       = useState("");

  function toggle(id) {
    setSelected(prev => prev.includes(id) ? prev.filter(x=>x!==id) : [...prev, id]);
    setErr("");
  }
  function toggleGroup(g) {
    const ids = PRACTICES.filter(p=>p.group===g).map(p=>p.id);
    const allOn = ids.every(id=>selected.includes(id));
    setSelected(prev => allOn ? prev.filter(id=>!ids.includes(id)) : [...new Set([...prev,...ids])]);
  }
  function handleSave() {
    if (selected.length === 0) { setErr("Select at least 1 practice to continue."); return; }
    onSave(selected);
  }

  const groupOptions = ["All",...GROUPS];
  const visible = filter==="All" ? PRACTICES : PRACTICES.filter(p=>p.group===filter);

  return (
    <div style={{minHeight:"100vh",background:"#f0f4f8"}}>
      {/* Header */}
      <div style={{background:TC,padding:"16px 24px",display:"flex",alignItems:"center",gap:12,
        position:"sticky",top:0,zIndex:100}}>
        <button onClick={onBack} style={{background:"rgba(255,255,255,.15)",border:"none",
          color:"#fff",borderRadius:8,padding:"6px 12px",cursor:"pointer",fontSize:13}}>← Back</button>
        <div style={{flex:1}}>
          <div style={{color:"#fff",fontWeight:700,fontSize:16}}>Select Practices to Assess</div>
          <div style={{color:"rgba(255,255,255,.6)",fontSize:11}}>
            {companyProfile?.companyName} · {selected.length} of {PRACTICES.length} selected
          </div>
        </div>
        <button onClick={onLogout} style={{padding:"7px 12px",borderRadius:8,border:"1px solid rgba(255,255,255,.25)",
          background:"transparent",color:"rgba(255,255,255,.7)",cursor:"pointer",fontSize:12}}>Sign Out</button>
      </div>

      <div style={{maxWidth:1100,margin:"24px auto",padding:"0 16px"}}>
        {/* Selection summary card */}
        <div style={{background:"#fff",borderRadius:12,padding:"20px 24px",marginBottom:20,
          boxShadow:"0 1px 4px rgba(0,0,0,.06)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
            <div>
              <div style={{fontWeight:700,color:TC,fontSize:15,marginBottom:4}}>
                Choose which ITIL 4 practices to include in your assessment
              </div>
              <div style={{fontSize:13,color:"#64748b"}}>
                You must select at least 1 practice. You can filter by group below.
              </div>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setSelected(PRACTICES.map(p=>p.id))}
                style={{padding:"8px 16px",borderRadius:8,border:`1px solid ${TCL}`,
                  background:TCL+"11",color:TCL,fontWeight:600,cursor:"pointer",fontSize:13}}>
                Select All
              </button>
              <button onClick={()=>setSelected([])}
                style={{padding:"8px 16px",borderRadius:8,border:"1px solid #e2e8f0",
                  background:"#f8fafc",color:"#64748b",fontWeight:600,cursor:"pointer",fontSize:13}}>
                Clear All
              </button>
            </div>
          </div>
          {err && (
            <div style={{background:"#fef2f2",border:"1px solid #fecaca",color:"#dc2626",
              padding:"10px 14px",borderRadius:8,marginTop:16,fontSize:13}}>{err}</div>
          )}
        </div>

        {/* Group filter tabs */}
        <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
          {groupOptions.map(g => {
            const gIds = g==="All" ? PRACTICES.map(p=>p.id) : PRACTICES.filter(p=>p.group===g).map(p=>p.id);
            const allOn = gIds.every(id=>selected.includes(id));
            return (
              <div key={g} style={{display:"flex",alignItems:"center",gap:0}}>
                <button onClick={()=>setFilter(g)} style={{
                  padding:"7px 14px",borderRadius:g==="All"?"20px":"20px 0 0 20px",
                  border:"1px solid",fontSize:13,cursor:"pointer",fontWeight:500,
                  background:filter===g?TC:"#fff",
                  color:filter===g?"#fff":"#475569",
                  borderColor:filter===g?TC:"#e2e8f0"}}>
                  {g}
                </button>
                {g!=="All" && (
                  <button onClick={()=>toggleGroup(g)} title={allOn?"Deselect group":"Select group"}
                    style={{padding:"7px 10px",borderRadius:"0 20px 20px 0",border:"1px solid",
                      borderLeft:"none",fontSize:12,cursor:"pointer",fontWeight:700,
                      background:allOn?TCG+"22":"#f8fafc",color:allOn?TCG:"#94a3b8",
                      borderColor:filter===g?TC:"#e2e8f0"}}>
                    {allOn?"✓":"+"}</button>
                )}
              </div>
            );
          })}
        </div>

        {/* Practices grid */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:10,marginBottom:24}}>
          {visible.map(p => {
            const on = selected.includes(p.id);
            return (
              <div key={p.id} onClick={()=>toggle(p.id)}
                style={{background:on?"#fff":"#f8fafc",borderRadius:10,padding:16,cursor:"pointer",
                  border:`2px solid ${on?TC:"#e2e8f0"}`,transition:"all .15s",
                  display:"flex",alignItems:"center",gap:12}}
                onMouseEnter={e=>{ e.currentTarget.style.borderColor=on?TC:TCL; }}
                onMouseLeave={e=>{ e.currentTarget.style.borderColor=on?TC:"#e2e8f0"; }}>
                <div style={{width:22,height:22,borderRadius:6,flexShrink:0,
                  background:on?TC:"#fff",border:`2px solid ${on?TC:"#cbd5e1"}`,
                  display:"flex",alignItems:"center",justifyContent:"center"}}>
                  {on && <span style={{color:"#fff",fontSize:13,fontWeight:700,lineHeight:1}}>✓</span>}
                </div>
                <div>
                  <div style={{fontSize:10,color:"#94a3b8",fontWeight:600,textTransform:"uppercase",
                    letterSpacing:.4,marginBottom:2}}>{p.group}</div>
                  <div style={{fontWeight:600,color:on?TC:"#64748b",fontSize:13,lineHeight:1.4}}>
                    {p.name}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Sticky footer */}
        <div style={{position:"sticky",bottom:0,background:"#f0f4f8",paddingBottom:24}}>
          <div style={{background:"#fff",borderRadius:12,padding:"16px 24px",
            boxShadow:"0 -2px 12px rgba(0,0,0,.06)",display:"flex",
            alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
            <div>
              <span style={{fontWeight:700,color:TC,fontSize:16}}>{selected.length}</span>
              <span style={{color:"#64748b",fontSize:14}}> practices selected for assessment</span>
            </div>
            <button onClick={handleSave}
              style={{padding:"12px 32px",borderRadius:10,border:"none",background:selected.length>0?TC:"#e2e8f0",
                color:selected.length>0?"#fff":"#94a3b8",fontWeight:700,fontSize:14,
                cursor:selected.length>0?"pointer":"not-allowed"}}>
              Start Assessment →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── SubmittedScreen (BUG 3) ────────────────────────────────────── */
function SubmittedScreen({ user, scores, dimScores, levels, companyProfile, selectedPractices, onLogout, onReport }) {
  const practiceRows = PRACTICES.filter(p => selectedPractices.includes(p.id) && scores[p.id] != null);
  const n = practiceRows.length;
  const avgScore = n > 0 ? practiceRows.reduce((s,p)=>s+scores[p.id],0)/n : 0;

  const dimAvgs = {};
  for (const dk of DIM_KEYS) {
    const vals = practiceRows.map(p=>dimScores[p.id]?.[dk]).filter(v=>v!=null);
    dimAvgs[dk] = vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : 1;
  }

  return (
    <div style={{minHeight:"100vh",background:"#f0f4f8"}}>
      <div style={{background:TC,padding:"16px 24px",display:"flex",alignItems:"center",gap:12}}>
        <div style={{width:36,height:36,borderRadius:8,background:"rgba(255,255,255,.15)",
          display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>📊</div>
        <div style={{flex:1}}>
          <div style={{color:"#fff",fontWeight:700,fontSize:16}}>{TOOL_NAME}</div>
          <div style={{color:"rgba(255,255,255,.6)",fontSize:11}}>{ORG_BRAND}</div>
        </div>
        <button onClick={onReport}
          style={{padding:"8px 16px",borderRadius:8,border:"1px solid rgba(255,255,255,.3)",
            background:"transparent",color:"#fff",cursor:"pointer",fontSize:13,fontWeight:600}}>
          📄 View Report
        </button>
        <button onClick={onLogout}
          style={{padding:"8px 12px",borderRadius:8,border:"1px solid rgba(255,255,255,.25)",
            background:"transparent",color:"rgba(255,255,255,.7)",cursor:"pointer",fontSize:12}}>
          Sign Out
        </button>
      </div>

      <div style={{maxWidth:800,margin:"48px auto",padding:"0 16px"}}>
        {/* Success hero */}
        <div style={{background:"linear-gradient(135deg,#003087,#001f5c)",borderRadius:20,
          padding:48,textAlign:"center",marginBottom:28,color:"#fff",
          boxShadow:"0 8px 32px rgba(0,48,135,.25)"}}>
          <div style={{fontSize:64,marginBottom:16}}>🎉</div>
          <h1 style={{fontSize:26,fontWeight:800,margin:"0 0 8px"}}>Assessment Submitted!</h1>
          <p style={{color:"rgba(255,255,255,.7)",fontSize:15,margin:"0 0 24px"}}>
            Your assessment has been finalised and sent to your ITSM assessor.
          </p>
          <div style={{display:"inline-flex",gap:4,alignItems:"center",
            background:"rgba(0,169,79,.2)",border:"1px solid rgba(0,169,79,.4)",
            borderRadius:20,padding:"8px 20px"}}>
            <span style={{color:"#4ade80",fontWeight:700,fontSize:14}}>🔒 Answers Locked — Read-Only</span>
          </div>
        </div>

        {/* Score summary */}
        <div style={{background:"#fff",borderRadius:16,padding:32,marginBottom:20,
          boxShadow:"0 1px 4px rgba(0,0,0,.06)"}}>
          <h2 style={{color:TC,fontSize:17,margin:"0 0 24px",fontWeight:700}}>Your Score Summary</h2>
          {companyProfile && (
            <div style={{background:"#f8fafc",borderRadius:10,padding:"12px 16px",marginBottom:20,
              display:"flex",gap:24,flexWrap:"wrap"}}>
              <div><span style={{fontSize:11,color:"#94a3b8",fontWeight:600}}>COMPANY</span>
                <div style={{fontWeight:700,color:"#1e293b",fontSize:14}}>{companyProfile.companyName}</div></div>
              <div><span style={{fontSize:11,color:"#94a3b8",fontWeight:600}}>INDUSTRY</span>
                <div style={{fontWeight:700,color:"#1e293b",fontSize:14}}>{companyProfile.industry}</div></div>
              <div><span style={{fontSize:11,color:"#94a3b8",fontWeight:600}}>SIZE</span>
                <div style={{fontWeight:700,color:"#1e293b",fontSize:14}}>{companyProfile.employeeStrength}</div></div>
            </div>
          )}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:14,marginBottom:24}}>
            <div style={{background:maturityColor(avgScore)+"11",borderRadius:12,padding:16,
              textAlign:"center",border:`2px solid ${maturityColor(avgScore)}33`}}>
              <div style={{fontSize:32,fontWeight:900,color:maturityColor(avgScore)}}>{avgScore.toFixed(2)}</div>
              <div style={{fontSize:12,fontWeight:700,color:maturityColor(avgScore)}}>{maturityLabel(avgScore)}</div>
              <div style={{fontSize:11,color:"#94a3b8",marginTop:2}}>Overall Score</div>
            </div>
            {DIM_KEYS.map(dk => (
              <div key={dk} style={{background:DIMS[dk].color+"11",borderRadius:12,padding:16,
                textAlign:"center",border:`1px solid ${DIMS[dk].color}33`}}>
                <div style={{fontSize:22,fontWeight:800,color:DIMS[dk].color}}>{dimAvgs[dk].toFixed(2)}</div>
                <div style={{fontSize:11,fontWeight:700,color:DIMS[dk].color}}>{dk}</div>
                <div style={{fontSize:10,color:"#94a3b8",marginTop:2}}>{DIMS[dk].label}</div>
              </div>
            ))}
          </div>
          <div style={{borderTop:"1px solid #f1f5f9",paddingTop:16}}>
            <h3 style={{fontSize:14,fontWeight:700,color:"#334155",marginBottom:12}}>Practice Scores</h3>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {practiceRows.sort((a,b)=>scores[b.id]-scores[a.id]).map(p => (
                <div key={p.id} style={{display:"flex",alignItems:"center",gap:12,
                  padding:"8px 12px",background:"#f8fafc",borderRadius:8}}>
                  <div style={{flex:1,fontSize:13,color:"#334155",fontWeight:500}}>{p.name}</div>
                  <div style={{fontSize:11,color:"#94a3b8",textTransform:"capitalize"}}>{levels[p.id]}</div>
                  <div style={{fontWeight:700,color:maturityColor(scores[p.id]),fontSize:14,minWidth:36,textAlign:"right"}}>
                    {scores[p.id].toFixed(1)}
                  </div>
                  <div style={{fontSize:11,color:maturityColor(scores[p.id]),minWidth:80,textAlign:"right"}}>
                    {maturityLabel(scores[p.id])}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{background:"#fff3cd",border:"1px solid #ffc107",borderRadius:12,padding:"16px 20px",
          display:"flex",gap:12,alignItems:"flex-start"}}>
          <div style={{fontSize:20}}>📧</div>
          <div>
            <div style={{fontWeight:700,color:"#856404",fontSize:14,marginBottom:4}}>What happens next?</div>
            <div style={{fontSize:13,color:"#664d03"}}>
              Your TCS ITSM Practice consultant will review your submission and prepare a full
              PDF report with detailed recommendations. Expect to receive it within 2–3 business days.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


function AssessScreen({ practice, qb, existingLevel, existingAnswers, onSubmit, onBack, showToast, readOnly }) {
  const [level, setLevel]       = useState(existingLevel || null);
  const [answers, setAnswers]   = useState(existingAnswers || {});  // { qid: { main: 2|1|0, fup: 1|0.5|0 } }
  const [confirmed, setConfirmed] = useState(false);

  const questions = useMemo(() => {
    if (!level || !practice) return [];
    return qb?.[practice.id]?.[level] || [];
  }, [level, practice, qb]);

  function setMain(qid, val) {
    if (readOnly) return;
    setAnswers(prev => {
      const cur = prev[qid] || {};
      return { ...prev, [qid]: { main: val, fup: cur.main===val ? cur.fup : undefined } };
    });
  }
  function setFup(qid, val) {
    if (readOnly) return;
    setAnswers(prev => ({ ...prev, [qid]: { ...(prev[qid]||{}), fup: val } }));
  }

  function needsFup(q, ans) {
    if (!ans) return false;
    if (ans.main === 1 && q.fup_p) return true;
    if (ans.main === 0 && q.fup_n) return true;
    return false;
  }

  const answeredMain   = questions.filter(q => (answers[q.qid]?.main ?? -1) >= 0).length;
  const mandatoryLeft  = questions.filter(q => q.mandatory && (answers[q.qid]?.main ?? -1) < 0);
  const allAnswered    = answeredMain === questions.length;
  const canSubmit      = mandatoryLeft.length === 0 && answeredMain > 0;
  const pct            = questions.length > 0 ? Math.round(answeredMain/questions.length*100) : 0;

  function handleSubmit() {
    if (mandatoryLeft.length > 0) {
      showToast(`${mandatoryLeft.length} mandatory question(s) unanswered`,"error");
      return;
    }
    onSubmit(practice.id, answers, level);
  }

  // Level selector screen
  if (!level) return (
    <div style={{minHeight:"100vh",background:"#f0f4f8"}}>
      <div style={{background:TC,padding:"16px 24px",display:"flex",alignItems:"center",gap:12}}>
        <button onClick={onBack} style={{background:"rgba(255,255,255,.15)",border:"none",
          color:"#fff",borderRadius:8,padding:"6px 12px",cursor:"pointer",fontSize:13}}>← Back</button>
        <div style={{color:"#fff",fontWeight:700,fontSize:15}}>{practice?.name}</div>
      </div>
      <div style={{maxWidth:600,margin:"60px auto",padding:"0 16px"}}>
        <h2 style={{color:TC,textAlign:"center",marginBottom:8}}>Select Competency Level</h2>
        <p style={{color:"#64748b",textAlign:"center",marginBottom:40,fontSize:14}}>
          Choose the level that best reflects your team's current knowledge and experience.
        </p>
        {[
          { key:"beginner", label:"Beginner", icon:"🟢", desc:"Existence-focused. Basic process awareness, no deep ITIL knowledge assumed.", qcount: qb?.[practice?.id]?.beginner?.length||6 },
          { key:"practitioner", label:"Practitioner", icon:"🟡", desc:"Consistency & metrics. Working ITIL knowledge, process in regular use.", qcount: qb?.[practice?.id]?.practitioner?.length||8 },
          { key:"expert", label:"Expert", icon:"🔴", desc:"Quantitative evidence. Actual numbers (MTTR, SLA%, CFR), advanced analysis.", qcount: qb?.[practice?.id]?.expert?.length||10 },
        ].map(opt => (
          <div key={opt.key} onClick={() => setLevel(opt.key)}
            style={{background:"#fff",borderRadius:14,padding:24,marginBottom:16,cursor:"pointer",
              border:"2px solid #e2e8f0",boxShadow:"0 1px 4px rgba(0,0,0,.06)",
              display:"flex",alignItems:"center",gap:20,transition:"all .2s"}}
            onMouseEnter={e=>{e.currentTarget.style.borderColor=TC;e.currentTarget.style.transform="translateY(-2px)";}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor="#e2e8f0";e.currentTarget.style.transform="translateY(0)";}}>
            <div style={{fontSize:36}}>{opt.icon}</div>
            <div style={{flex:1}}>
              <div style={{fontWeight:700,color:TC,fontSize:16,marginBottom:4}}>{opt.label}</div>
              <div style={{fontSize:13,color:"#64748b",lineHeight:1.5}}>{opt.desc}</div>
              <div style={{fontSize:11,color:"#94a3b8",marginTop:6}}>{opt.qcount} questions</div>
            </div>
            <div style={{fontSize:20,color:"#94a3b8"}}>›</div>
          </div>
        ))}
      </div>
    </div>
  );

  // Assessment screen
  return (
    <div style={{minHeight:"100vh",background:"#f0f4f8"}}>
      {/* Header */}
      <div style={{background:TC,padding:"16px 24px",position:"sticky",top:0,zIndex:100,
        boxShadow:"0 2px 8px rgba(0,0,0,.2)"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:10}}>
          <button onClick={onBack} style={{background:"rgba(255,255,255,.15)",border:"none",
            color:"#fff",borderRadius:8,padding:"6px 12px",cursor:"pointer",fontSize:13}}>← Back</button>
          <div style={{flex:1}}>
            <div style={{color:"#fff",fontWeight:700,fontSize:15}}>{practice.name}</div>
            <div style={{color:"rgba(255,255,255,.6)",fontSize:11}}>
              {level.charAt(0).toUpperCase()+level.slice(1)} · {answeredMain}/{questions.length} answered · {pct}%
            </div>
          </div>
          <button onClick={()=>setLevel(null)} style={{padding:"6px 12px",borderRadius:8,
            border:"1px solid rgba(255,255,255,.3)",background:"transparent",
            color:"rgba(255,255,255,.8)",cursor:"pointer",fontSize:12}}>Change Level</button>
          <button onClick={handleSubmit} disabled={!canSubmit}
            style={{padding:"8px 18px",borderRadius:8,border:"none",fontWeight:700,fontSize:13,
              cursor:canSubmit?"pointer":"not-allowed",
              background:canSubmit?TCG:"rgba(255,255,255,.2)",
              color:canSubmit?"#fff":"rgba(255,255,255,.4)"}}>
            Submit ✓
          </button>
        </div>
        {/* Progress */}
        <div style={{background:"rgba(255,255,255,.2)",borderRadius:999,height:6,overflow:"hidden"}}>
          <div style={{height:"100%",background:"#fff",width:`${pct}%`,
            transition:"width .3s ease",borderRadius:999}} />
        </div>
      </div>

      {/* Dimension legend */}
      <div style={{background:"#fff",borderBottom:"1px solid #e2e8f0",padding:"10px 24px",
        display:"flex",gap:16,flexWrap:"wrap",justifyContent:"center"}}>
        {DIM_KEYS.map(dk => (
          <div key={dk} style={{display:"flex",alignItems:"center",gap:6,fontSize:12}}>
            <div style={{width:10,height:10,borderRadius:2,background:DIMS[dk].color}} />
            <span style={{color:"#64748b"}}><strong style={{color:DIMS[dk].color}}>{dk}</strong> {DIMS[dk].label}</span>
          </div>
        ))}
      </div>

      {/* Questions */}
      <div style={{maxWidth:800,margin:"24px auto",padding:"0 16px"}}>
        {questions.map((q, idx) => {
          const ans  = answers[q.qid] || {};
          const showFup = needsFup(q, ans);
          const fupText = ans.main===1 ? q.fup_p : q.fup_n;
          const dimColor = DIMS[q.dim]?.color || "#94a3b8";

          return (
            <div key={q.qid} style={{background:"#fff",borderRadius:12,padding:24,marginBottom:16,
              boxShadow:"0 1px 4px rgba(0,0,0,.06)",
              borderLeft:`4px solid ${ans.main!=null?maturityColor(ans.main===2?4.5:ans.main===1?2.8:1.2):"#e2e8f0"}`}}>
              {/* Question header */}
              <div style={{display:"flex",alignItems:"flex-start",gap:12,marginBottom:16}}>
                <div style={{width:28,height:28,borderRadius:"50%",background:TC+"22",color:TC,
                  display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,
                  fontSize:12,flexShrink:0}}>
                  {idx+1}
                </div>
                <div style={{flex:1}}>
                  <div style={{display:"flex",gap:8,marginBottom:8,flexWrap:"wrap"}}>
                    <span style={{fontSize:10,padding:"2px 8px",borderRadius:10,fontWeight:700,
                      background:dimColor+"22",color:dimColor}}>
                      {q.dim} · {DIMS[q.dim]?.label}
                    </span>
                    {q.mandatory && (
                      <span style={{fontSize:10,padding:"2px 8px",borderRadius:10,
                        background:"#fef2f2",color:"#dc2626",fontWeight:600}}>Required</span>
                    )}
                  </div>
                  <p style={{margin:0,color:"#1e293b",fontSize:14,lineHeight:1.65,fontWeight:500}}>
                    {q.text}
                  </p>
                  {q.hint && (
                    <p style={{margin:"8px 0 0",color:"#64748b",fontSize:12,lineHeight:1.5,
                      padding:"8px 12px",background:"#f8fafc",borderRadius:6,
                      borderLeft:"3px solid #e2e8f0"}}>
                      💡 {q.hint}
                    </p>
                  )}
                </div>
              </div>
              {/* Answer buttons */}
              <div style={{display:"flex",gap:8,marginLeft:40}}>
                {[
                  { val:2, label:"Yes",     bg:"#dcfce7", border:"#22c55e", color:"#15803d", dot:"#22c55e" },
                  { val:1, label:"Partial", bg:"#fef9c3", border:"#eab308", color:"#92400e", dot:"#eab308" },
                  { val:0, label:"No",      bg:"#fee2e2", border:"#ef4444", color:"#991b1b", dot:"#ef4444" },
                ].map(btn => (
                  <button key={btn.val} onClick={() => setMain(q.qid, btn.val)}
                    style={{flex:1,padding:"10px 8px",borderRadius:8,fontWeight:600,fontSize:13,
                      cursor:"pointer",transition:"all .15s",
                      border:`2px solid ${ans.main===btn.val?btn.border:"#e2e8f0"}`,
                      background: ans.main===btn.val ? btn.bg : "#f8fafc",
                      color: ans.main===btn.val ? btn.color : "#64748b",
                      transform: ans.main===btn.val ? "scale(1.03)" : "scale(1)"}}>
                    {btn.label}
                  </button>
                ))}
              </div>

              {/* Follow-up question (inline branching) */}
              {showFup && fupText && (
                <div style={{marginTop:16,marginLeft:40,padding:"16px 20px",
                  background:"#f8fafc",borderRadius:10,
                  border:"1px dashed #cbd5e1"}}>
                  <div style={{fontSize:11,color:dimColor,fontWeight:700,marginBottom:8,
                    display:"flex",alignItems:"center",gap:6}}>
                    <span style={{fontSize:14}}>↳</span> Follow-up Question
                    <span style={{fontSize:10,color:"#94a3b8",fontWeight:400,marginLeft:4}}>
                      (half-weight · contributes to {q.dim})
                    </span>
                  </div>
                  <p style={{margin:"0 0 12px",color:"#334155",fontSize:13,lineHeight:1.6}}>
                    {fupText}
                  </p>
                  <div style={{display:"flex",gap:8}}>
                    {[
                      { val:1,   label:"Yes",     bg:"#dcfce7", border:"#22c55e", color:"#15803d" },
                      { val:0.5, label:"Partial", bg:"#fef9c3", border:"#eab308", color:"#92400e" },
                      { val:0,   label:"No",      bg:"#fee2e2", border:"#ef4444", color:"#991b1b" },
                    ].map(btn => (
                      <button key={btn.val} onClick={() => setFup(q.qid, btn.val)}
                        style={{flex:1,padding:"8px",borderRadius:8,fontWeight:600,fontSize:12,
                          cursor:"pointer",transition:"all .15s",
                          border:`2px solid ${ans.fup===btn.val?btn.border:"#e2e8f0"}`,
                          background: ans.fup===btn.val ? btn.bg : "#fff",
                          color: ans.fup===btn.val ? btn.color : "#94a3b8"}}>
                        {btn.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Submit footer */}
        <div style={{background:"#fff",borderRadius:12,padding:20,marginBottom:40,
          boxShadow:"0 1px 4px rgba(0,0,0,.06)",display:"flex",alignItems:"center",gap:16}}>
          <div style={{flex:1}}>
            <div style={{fontWeight:600,color:TC,fontSize:14}}>
              {canSubmit ? `Ready to submit — ${pct}% complete` : `${mandatoryLeft.length} required question(s) remaining`}
            </div>
            <div style={{fontSize:12,color:"#94a3b8",marginTop:2}}>
              {answeredMain} of {questions.length} questions answered
            </div>
          </div>
          <button onClick={handleSubmit} disabled={!canSubmit}
            style={{padding:"12px 28px",borderRadius:10,border:"none",fontWeight:700,fontSize:14,
              cursor:canSubmit?"pointer":"not-allowed",
              background:canSubmit?TCG:"#e2e8f0",
              color:canSubmit?"#fff":"#94a3b8"}}>
            Submit Assessment
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── GaugeSVG ──────────────────────────────────────────────────── */
function GaugeSVG({ score, size=140 }) {
  const min=1, max=5, range=max-min;
  const angle = ((score-min)/range) * 180 - 90; // -90 to +90
  const r=55, cx=70, cy=80;
  const arcStart = { x: cx - r, y: cy };
  const arcEnd   = { x: cx + r, y: cy };
  const toXY = (deg) => ({
    x: cx + r * Math.cos((deg * Math.PI) / 180),
    y: cy + r * Math.sin((deg * Math.PI) / 180),
  });
  const segments = [
    { from:-180, to:-144, col:"#ef4444" },
    { from:-144, to:-108, col:"#f97316" },
    { from:-108, to:-72,  col:"#eab308" },
    { from:-72,  to:-36,  col:TCL },
    { from:-36,  to:0,    col:TCG },
  ];
  const needleRad = ((angle) * Math.PI) / 180;
  const nx = cx + (r-8) * Math.cos(needleRad);
  const ny = cy + (r-8) * Math.sin(needleRad);

  return (
    <svg width={size} height={size*0.75} viewBox="0 0 140 100">
      {segments.map((s,i) => {
        const p1=toXY(s.from), p2=toXY(s.to);
        const large = Math.abs(s.to-s.from) > 90 ? 1 : 0;
        return (
          <path key={i}
            d={`M ${cx} ${cy} L ${p1.x} ${p1.y} A ${r} ${r} 0 ${large} 1 ${p2.x} ${p2.y} Z`}
            fill={s.col} opacity={.8} />
        );
      })}
      <circle cx={cx} cy={cy} r={r-12} fill="#fff" />
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="#1e293b" strokeWidth={2.5} strokeLinecap="round"/>
      <circle cx={cx} cy={cy} r={4} fill="#1e293b" />
      <text x={cx} y={cy-14} textAnchor="middle" fontSize={16} fontWeight={700} fill="#1e293b">{score.toFixed(1)}</text>
      <text x={cx} y={cy-2}  textAnchor="middle" fontSize={7}  fill="#64748b">{maturityLabel(score)}</text>
    </svg>
  );
}

/* ─── RadarSVG ──────────────────────────────────────────────────── */
function DimRadar({ dimData }) {
  // dimData: { PE, PC, MM, CI, TI } with values 1-5
  const data = DIM_KEYS.map(dk => ({
    dim: dk, fullMark: 5, value: Math.round((dimData?.[dk]||1)*10)/10
  }));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <RadarChart data={data}>
        <PolarGrid />
        <PolarAngleAxis dataKey="dim" tick={{fontSize:12,fill:"#475569"}} />
        <PolarRadiusAxis angle={90} domain={[0,5]} tick={{fontSize:9}} tickCount={6}/>
        <Radar dataKey="value" stroke={TC} fill={TC} fillOpacity={0.25} dot />
      </RadarChart>
    </ResponsiveContainer>
  );
}

/* ─── generatePDFHTML ───────────────────────────────────────────── */
/* ═══════════════════════════════════════════════════════════════════
   ENTERPRISE REPORT GENERATOR — Market-Leading Assessment Report
   Sections: Cover · Executive Briefing · Methodology · Current State ·
   Dimensional Analysis · Practice Heatmap · Gap Analysis ·
   Risk Register · Recommendations · Roadmap · ROI · ITIL5/AI · Appendix
═══════════════════════════════════════════════════════════════════ */

function generatePDFHTML({ scores, dimScores, levels, username, ts, companyProfile }) {
  const practiceRows = PRACTICES.filter(p => scores[p.id] != null);
  const n = practiceRows.length;
  const avgScore = n > 0 ? practiceRows.reduce((s,p)=>s+scores[p.id],0)/n : 0;
  const now  = new Date(ts||Date.now());
  const dateStr  = now.toLocaleDateString("en-GB",{day:"2-digit",month:"long",year:"numeric"});
  const yearStr  = now.getFullYear();

  /* ── Dimension averages ── */
  const dimAvgs = {};
  for (const dk of DIM_KEYS) {
    const vals = practiceRows.map(p=>dimScores[p.id]?.[dk]).filter(v=>v!=null);
    dimAvgs[dk] = vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : 1;
  }

  /* ── Group averages ── */
  const groupAvg = {};
  for (const g of GROUPS) {
    const gp = practiceRows.filter(p=>PRACTICES.find(x=>x.id===p.id)?.group===g);
    groupAvg[g] = gp.length ? gp.reduce((s,p)=>s+scores[p.id],0)/gp.length : 0;
  }

  /* ── Maturity distribution ── */
  const matDist = {Initial:0,Managed:0,Defined:0,"Quantitatively Managed":0,Optimizing:0};
  practiceRows.forEach(p=>{matDist[maturityLabel(scores[p.id])]++;});

  /* ── GAP analysis — target L4 (4.0) ── */
  const TARGET = 4.0;
  const gapRows = practiceRows
    .map(p=>({ ...p, sc:scores[p.id], gap:TARGET-scores[p.id], dim:dimScores[p.id]||{} }))
    .sort((a,b)=>b.gap-a.gap);
  const criticalGaps = gapRows.filter(r=>r.gap>1.5);
  const medGaps      = gapRows.filter(r=>r.gap>0.5&&r.gap<=1.5);
  const onTarget     = gapRows.filter(r=>r.gap<=0.5);

  /* ── Risk Register — auto-generated from scores ── */
  const risks = [];
  practiceRows.forEach(p => {
    const sc = scores[p.id]; const dm = dimScores[p.id]||{};
    if (sc < 2) {
      risks.push({ practice:p.name, risk:`No formal ${p.name.replace(" Management","")} process in place`, likelihood:"High", impact:"Critical", rating:16, cat:"Process" });
    } else if (sc < 2.5) {
      risks.push({ practice:p.name, risk:`Inconsistent execution of ${p.name.replace(" Management","")}`, likelihood:"High", impact:"High", rating:12, cat:"Consistency" });
    }
    if (dm.MM && dm.MM < 2) {
      risks.push({ practice:p.name, risk:`Absence of metrics/KPIs for ${p.name.replace(" Management","")}`, likelihood:"Medium", impact:"High", rating:9, cat:"Measurement" });
    }
    if (dm.TI && dm.TI < 1.8) {
      risks.push({ practice:p.name, risk:`Manual tooling gaps in ${p.name.replace(" Management","")}`, likelihood:"High", impact:"Medium", rating:8, cat:"Tooling" });
    }
  });
  // Add strategic risks
  if (avgScore < 3) risks.push({ practice:"Organizational", risk:"Systemic process immaturity creates audit and regulatory exposure", likelihood:"High", impact:"Critical", rating:16, cat:"Strategic" });
  if (dimAvgs.CI && dimAvgs.CI < 2.5) risks.push({ practice:"Organizational", risk:"Absence of improvement culture limits AI adoption readiness", likelihood:"High", impact:"High", rating:12, cat:"Strategic" });
  const topRisks = risks.sort((a,b)=>b.rating-a.rating).slice(0,15);

  /* ── ROI Model ── */
  const headcount     = Math.max(10, n * 8);
  const avgSalary     = 75000;
  const efficiencyGain = 0.12 + (TARGET - avgScore) * 0.04;
  const annualSaving  = Math.round(headcount * avgSalary * efficiencyGain);
  const implCost      = Math.round(n * 28000 + headcount * 3500);
  const year1Saving   = Math.round(annualSaving * 0.4);
  const year2Saving   = Math.round(annualSaving * 0.85);
  const year3Saving   = annualSaving;
  const totalBenefit  = year1Saving + year2Saving + year3Saving;
  const roi3yr        = Math.round(((totalBenefit - implCost) / implCost) * 100);
  const paybackMonths = Math.ceil(implCost / (annualSaving / 12));

  /* ── ITIL5 / AI Readiness score ── */
  const aiReadiness = Math.round((dimAvgs.CI * 0.3 + dimAvgs.MM * 0.3 + dimAvgs.TI * 0.4) * 20);

  /* ════════════════ SVG HELPERS ════════════════ */
  function radarSVG(data, w=280, h=280) {
    const cx=w/2, cy=h/2, r=100;
    const keys = Object.keys(data);
    const n2   = keys.length;
    const pts  = keys.map((k,i) => {
      const ang = (i / n2) * 2 * Math.PI - Math.PI/2;
      const val = Math.max(0, Math.min(5, data[k]||0));
      const pct = (val-0)/(5-0);
      return { x: cx + r*pct*Math.cos(ang), y: cy + r*pct*Math.sin(ang),
               lx: cx + (r+22)*Math.cos(ang), ly: cy + (r+22)*Math.sin(ang),
               key: k, val, color: DIMS[k]?.color||"#94a3b8" };
    });
    const gridPts = (pct) => keys.map((_,i)=>{
      const ang=(i/n2)*2*Math.PI-Math.PI/2;
      return `${cx+r*pct*Math.cos(ang)},${cy+r*pct*Math.sin(ang)}`;
    }).join(" ");
    const poly = pts.map(p=>`${p.x},${p.y}`).join(" ");
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      ${[0.2,0.4,0.6,0.8,1].map(f=>`<polygon points="${gridPts(f)}" fill="none" stroke="#e2e8f0" stroke-width="1"/>`).join("")}
      ${pts.map((_,i)=>{const a=(i/n2)*2*Math.PI-Math.PI/2;return`<line x1="${cx}" y1="${cy}" x2="${cx+r*Math.cos(a)}" y2="${cy+r*Math.sin(a)}" stroke="#e2e8f0" stroke-width="1"/>`;}).join("")}
      <polygon points="${poly}" fill="#003087" fill-opacity="0.15" stroke="#003087" stroke-width="2"/>
      ${pts.map(p=>`<circle cx="${p.x}" cy="${p.y}" r="4" fill="${p.color}" stroke="#fff" stroke-width="1.5"/>
        <text x="${p.lx}" y="${p.ly}" text-anchor="middle" dominant-baseline="middle" font-size="10" font-weight="700" fill="${p.color}">${p.key} ${p.val.toFixed(1)}</text>`).join("")}
      ${[1,2,3,4,5].map(v=>`<text x="${cx+4}" y="${cy-r*(v/5)+4}" font-size="8" fill="#94a3b8">${v}</text>`).join("")}
    </svg>`;
  }

  function hBarSVG(items, w=480, barH=18, gap=6) {
    const sorted = [...items].sort((a,b)=>b.val-a.val);
    const h = sorted.length*(barH+gap)+10;
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      ${sorted.map((it,i)=>{
        const pct=Math.max(0,Math.min(100,((it.val-1)/4)*100));
        const bw=Math.max(4,(w-170)*pct/100);
        const y=i*(barH+gap);
        const col=maturityColor(it.val);
        return `<text x="0" y="${y+barH-4}" font-size="9" fill="#475569" style="font-family:system-ui">${it.label.length>28?it.label.slice(0,26)+"…":it.label}</text>
          <rect x="170" y="${y}" width="${bw}" height="${barH}" rx="3" fill="${col}" opacity="0.85"/>
          <text x="${170+bw+5}" y="${y+barH-4}" font-size="9" font-weight="700" fill="${col}">${it.val.toFixed(2)}</text>`;
      }).join("")}
    </svg>`;
  }

  function riskMatrixSVG(risks, w=320, h=280) {
    const zones=[
      {x:0,y:0,w:w/2,h:h/2,col:"#fee2e2",label:"HIGH-CRITICAL",tc:"#dc2626"},
      {x:w/2,y:0,w:w/2,h:h/2,col:"#fef9c3",label:"MED-CRITICAL",tc:"#d97706"},
      {x:0,y:h/2,w:w/2,h:h/2,col:"#fef9c3",label:"HIGH-MED",tc:"#d97706"},
      {x:w/2,y:h/2,w:w/2,h:h/2,col:"#dcfce7",label:"LOW RISK",tc:"#15803d"},
    ];
    const lMap={Low:0,Medium:1,High:2};
    const iMap={Low:0,Medium:1,High:2,Critical:3};
    const placed = {};
    return `<svg width="${w+40}" height="${h+40}" viewBox="-40 -20 ${w+40} ${h+40}">
      <text x="${w/2-40}" y="-8" text-anchor="middle" font-size="9" fill="#64748b">← LIKELIHOOD →</text>
      <text x="-30" y="${h/2}" text-anchor="middle" font-size="9" fill="#64748b" transform="rotate(-90,-30,${h/2})">← IMPACT →</text>
      ${zones.map(z=>`<rect x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" fill="${z.col}" stroke="#fff" stroke-width="2"/>
        <text x="${z.x+z.w/2}" y="${z.y+z.h/2}" text-anchor="middle" font-size="8" font-weight="700" fill="${z.tc}" opacity="0.5">${z.label}</text>`).join("")}
      ${risks.slice(0,12).map((r,i)=>{
        const lv=lMap[r.likelihood]||1; const iv=Math.min(3,iMap[r.impact]||1);
        const bx = lv*(w/3)+w/6-20; const by = (3-iv)*(h/4)+h/8-20;
        const key=`${Math.round(bx)}_${Math.round(by)}`;
        placed[key]=(placed[key]||0)+1;
        const jitter=placed[key]*10;
        return `<circle cx="${bx+jitter}" cy="${by}" r="10" fill="${r.rating>=12?"#dc2626":r.rating>=8?"#f97316":"#eab308"}" opacity="0.85" stroke="#fff" stroke-width="1.5"/>
          <text x="${bx+jitter}" y="${by+4}" text-anchor="middle" font-size="8" font-weight="700" fill="#fff">${i+1}</text>`;
      }).join("")}
      <line x1="${w/3}" y1="0" x2="${w/3}" y2="${h}" stroke="#fff" stroke-width="2"/>
      <line x1="${2*w/3}" y1="0" x2="${2*w/3}" y2="${h}" stroke="#fff" stroke-width="2"/>
      <line x1="0" y1="${h/4}" x2="${w}" y2="${h/4}" stroke="#fff" stroke-width="2"/>
      <line x1="0" y1="${h/2}" x2="${w}" y2="${h/2}" stroke="#fff" stroke-width="2"/>
      <line x1="0" y1="${3*h/4}" x2="${w}" y2="${3*h/4}" stroke="#fff" stroke-width="2"/>
    </svg>`;
  }

  function roadmapSVG(w=700,h=200) {
    const phases=[
      {label:"Phase 1: Foundation",dur:"0–3 Months",col:"#ef4444",items:["Establish governance","Critical process docs","Mandatory KPI baseline","Tool audit"]},
      {label:"Phase 2: Standardisation",dur:"3–12 Months",col:"#f97316",items:["Process consistency programs","ITSM tooling upgrades","Training & certification","Metrics framework"]},
      {label:"Phase 3: Optimisation",dur:"12–24 Months",col:"#22c55e",items:["Continual improvement loops","AI/ML integration","Quantitative management","ITIL 5 readiness"]},
    ];
    const pw=(w-60)/3;
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      ${phases.map((p,i)=>{
        const x=i*(pw+20)+10;
        return `<rect x="${x}" y="0" width="${pw}" height="${h}" rx="10" fill="${p.col}" opacity="${0.12+i*0.04}"/>
          <rect x="${x}" y="0" width="${pw}" height="36" rx="10" fill="${p.col}"/>
          <rect x="${x}" y="26" width="${pw}" height="10" fill="${p.col}"/>
          <text x="${x+pw/2}" y="16" text-anchor="middle" font-size="10" font-weight="700" fill="#fff">${p.label}</text>
          <text x="${x+pw/2}" y="29" text-anchor="middle" font-size="8" fill="#fff" opacity="0.85">${p.dur}</text>
          ${p.items.map((it,j)=>`<text x="${x+12}" y="${52+j*26}" font-size="9" fill="#334155">▸ ${it}</text>`).join("")}
          ${i<2?`<polygon points="${x+pw+2},${h/2-8} ${x+pw+18},${h/2} ${x+pw+2},${h/2+8}" fill="${phases[i+1].col}"/>`:""}`;
      }).join("")}
    </svg>`;
  }

  function roiChartSVG(y1,y2,y3,cost,w=480,h=200) {
    const maxV=Math.max(y3,cost)*1.1;
    const pts=[[0,0],[90,cost],[180,y1],[270,y1+y2],[360,y1+y2+y3]];
    const cumBen=[[0,0],[180,y1],[270,y1+y2],[360,y1+y2+y3]];
    const scX=v=>60+v*(w-80)/360;
    const scY=v=>h-30-(v/maxV)*(h-50);
    const formatM=v=>`$${(v/1e6).toFixed(1)}M`;
    const benPoly=cumBen.map(([x,v])=>`${scX(x)},${scY(v)}`).join(" ");
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      <line x1="60" y1="${h-30}" x2="${w-20}" y2="${h-30}" stroke="#e2e8f0" stroke-width="1.5"/>
      <line x1="60" y1="20" x2="60" y2="${h-30}" stroke="#e2e8f0" stroke-width="1.5"/>
      ${[0,.25,.5,.75,1].map(f=>`<line x1="58" y1="${scY(maxV*f)}" x2="${w-20}" y2="${scY(maxV*f)}" stroke="#f1f5f9" stroke-width="1"/>
        <text x="55" y="${scY(maxV*f)+4}" text-anchor="end" font-size="8" fill="#94a3b8">${formatM(maxV*f)}</text>`).join("")}
      <line x1="${scX(90)}" y1="20" x2="${scX(90)}" y2="${h-30}" stroke="#ef4444" stroke-width="1" stroke-dasharray="4,3"/>
      <rect x="${scX(0)}" y="${scY(cost)}" width="${scX(90)-scX(0)}" height="${scY(0)-scY(cost)}" fill="#fee2e2" opacity="0.5"/>
      <text x="${scX(45)}" y="${scY(cost)-5}" text-anchor="middle" font-size="8" fill="#dc2626" font-weight="700">Investment ${formatM(cost)}</text>
      <polyline points="${benPoly}" fill="none" stroke="#22c55e" stroke-width="2.5" stroke-linejoin="round"/>
      <polygon points="${scX(0)},${scY(0)} ${benPoly} ${scX(360)},${scY(0)}" fill="#22c55e" opacity="0.12"/>
      ${cumBen.map(([x,v])=>`<circle cx="${scX(x)}" cy="${scY(v)}" r="4" fill="#22c55e" stroke="#fff" stroke-width="1.5"/>
        ${v>0?`<text x="${scX(x)}" y="${scY(v)-8}" text-anchor="middle" font-size="8" font-weight="700" fill="#15803d">${formatM(v)}</text>`:""}`).join("")}
      ${["Now","Q4","Yr 1","Yr 2","Yr 3"].map((l,i)=>`<text x="${scX(i*90)}" y="${h-15}" text-anchor="middle" font-size="9" fill="#64748b">${l}</text>`).join("")}
    </svg>`;
  }

  /* ════════════════ CSS ════════════════ */
  const CSS = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');
    * { box-sizing: border-box; margin:0; padding:0; }
    body { font-family:'Inter',system-ui,sans-serif; color:#1e293b; background:#fff; font-size:13px; line-height:1.6; }
    .page-break { page-break-after:always; break-after:page; }
    .avoid-break { page-break-inside:avoid; break-inside:avoid; }
    .section { padding:40px 56px; }
    .section-alt { padding:40px 56px; background:#f8fafc; }
    h1{font-size:32px;font-weight:900;} h2{font-size:20px;font-weight:800;color:#003087;margin:0 0 16px;}
    h3{font-size:14px;font-weight:700;color:#334155;margin:0 0 10px;}
    h4{font-size:12px;font-weight:700;color:#475569;margin:0 0 8px;text-transform:uppercase;letter-spacing:.8px;}
    p{margin:0 0 12px;font-size:13px;color:#475569;line-height:1.7;}
    table{width:100%;border-collapse:collapse;}
    th{background:#003087;color:#fff;padding:10px 12px;text-align:left;font-size:11px;font-weight:700;letter-spacing:.4px;}
    td{padding:9px 12px;border-bottom:1px solid #f1f5f9;font-size:12px;vertical-align:middle;}
    tr:nth-child(even) td{background:#f8fafc;}
    .badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700;}
    .kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin:20px 0;}
    .kpi-card{background:#fff;border-radius:12px;padding:20px;border:1px solid #e2e8f0;box-shadow:0 1px 4px rgba(0,0,0,.06);}
    .kpi-val{font-size:30px;font-weight:900;line-height:1;}
    .kpi-lbl{font-size:11px;color:#94a3b8;margin-top:4px;font-weight:500;}
    .kpi-sub{font-size:12px;margin-top:4px;font-weight:600;}
    .two-col{display:grid;grid-template-columns:1fr 1fr;gap:24px;}
    .three-col{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;}
    .card{background:#fff;border-radius:12px;padding:24px;border:1px solid #e2e8f0;box-shadow:0 1px 4px rgba(0,0,0,.06);}
    .insight-box{background:linear-gradient(135deg,#003087 0%,#001f5c 100%);color:#fff;border-radius:12px;padding:24px;margin:20px 0;}
    .insight-box h3{color:#fff;font-size:15px;margin-bottom:12px;}
    .insight-box p{color:rgba(255,255,255,.85);font-size:12px;margin:0;}
    .risk-critical{background:#fee2e2;color:#991b1b;border-left:4px solid #dc2626;}
    .risk-high{background:#fff7ed;color:#92400e;border-left:4px solid #f97316;}
    .risk-medium{background:#fefce8;color:#713f12;border-left:4px solid #eab308;}
    .timeline-phase{border-radius:10px;padding:20px;margin-bottom:16px;}
    .bar-bg{background:#f1f5f9;border-radius:999px;height:10px;overflow:hidden;margin-top:6px;}
    .bar-fill{height:100%;border-radius:999px;}
    .section-label{font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#94a3b8;margin-bottom:8px;}
    .divider{border:none;border-top:2px solid #e2e8f0;margin:24px 0;}
    .toc-row{display:flex;align-items:center;padding:8px 0;border-bottom:1px dotted #e2e8f0;font-size:13px;}
    .toc-num{width:32px;height:32px;border-radius:8px;background:#003087;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;flex-shrink:0;margin-right:16px;}
    .toc-dots{flex:1;border-bottom:1px dotted #cbd5e1;margin:0 12px;}
    .highlight-box{border-radius:8px;padding:14px 18px;margin:10px 0;display:flex;gap:14px;align-items:flex-start;}
    .highlight-icon{font-size:20px;flex-shrink:0;margin-top:2px;}
    .rec-card{border-radius:10px;padding:16px 20px;margin:10px 0;border-left:5px solid;}
    .ai-step{background:#fff;border-radius:10px;padding:16px 20px;margin:10px 0;border:1px solid #e2e8f0;display:flex;gap:14px;}
    .ai-num{width:32px;height:32px;border-radius:8px;background:linear-gradient(135deg,#003087,#009BDE);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;flex-shrink:0;}
    @media print {
      body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
      .page-break{page-break-after:always;}
      .avoid-break{page-break-inside:avoid;}
      .no-print{display:none;}
    }
  `;

  /* ════════════════ COVER PAGE ════════════════ */
  const coverPage = `
<div style="height:100vh;min-height:1100px;background:linear-gradient(160deg,#003087 0%,#001a4d 55%,#c8102e 100%);position:relative;overflow:hidden;display:flex;flex-direction:column;justify-content:space-between;padding:0;page-break-after:always;">
  <!-- Geometric decoration -->
  <svg style="position:absolute;top:0;right:0;opacity:.07" width="600" height="600" viewBox="0 0 600 600">
    <circle cx="500" cy="100" r="300" fill="#fff"/>
    <circle cx="450" cy="500" r="200" fill="#009BDE"/>
    <rect x="100" y="100" width="200" height="200" rx="40" fill="#fff" transform="rotate(30,200,200)"/>
  </svg>
  <div style="position:absolute;bottom:-80px;left:-80px;width:400px;height:400px;border-radius:50%;background:rgba(0,155,222,.15);"></div>

  <!-- Header bar -->
  <div style="background:rgba(255,255,255,.08);backdrop-filter:blur(10px);padding:24px 56px;border-bottom:1px solid rgba(255,255,255,.15);">
    <div style="display:flex;align-items:center;justify-content:space-between;">
      <div style="display:flex;align-items:center;gap:16px;">
        <div style="width:48px;height:48px;border-radius:12px;background:#fff;display:flex;align-items:center;justify-content:center;font-size:24px;">🏢</div>
        <div>
          <div style="color:#fff;font-weight:800;font-size:18px;letter-spacing:.5px;">TCS</div>
          <div style="color:rgba(255,255,255,.6);font-size:11px;letter-spacing:1px;">ITSM Practice</div>
        </div>
      </div>
      <div style="text-align:right;">
        <div style="color:rgba(255,255,255,.5);font-size:11px;letter-spacing:1px;">CONFIDENTIAL</div>
        <div style="color:rgba(255,255,255,.4);font-size:10px;margin-top:2px;">For Board & C-Suite Use Only</div>
      </div>
    </div>
  </div>

  <!-- Main content -->
  <div style="padding:60px 56px;flex:1;display:flex;flex-direction:column;justify-content:center;">
    <div style="margin-bottom:12px;">
      <span style="background:rgba(200,16,46,.8);color:#fff;padding:6px 16px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">ITIL 4 Maturity Assessment</span>
    </div>
    ${companyProfile ? `<div style="margin-bottom:16px;">
      <span style="color:rgba(255,255,255,.85);font-size:20px;font-weight:700;">${companyProfile.companyName}</span>
      <span style="color:rgba(255,255,255,.5);font-size:14px;margin-left:12px;">${companyProfile.industry} · ${companyProfile.employeeStrength} employees</span>
    </div>` : ""}
    <h1 style="color:#fff;font-size:44px;font-weight:900;line-height:1.15;margin:16px 0 24px;max-width:680px;">
      IT Service Management<br/>Maturity & Strategic<br/>
      <span style="color:#009BDE;">Transformation Report</span>
    </h1>
    <p style="color:rgba(255,255,255,.7);font-size:16px;max-width:560px;line-height:1.7;margin-bottom:48px;">
      A comprehensive analysis of current ITSM process maturity, dimensional scoring, risk exposure, and a data-driven strategic roadmap for achieving operational excellence.
    </p>

    <!-- Stat pills -->
    <div style="display:flex;gap:20px;flex-wrap:wrap;margin-bottom:48px;">
      <div style="background:rgba(255,255,255,.12);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.2);border-radius:12px;padding:16px 24px;">
        <div style="color:#fff;font-size:28px;font-weight:900;">${avgScore.toFixed(2)}</div>
        <div style="color:rgba(255,255,255,.6);font-size:11px;margin-top:2px;">Overall Maturity Score</div>
      </div>
      <div style="background:rgba(255,255,255,.12);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.2);border-radius:12px;padding:16px 24px;">
        <div style="color:#fff;font-size:28px;font-weight:900;">${n}</div>
        <div style="color:rgba(255,255,255,.6);font-size:11px;margin-top:2px;">Practices Assessed</div>
      </div>
      <div style="background:rgba(255,255,255,.12);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.2);border-radius:12px;padding:16px 24px;">
        <div style="color:${avgScore>=4?"#4ade80":avgScore>=3?"#fbbf24":"#f87171"};font-size:28px;font-weight:900;">${maturityLabel(avgScore)}</div>
        <div style="color:rgba(255,255,255,.6);font-size:11px;margin-top:2px;">Current Maturity Stage</div>
      </div>
      <div style="background:rgba(255,255,255,.12);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.2);border-radius:12px;padding:16px 24px;">
        <div style="color:#4ade80;font-size:28px;font-weight:900;">${aiReadiness}%</div>
        <div style="color:rgba(255,255,255,.6);font-size:11px;margin-top:2px;">AI Readiness Index</div>
      </div>
    </div>
    ${companyProfile?.itsmTools?.length ? `
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <span style="color:rgba(255,255,255,.5);font-size:11px;align-self:center;">ITSM Tools:</span>
      ${companyProfile.itsmTools.map(t=>`<span style="background:rgba(255,255,255,.12);color:#fff;padding:4px 12px;border-radius:20px;font-size:11px;font-weight:600;">${t}</span>`).join("")}
    </div>` : ""}
  </div>

  <!-- Footer -->
  <div style="padding:24px 56px;background:rgba(0,0,0,.2);border-top:1px solid rgba(255,255,255,.1);">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px;">
      <div>
        <div style="color:rgba(255,255,255,.5);font-size:11px;">Prepared for</div>
        <div style="color:#fff;font-size:13px;font-weight:700;">${companyProfile ? companyProfile.companyName + " — " : ""}CEO · CIO · CISO</div>
      </div>
      <div style="text-align:center;">
        <div style="color:rgba(255,255,255,.5);font-size:11px;">Assessor</div>
        <div style="color:#fff;font-size:13px;font-weight:700;">${username||"TCS Consultant"}</div>
      </div>
      <div style="text-align:right;">
        <div style="color:rgba(255,255,255,.5);font-size:11px;">Report Date</div>
        <div style="color:#fff;font-size:13px;font-weight:700;">${dateStr}</div>
      </div>
    </div>
  </div>
</div>`;


  /* ════════════════ TABLE OF CONTENTS ════════════════ */
  const tocPage = `
<div class="section page-break" style="min-height:900px;">
  <div class="section-label" style="margin-bottom:32px;">Navigation</div>
  <h2 style="font-size:28px;color:#003087;margin-bottom:8px;">Table of Contents</h2>
  <p style="color:#64748b;margin-bottom:40px;">This report has been prepared exclusively for the Board and C-Suite leadership team.</p>
  ${[
    ["01","Executive Briefing","CEO · CIO · CISO Summary","3"],
    ["02","Assessment Methodology","Framework, Scoring, Dimensions","4"],
    ["03","Current State Analysis","Overall Maturity, Group Scores, Distribution","5"],
    ["04","Dimensional Analysis","PE · PC · MM · CI · TI Deep Dive","6"],
    ["05","Practice Performance Heatmap","All 34 Practices Scored","7"],
    ["06","Gap Analysis","Current vs Target · Priority Matrix","8"],
    ["07","Risk Register","Risk Identification, Rating, Exposure","9"],
    ["08","Strategic Recommendations","Quick Wins · Medium · Long Term","10"],
    ["09","Implementation Roadmap","3-Phase Plan · Milestones · Resources","11"],
    ["10","ROI & Business Case","Investment, Savings, Payback, NPV","12"],
    ["11","ITIL 5 & AI Readiness","Future Proofing · AI Adaptation Steps","13"],
    ["12","Appendix","Full Data, Methodology, Contacts","14"],
  ].map(([num,title,sub,pg])=>`
    <div class="toc-row">
      <div class="toc-num">${num}</div>
      <div style="flex:1;">
        <div style="font-weight:700;color:#1e293b;">${title}</div>
        <div style="font-size:11px;color:#94a3b8;">${sub}</div>
      </div>
      <div class="toc-dots"></div>
      <div style="font-weight:700;color:#003087;font-size:13px;">pg.${pg}</div>
    </div>`).join("")}
  <div class="insight-box" style="margin-top:40px;">
    <h3>📋 How to Read This Report</h3>
    <p>This report uses a 1–5 maturity scale: <strong>1=Initial → 5=Optimizing</strong>. Each of the 34 ITIL 4 practices is scored across five dimensions — Process Existence (PE), Process Consistency (PC), Measurement Maturity (MM), Continuous Improvement (CI), and Tool Integration (TI) — weighted to produce an overall score. Scores below 2.5 indicate significant risk exposure. The target benchmark is <strong>Level 4.0 (Quantitatively Managed)</strong>, consistent with industry-leading organisations.</p>
  </div>
</div>`;


  /* ════════════════ EXECUTIVE BRIEFING ════════════════ */
  const execSummary = `
<div class="section page-break">
  <div class="section-label">Section 01</div>
  <h2>Executive Briefing</h2>
  ${companyProfile ? `
  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px 20px;margin-bottom:20px;display:flex;gap:32px;flex-wrap:wrap;">
    <div><div style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.8px;margin-bottom:4px;">Organisation</div>
      <div style="font-size:15px;font-weight:700;color:#1e293b;">${companyProfile.companyName}</div></div>
    <div><div style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.8px;margin-bottom:4px;">Industry</div>
      <div style="font-size:14px;font-weight:600;color:#334155;">${companyProfile.industry}</div></div>
    <div><div style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.8px;margin-bottom:4px;">Employee Strength</div>
      <div style="font-size:14px;font-weight:600;color:#334155;">${companyProfile.employeeStrength}</div></div>
    ${companyProfile.itsmTools?.length ? `<div><div style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.8px;margin-bottom:4px;">ITSM Tools</div>
      <div style="font-size:13px;color:#334155;">${companyProfile.itsmTools.join(" · ")}</div></div>` : ""}
  </div>` : ""}
  <p style="font-size:15px;color:#334155;font-weight:500;max-width:800px;line-height:1.8;">
    This assessment evaluated <strong>${n} ITIL 4 practices</strong> across General, Service, and Technical Management domains.
    The organisation currently operates at a <strong style="color:${maturityColor(avgScore)}">${maturityLabel(avgScore)} (${avgScore.toFixed(2)}/5.0)</strong> maturity level —
    ${avgScore<2.5?"indicating significant process risk and urgent remediation required.":avgScore<3.5?"indicating an emerging process foundation with notable consistency and measurement gaps.":"indicating a solid foundation with targeted optimisation opportunities ahead."}
  </p>
  <div class="kpi-grid" style="margin:28px 0;">
    <div class="kpi-card" style="border-top:4px solid ${maturityColor(avgScore)};">
      <div class="kpi-val" style="color:${maturityColor(avgScore)}">${avgScore.toFixed(2)}</div>
      <div class="kpi-sub" style="color:${maturityColor(avgScore)}">${maturityLabel(avgScore)}</div>
      <div class="kpi-lbl">Overall Maturity Score</div>
    </div>
    <div class="kpi-card" style="border-top:4px solid #003087;">
      <div class="kpi-val" style="color:#003087">${n}/${PRACTICES.length}</div>
      <div class="kpi-sub">+${PRACTICES.length-n} Pending</div>
      <div class="kpi-lbl">Practices Assessed</div>
    </div>
    <div class="kpi-card" style="border-top:4px solid #ef4444;">
      <div class="kpi-val" style="color:#ef4444">${criticalGaps.length}</div>
      <div class="kpi-sub">Score gap &gt;1.5 vs target</div>
      <div class="kpi-lbl">Critical Gaps</div>
    </div>
    <div class="kpi-card" style="border-top:4px solid #22c55e;">
      <div class="kpi-val" style="color:#22c55e">${aiReadiness}%</div>
      <div class="kpi-sub">vs 65% industry avg</div>
      <div class="kpi-lbl">AI Readiness Index</div>
    </div>
  </div>

  <div class="two-col" style="gap:24px;margin-bottom:24px;">
    <div class="card avoid-break">
      <h3>🎯 Message to the CEO</h3>
      <p>Your ITSM function is the operational backbone of digital service delivery. A score of <strong>${avgScore.toFixed(2)}</strong> places the organisation in the <strong>${maturityLabel(avgScore)}</strong> tier — ${avgScore<3?"below":"at or above"} the industry median of 3.1. The ${criticalGaps.length} critical process gaps represent direct exposure to service disruption, regulatory non-compliance, and reputational risk. Closing these gaps within 18 months is projected to generate <strong>$${(year3Saving/1e6).toFixed(1)}M</strong> in annual efficiency savings and position the enterprise for AI-augmented service operations.</p>
      <p><strong>Recommended CEO Action:</strong> Mandate a Board-sponsored ITSM transformation programme with quarterly progress reporting.</p>
    </div>
    <div class="card avoid-break">
      <h3>⚙️ Message to the CIO</h3>
      <p>The Tool Integration dimension scored <strong>${dimAvgs.TI?.toFixed(2)||"N/A"}</strong> — indicating ${(dimAvgs.TI||1)<2.5?"significant":"moderate"} automation and ITSM platform gaps. Process Consistency at <strong>${dimAvgs.PC?.toFixed(2)||"N/A"}</strong> means standardisation is incomplete, creating shadow processes and rework. Priority investment is required in: unified ITSM platform consolidation, process standardisation playbooks, and metrics dashboards for real-time visibility.</p>
      <p><strong>Recommended CIO Action:</strong> Initiate ITSM tooling RFP within 60 days; establish a Process Excellence Office.</p>
    </div>
  </div>
  <div class="card avoid-break">
    <h3>🔒 Message to the CISO</h3>
    <div style="display:grid;grid-template-columns:2fr 1fr;gap:24px;">
      <p>Information Security Management scored <strong style="color:${maturityColor(scores['info_security_mgmt']||1)}">${(scores['info_security_mgmt']||0).toFixed(2)}</strong>. ${(scores['info_security_mgmt']||0)<3?"This is a critical concern — below Level 3 means security processes are inconsistently applied and likely non-compliant with ISO 27001/NIST frameworks. Immediate remediation is required.":"Security posture is developing, but gaps in measurement maturity (MM: "+((dimScores['info_security_mgmt']?.MM)||0).toFixed(2)+") mean security KPIs and audit trails are insufficient for board-level reporting."} Change Enablement at <strong>${(scores['change_enablement']||0).toFixed(2)}</strong> creates ${(scores['change_enablement']||0)<2.5?"uncontrolled change risk — a leading cause of security incidents":"moderate unauthorised change exposure"}. Risk Management at <strong>${(scores['risk_mgmt']||0).toFixed(2)}</strong>.
      <br/><strong>Recommended CISO Action:</strong> Initiate a security process maturity remediation programme within 30 days; align to ISO 27001 and DORA requirements.</p>
      <div>
        <div style="text-align:center;margin-bottom:8px;font-size:11px;color:#94a3b8;">Security Process Score</div>
        <div style="font-size:48px;font-weight:900;text-align:center;color:${maturityColor(scores['info_security_mgmt']||1)}">${(scores['info_security_mgmt']||0).toFixed(1)}</div>
        <div style="font-size:13px;font-weight:700;text-align:center;color:${maturityColor(scores['info_security_mgmt']||1)}">${maturityLabel(scores['info_security_mgmt']||1)}</div>
      </div>
    </div>
  </div>
</div>`;


  /* ════════════════ METHODOLOGY + CURRENT STATE ════════════════ */
  const methodologyPage = `
<div class="section page-break">
  <div class="section-label">Section 02</div>
  <h2>Assessment Methodology</h2>
  <div class="two-col" style="margin-bottom:24px;">
    <div>
      <h3>Framework Foundation</h3>
      <p>This assessment applies the <strong>ITIL 4 Practice Guide</strong> framework across all 34 ITIL 4 management practices, structured into three domains: General Management (14), Service Management (17), and Technical Management (3). Each practice is evaluated at the assessor's self-declared competency level — Beginner, Practitioner, or Expert — with question sets calibrated to that depth.</p>
      <h3 style="margin-top:16px;">Competency Levels</h3>
      <table style="margin-bottom:0;">
        <tr><th>Level</th><th>Focus</th><th>Questions</th></tr>
        <tr><td><span class="badge" style="background:#dcfce7;color:#15803d;">Beginner</span></td><td>Process existence, basic awareness</td><td>6 per practice</td></tr>
        <tr><td><span class="badge" style="background:#fef9c3;color:#92400e;">Practitioner</span></td><td>Consistency, metrics, working ITIL knowledge</td><td>8 per practice</td></tr>
        <tr><td><span class="badge" style="background:#fee2e2;color:#991b1b;">Expert</span></td><td>Quantitative evidence, failure modes, benchmarks</td><td>10 per practice</td></tr>
      </table>
    </div>
    <div>
      <h3>Dimensional Scoring Model</h3>
      <p>Each question is mapped to one of five maturity dimensions. Responses (Yes / Partial / No) with optional branching follow-ups generate points per dimension. The weighted formula produces the final practice score:</p>
      <div style="background:#f8fafc;border-radius:10px;padding:16px;font-family:monospace;font-size:12px;margin-bottom:12px;">
        <div style="color:#003087;font-weight:700;margin-bottom:6px;">Scoring Formula:</div>
        dimScore = 1 + (earned / max) × 4<br/>
        overall = PE×20% + PC×25% + MM×25%<br/>
        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; + CI×20% + TI×10%
      </div>
      <table>
        ${DIM_KEYS.map(dk=>`<tr>
          <td><strong style="color:${DIMS[dk].color}">${dk}</strong></td>
          <td>${DIMS[dk].label}</td>
          <td style="font-weight:700;text-align:right">${(DIMS[dk].weight*100).toFixed(0)}%</td>
        </tr>`).join("")}
      </table>
    </div>
  </div>
  <div class="insight-box">
    <h3>📊 Maturity Scale Reference</h3>
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-top:8px;">
      ${[["1.0–1.5","Initial","Chaotic, ad-hoc","#ef4444"],["1.5–2.5","Managed","Reactive, inconsistent","#f97316"],["2.5–3.5","Defined","Documented, consistent","#eab308"],["3.5–4.5","Quantitatively\nManaged","Measured, predictable","#009BDE"],["4.5–5.0","Optimizing","Continually improving","#00A94F"]].map(([r,l,d,c])=>`
      <div style="background:rgba(255,255,255,.1);border-radius:8px;padding:12px;border-top:3px solid ${c};">
        <div style="color:#fff;font-size:18px;font-weight:900;">${r}</div>
        <div style="color:#fff;font-weight:700;font-size:12px;margin:4px 0;">${l}</div>
        <div style="color:rgba(255,255,255,.65);font-size:10px;">${d}</div>
      </div>`).join("")}
    </div>
  </div>
</div>`;

  /* ════════════════ CURRENT STATE ════════════════ */
  const barItems = practiceRows.map(p => ({ label:p.name, val:scores[p.id] }));
  const currentStatePage = `
<div class="section page-break">
  <div class="section-label">Section 03</div>
  <h2>Current State Analysis</h2>
  <div class="kpi-grid" style="margin-bottom:24px;">
    ${GROUPS.map(g=>{const av=groupAvg[g]||0;return`
    <div class="kpi-card" style="border-top:4px solid ${maturityColor(av)};">
      <div class="kpi-val" style="color:${maturityColor(av)}">${av.toFixed(2)}</div>
      <div class="kpi-sub" style="color:${maturityColor(av)}">${maturityLabel(av)}</div>
      <div class="kpi-lbl">${g}</div>
    </div>`;}).join("")}
    <div class="kpi-card" style="border-top:4px solid #64748b;">
      <div class="kpi-val">${n}</div>
      <div class="kpi-sub">of ${PRACTICES.length} practices</div>
      <div class="kpi-lbl">Assessment Coverage</div>
    </div>
  </div>

  <div class="two-col" style="margin-bottom:24px;">
    <div class="card avoid-break">
      <h3>Maturity Distribution</h3>
      ${Object.entries(matDist).map(([label,count])=>{
        const colors={"Initial":"#ef4444","Managed":"#f97316","Defined":"#eab308","Quantitatively Managed":"#009BDE","Optimizing":"#00A94F"};
        const pct=n>0?Math.round(count/n*100):0;
        return `<div style="margin-bottom:12px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
            <span style="font-size:12px;font-weight:600;color:#334155;">${label}</span>
            <span style="font-size:12px;font-weight:700;color:${colors[label]}">${count} practices (${pct}%)</span>
          </div>
          <div class="bar-bg"><div class="bar-fill" style="width:${pct}%;background:${colors[label]};"></div></div>
        </div>`;}).join("")}
    </div>
    <div class="card avoid-break">
      <h3>Benchmark Comparison</h3>
      ${[["Your Organisation",avgScore],["Industry Average",3.1],["ITIL Leaders (Top 25%)",4.2],["World Class Target",4.5]].map(([label,val],i)=>`
      <div style="margin-bottom:14px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
          <span style="font-size:12px;font-weight:${i===0?"700":"500"};color:${i===0?"#1e293b":"#475569"}">${label}</span>
          <span style="font-size:12px;font-weight:700;color:${i===0?maturityColor(val):"#64748b"}">${val.toFixed(1)}</span>
        </div>
        <div class="bar-bg"><div class="bar-fill" style="width:${((val-1)/4)*100}%;background:${i===0?maturityColor(val):"#cbd5e1"};opacity:${i===0?1:0.6};"></div></div>
      </div>`).join("")}
      <div class="highlight-box" style="background:#fef9c3;border:1px solid #fde047;margin-top:12px;">
        <div class="highlight-icon">📌</div>
        <div style="font-size:12px;color:#713f12;"><strong>Gap to Industry Average:</strong> ${Math.max(0,3.1-avgScore).toFixed(2)} points. Closing this gap would move the organisation from ${maturityLabel(avgScore)} to ${maturityLabel(Math.min(5,avgScore+0.5))} tier.</div>
      </div>
    </div>
  </div>

  <div class="card avoid-break">
    <h3>Practice Score Overview — All Assessed Practices</h3>
    <div style="overflow:hidden;">
      ${hBarSVG(barItems, 680)}
    </div>
  </div>
</div>`;


  /* ════════════════ DIMENSIONAL ANALYSIS ════════════════ */
  const dimensionalPage = `
<div class="section page-break">
  <div class="section-label">Section 04</div>
  <h2>Dimensional Analysis</h2>
  <p>Each practice is scored across five weighted dimensions. Dimensional analysis reveals <em>where</em> maturity is strong or weak — independent of overall practice scores. This guides targeted investment decisions.</p>
  <div class="two-col" style="margin-bottom:24px;">
    <div class="card avoid-break" style="text-align:center;">
      <h3>Dimensional Radar Profile</h3>
      ${radarSVG(dimAvgs, 300, 300)}
    </div>
    <div class="card avoid-break">
      <h3>Dimension Scores vs Target</h3>
      ${DIM_KEYS.map(dk=>{
        const v=dimAvgs[dk]||1; const gap=Math.max(0,TARGET-v);
        return `<div style="margin-bottom:18px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
            <div>
              <span style="font-weight:800;color:${DIMS[dk].color};font-size:14px;">${dk}</span>
              <span style="font-size:11px;color:#64748b;margin-left:8px;">${DIMS[dk].label}</span>
              <span style="font-size:10px;color:#94a3b8;margin-left:8px;">Weight: ${(DIMS[dk].weight*100).toFixed(0)}%</span>
            </div>
            <span style="font-weight:900;font-size:16px;color:${DIMS[dk].color}">${v.toFixed(2)}</span>
          </div>
          <div style="background:#f1f5f9;border-radius:999px;height:12px;overflow:hidden;position:relative;">
            <div style="position:absolute;left:0;top:0;height:100%;width:${((v-1)/4)*100}%;background:${DIMS[dk].color};border-radius:999px;"></div>
            <div style="position:absolute;left:${((TARGET-1)/4)*100}%;top:-2px;height:calc(100%+4px);width:2px;background:#1e293b;opacity:.5;"></div>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:10px;color:#94a3b8;margin-top:3px;">
            <span>${maturityLabel(v)}</span>
            <span style="color:${gap>0.5?"#dc2626":"#15803d"}">${gap>0?"Gap: "+gap.toFixed(2)+" ↑ target":"✓ On target"}</span>
          </div>
        </div>`;}).join("")}
    </div>
  </div>

  <!-- Per-dimension practice breakdown -->
  ${DIM_KEYS.map(dk=>{
    const sorted=[...practiceRows].sort((a,b)=>(dimScores[b.id]?.[dk]||0)-(dimScores[a.id]?.[dk]||0));
    const topN=sorted.slice(0,3); const botN=[...sorted].reverse().slice(0,3);
    return `<div class="card avoid-break" style="margin-bottom:16px;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
        <div style="width:40px;height:40px;border-radius:10px;background:${DIMS[dk].color}22;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:16px;color:${DIMS[dk].color}">${dk}</div>
        <div>
          <div style="font-weight:800;color:#1e293b;font-size:14px;">${DIMS[dk].label}</div>
          <div style="font-size:11px;color:#64748b;">Organisation average: <strong style="color:${DIMS[dk].color}">${(dimAvgs[dk]||1).toFixed(2)}</strong> · Weight: ${(DIMS[dk].weight*100).toFixed(0)}% of overall score</div>
        </div>
        <div style="margin-left:auto;font-size:28px;font-weight:900;color:${DIMS[dk].color}">${(dimAvgs[dk]||1).toFixed(2)}</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        <div>
          <div style="font-size:10px;font-weight:700;color:#15803d;margin-bottom:6px;text-transform:uppercase;letter-spacing:.8px;">✓ Strongest Practices</div>
          ${topN.map(p=>`<div style="display:flex;justify-content:space-between;font-size:11px;padding:4px 0;border-bottom:1px solid #f1f5f9;">
            <span>${p.name}</span><strong style="color:${DIMS[dk].color}">${(dimScores[p.id]?.[dk]||1).toFixed(2)}</strong></div>`).join("")}
        </div>
        <div>
          <div style="font-size:10px;font-weight:700;color:#dc2626;margin-bottom:6px;text-transform:uppercase;letter-spacing:.8px;">⚠ Weakest Practices</div>
          ${botN.map(p=>`<div style="display:flex;justify-content:space-between;font-size:11px;padding:4px 0;border-bottom:1px solid #f1f5f9;">
            <span>${p.name}</span><strong style="color:#ef4444">${(dimScores[p.id]?.[dk]||1).toFixed(2)}</strong></div>`).join("")}
        </div>
      </div>
    </div>`;}).join("")}
</div>`;


  /* ════════════════ PRACTICE HEATMAP ════════════════ */
  const heatmapPage = `
<div class="section page-break">
  <div class="section-label">Section 05</div>
  <h2>Practice Performance Heatmap</h2>
  <p>All 34 ITIL 4 practices mapped by score and group. Colour indicates maturity level. Grey = not yet assessed.</p>
  <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px;">
    ${[["Initial (<1.5)","#ef4444"],["Managed (1.5–2.5)","#f97316"],["Defined (2.5–3.5)","#eab308"],["Quant. Managed (3.5–4.5)","#009BDE"],["Optimizing (>4.5)","#00A94F"],["Not Assessed","#e2e8f0"]].map(([l,c])=>
      `<div style="display:flex;align-items:center;gap:6px;font-size:11px;">
        <div style="width:14px;height:14px;border-radius:3px;background:${c};flex-shrink:0;"></div>${l}</div>`).join("")}
  </div>
  ${GROUPS.map(g=>{
    const gp=PRACTICES.filter(p=>p.group===g);
    const av=groupAvg[g]||0;
    return `<div style="margin-bottom:24px;" class="avoid-break">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
        <h3 style="margin:0;">${g}</h3>
        <span class="badge" style="background:${maturityColor(av)}22;color:${maturityColor(av)};font-size:11px;">Avg ${av.toFixed(2)} — ${maturityLabel(av)}</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;">
        ${gp.map(p=>{
          const sc=scores[p.id]; const dim=dimScores[p.id]||{};
          const col=sc!=null?maturityColor(sc):"#94a3b8";
          const bg=sc!=null?maturityColor(sc)+"18":"#f8fafc";
          return `<div style="background:${bg};border:2px solid ${sc!=null?maturityColor(sc)+"55":"#e2e8f0"};border-radius:10px;padding:12px;position:relative;overflow:hidden;">
            <div style="font-size:11px;font-weight:700;color:${col};margin-bottom:4px;">${sc!=null?sc.toFixed(2):"N/A"}</div>
            <div style="font-size:11px;font-weight:600;color:#1e293b;line-height:1.3;margin-bottom:6px;">${p.name}</div>
            ${sc!=null?`<div style="display:flex;gap:3px;flex-wrap:wrap;">${DIM_KEYS.map(dk=>
              `<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:${DIMS[dk].color}22;color:${DIMS[dk].color};font-weight:700;">${dk}:${(dim[dk]||1).toFixed(1)}</span>`).join("")}</div>
              <div style="font-size:9px;color:${col};margin-top:4px;font-weight:700;">${maturityLabel(sc)}</div>`
              :`<div style="font-size:9px;color:#94a3b8;">Not assessed</div>`}
          </div>`;}).join("")}
      </div>
    </div>`;}).join("")}
</div>`;

  /* ════════════════ GAP ANALYSIS ════════════════ */
  const gapPage = `
<div class="section page-break">
  <div class="section-label">Section 06</div>
  <h2>Gap Analysis</h2>
  <p>Target benchmark: <strong>Level 4.0 (Quantitatively Managed)</strong> — consistent with top-quartile ITSM organisations and mandatory for AI-augmented operations. Gaps are calculated as Target (4.0) minus Current Score.</p>

  <div class="three-col" style="margin-bottom:24px;">
    <div class="card" style="border-top:4px solid #ef4444;">
      <div style="font-size:28px;font-weight:900;color:#ef4444;">${criticalGaps.length}</div>
      <div style="font-weight:700;color:#1e293b;margin:4px 0;">Critical Gaps</div>
      <div style="font-size:11px;color:#64748b;">Gap &gt; 1.5 — Immediate action required</div>
    </div>
    <div class="card" style="border-top:4px solid #f97316;">
      <div style="font-size:28px;font-weight:900;color:#f97316;">${medGaps.length}</div>
      <div style="font-weight:700;color:#1e293b;margin:4px 0;">Moderate Gaps</div>
      <div style="font-size:11px;color:#64748b;">Gap 0.5–1.5 — Prioritised improvement</div>
    </div>
    <div class="card" style="border-top:4px solid #22c55e;">
      <div style="font-size:28px;font-weight:900;color:#22c55e;">${onTarget.length}</div>
      <div style="font-weight:700;color:#1e293b;margin:4px 0;">On/Near Target</div>
      <div style="font-size:11px;color:#64748b;">Gap ≤ 0.5 — Maintain and optimise</div>
    </div>
  </div>

  <table class="avoid-break">
    <thead>
      <tr><th>Priority</th><th>Practice</th><th>Group</th><th>Current</th><th>Target</th><th>Gap</th><th>Worst Dimension</th><th>Category</th></tr>
    </thead>
    <tbody>
    ${gapRows.slice(0,20).map((r,i)=>{
      const worstDk=DIM_KEYS.reduce((b,dk)=>(r.dim[dk]||1)<(r.dim[b]||1)?dk:b,DIM_KEYS[0]);
      const severity=r.gap>1.5?"critical":r.gap>0.5?"moderate":"on-target";
      const sevColors={critical:"#ef4444",moderate:"#f97316","on-target":"#22c55e"};
      return `<tr>
        <td><span style="background:${sevColors[severity]}22;color:${sevColors[severity]};font-weight:700;padding:2px 8px;border-radius:10px;font-size:10px;">${i+1}</span></td>
        <td style="font-weight:600;">${r.name}</td>
        <td style="font-size:11px;color:#64748b;">${r.group.replace(" Management","")}</td>
        <td><strong style="color:${maturityColor(r.sc)}">${r.sc.toFixed(2)}</strong></td>
        <td style="color:#003087;font-weight:600;">4.00</td>
        <td><strong style="color:${sevColors[severity]}">${r.gap>0?"+"+r.gap.toFixed(2):"✓"}</strong></td>
        <td><span style="color:${DIMS[worstDk]?.color};font-weight:700;">${worstDk}</span> <span style="font-size:10px;color:#94a3b8;">${(r.dim[worstDk]||1).toFixed(2)}</span></td>
        <td style="font-size:11px;color:#64748b;">${r.group.includes("Service")?"Service":r.group.includes("Technical")?"Tech":"General"}</td>
      </tr>`;}).join("")}
    </tbody>
  </table>

  ${criticalGaps.length>0?`<div class="highlight-box" style="background:#fee2e2;border:1px solid #fecaca;margin-top:20px;">
    <div class="highlight-icon">🚨</div>
    <div>
      <strong style="color:#991b1b;">Critical Gap Alert:</strong>
      <div style="font-size:12px;color:#7f1d1d;margin-top:4px;">
        ${criticalGaps.slice(0,3).map(r=>`<strong>${r.name}</strong> (${r.sc.toFixed(2)} — gap: ${r.gap.toFixed(2)})`).join(", ")} ${criticalGaps.length>3?`and ${criticalGaps.length-3} more`:""}
        represent the highest-priority remediation targets. These practices fall below Level 2.5 (Defined) and expose the organisation to operational, regulatory, and security risk.
      </div>
    </div>
  </div>`:""}
</div>`;


  /* ════════════════ RISK REGISTER ════════════════ */
  const riskPage = `
<div class="section page-break">
  <div class="section-label">Section 07</div>
  <h2>Risk Register</h2>
  <p>Risks are auto-derived from maturity gaps and dimensional weaknesses. Rating = Likelihood × Impact (1–4 scale). Ratings ≥12 are Critical; 8–11 are High; below 8 are Medium.</p>

  <div class="two-col" style="margin-bottom:24px;">
    <div class="card avoid-break">
      <h3>Risk Exposure Matrix</h3>
      ${riskMatrixSVG(topRisks)}
      <div style="margin-top:12px;">
        <div style="font-size:10px;font-weight:700;color:#94a3b8;margin-bottom:8px;text-transform:uppercase;">Legend</div>
        ${topRisks.slice(0,8).map((r,i)=>`<div style="font-size:10px;padding:2px 0;color:#475569;"><strong style="color:${r.rating>=12?"#dc2626":r.rating>=8?"#f97316":"#eab308"}">${i+1}</strong> ${r.practice} — ${r.risk.slice(0,50)}${r.risk.length>50?"…":""}</div>`).join("")}
      </div>
    </div>
    <div>
      <div class="card" style="margin-bottom:16px;">
        <h3>Risk Summary</h3>
        ${[["Critical (≥12)","#dc2626",topRisks.filter(r=>r.rating>=12).length],["High (8–11)","#f97316",topRisks.filter(r=>r.rating>=8&&r.rating<12).length],["Medium (<8)","#eab308",topRisks.filter(r=>r.rating<8).length]].map(([l,c,count])=>`
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #f1f5f9;">
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="width:10px;height:10px;border-radius:2px;background:${c};"></div>
            <span style="font-size:12px;">${l}</span>
          </div>
          <strong style="color:${c};font-size:16px;">${count}</strong>
        </div>`).join("")}
        <div style="font-size:11px;color:#64748b;margin-top:12px;">Total risks identified: <strong>${topRisks.length}</strong></div>
      </div>
      <div class="highlight-box" style="background:#fee2e2;border:1px solid #fecaca;">
        <div class="highlight-icon">⚡</div>
        <div>
          <strong style="color:#991b1b;">Highest Priority Risk</strong>
          <p style="color:#7f1d1d;font-size:12px;margin-top:4px;">${topRisks[0]?.risk||"No critical risks identified"} — <em>${topRisks[0]?.practice||""}</em></p>
        </div>
      </div>
    </div>
  </div>

  <h3>Top Risk Register</h3>
  <table>
    <thead>
      <tr><th>#</th><th>Risk Description</th><th>Practice</th><th>Category</th><th>Likelihood</th><th>Impact</th><th>Rating</th><th>Mitigation Priority</th></tr>
    </thead>
    <tbody>
    ${topRisks.map((r,i)=>{
      const sev=r.rating>=12?"Critical":r.rating>=8?"High":"Medium";
      const sevCol=r.rating>=12?"#dc2626":r.rating>=8?"#f97316":"#eab308";
      return `<tr>
        <td style="font-weight:700;color:#64748b;">${i+1}</td>
        <td style="font-size:11px;">${r.risk}</td>
        <td style="font-size:11px;color:#64748b;">${r.practice}</td>
        <td><span class="badge" style="background:${sevCol}22;color:${sevCol};">${r.cat}</span></td>
        <td style="font-size:11px;">${r.likelihood}</td>
        <td style="font-size:11px;">${r.impact}</td>
        <td><span class="badge" style="background:${sevCol}22;color:${sevCol};font-size:11px;">${r.rating} — ${sev}</span></td>
        <td style="font-size:11px;color:#64748b;">${sev==="Critical"?"Immediate (0–30d)":sev==="High"?"Short-term (30–90d)":"Planned (90–180d)"}</td>
      </tr>`;}).join("")}
    </tbody>
  </table>
</div>`;

  /* ════════════════ STRATEGIC RECOMMENDATIONS ════════════════ */
  const recsPage = `
<div class="section page-break">
  <div class="section-label">Section 08</div>
  <h2>Strategic Recommendations</h2>
  <p>Recommendations are derived directly from gap analysis and risk scoring. They are sequenced to maximise risk reduction while building on each prior phase.</p>

  <!-- Quick Wins -->
  <h3 style="color:#dc2626;margin-bottom:12px;">🔴 Phase 1: Quick Wins (0–90 Days) — Foundation & Risk Reduction</h3>
  ${[
    { title:"Establish ITSM Governance Council", desc:"Appoint an IT Process Owner for each critical practice. Define RACI for all processes scoring below 2.5. Hold weekly governance reviews for the first 90 days.", owner:"CIO", effort:"Low", impact:"Critical" },
    { title:"Document and Activate Critical Processes", desc:`Immediately document formal processes for the ${criticalGaps.slice(0,2).map(g=>g.name).join(" and ")} practices. Apply ITIL 4 practice guides as templates. Mandatory sign-off by practice owners within 30 days.`, owner:"Process Owners", effort:"Medium", impact:"Critical" },
    { title:"Baseline KPI Dashboard", desc:"Implement a minimum viable metrics dashboard covering the 5 dimensions. Target: 100% of assessed practices have at least 3 active KPIs within 60 days. Use ServiceNow/Jira dashboards or Power BI.", owner:"ITSM Tooling Team", effort:"Medium", impact:"High" },
    { title:"Security & Change Control Emergency Review", desc:"Conduct an emergency review of Change Enablement and Information Security Management processes. Implement emergency change freeze or CAB oversight for all changes until processes are formalised.", owner:"CISO + Change Manager", effort:"Low", impact:"Critical" },
    { title:"Staff Awareness & ITIL Foundation Training", desc:"Mandate ITIL 4 Foundation training for all IT staff. Prioritise practice owners. Training completion target: 80% within 90 days. Partner with TCS Academy for accelerated delivery.", owner:"HR + IT Leadership", effort:"Low", impact:"High" },
  ].map(r=>`<div class="rec-card" style="background:#fff7f7;border-color:#dc2626;margin-bottom:10px;" class="avoid-break">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;">
      <strong style="color:#1e293b;font-size:13px;">${r.title}</strong>
      <div style="display:flex;gap:6px;flex-shrink:0;margin-left:12px;">
        <span class="badge" style="background:#fee2e2;color:#dc2626;">${r.impact}</span>
        <span class="badge" style="background:#f1f5f9;color:#475569;">${r.effort} Effort</span>
      </div>
    </div>
    <p style="margin:6px 0 4px;font-size:12px;color:#475569;">${r.desc}</p>
    <div style="font-size:11px;color:#94a3b8;"><strong>Owner:</strong> ${r.owner}</div>
  </div>`).join("")}

  <!-- Medium Term -->
  <h3 style="color:#f97316;margin-top:24px;margin-bottom:12px;">🟡 Phase 2: Standardisation (3–12 Months) — Consistency & Metrics</h3>
  ${[
    { title:"ITSM Platform Consolidation", desc:"Rationalise ITSM tooling to a single enterprise platform (ServiceNow, BMC Helix, or equivalent). Implement automated workflows for the 10 highest-volume practices. Target: 40% reduction in manual process steps.", owner:"CIO + Architecture", effort:"High", impact:"High" },
    { title:"Process Consistency Programme", desc:"Roll out standardised process playbooks for all 34 practices. Implement process adherence measurement (target: >85% conformance). Conduct quarterly process audits with remediation tracking.", owner:"Process Excellence Office", effort:"High", impact:"High" },
    { title:"Metrics & Reporting Framework", desc:"Establish a comprehensive ITSM metrics framework aligned to business outcomes. Target: monthly executive dashboard, quarterly board report, real-time operational visibility. KPIs: MTTR, MTBF, Change Success Rate, SLA%, First Contact Resolution.", owner:"Head of ITSM", effort:"Medium", impact:"High" },
    { title:"Service Catalogue & SLM Maturity", desc:"Publish a fully automated, customer-facing service catalogue. Implement Service Level Management with formal SLAs for all Tier 1 services. Target: 95% SLA achievement within 6 months of deployment.", owner:"Service Management Lead", effort:"Medium", impact:"High" },
    { title:"Supplier & Risk Integration", desc:"Integrate supplier performance data into ITSM workflows. Establish formal risk registers with quarterly review cycles. Link supplier KPIs to contract management.", owner:"Supplier Manager + Risk Lead", effort:"Medium", impact:"Medium" },
  ].map(r=>`<div class="rec-card" style="background:#fffbeb;border-color:#f97316;margin-bottom:10px;" class="avoid-break">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;">
      <strong style="color:#1e293b;font-size:13px;">${r.title}</strong>
      <div style="display:flex;gap:6px;flex-shrink:0;margin-left:12px;">
        <span class="badge" style="background:#fff7ed;color:#f97316;">${r.impact}</span>
        <span class="badge" style="background:#f1f5f9;color:#475569;">${r.effort} Effort</span>
      </div>
    </div>
    <p style="margin:6px 0 4px;font-size:12px;color:#475569;">${r.desc}</p>
    <div style="font-size:11px;color:#94a3b8;"><strong>Owner:</strong> ${r.owner}</div>
  </div>`).join("")}

  <!-- Long Term -->
  <h3 style="color:#22c55e;margin-top:24px;margin-bottom:12px;">🟢 Phase 3: Optimisation (12–24 Months) — Continual Improvement & AI</h3>
  ${[
    { title:"Continual Improvement Culture", desc:"Establish a formal CI Board with monthly improvement sprints. Implement improvement tracking in ITSM tooling. Target: 20+ improvements registered and actioned per quarter. Align to CSI register in ServiceNow.", owner:"ITSM Practice Lead", effort:"Medium", impact:"High" },
    { title:"AI-Augmented Service Operations", desc:"Deploy AI/ML for: incident classification and auto-routing, predictive problem identification, intelligent knowledge base (KBAI), and automated change risk scoring. Target: 30% reduction in MTTR, 25% reduction in recurring incidents.", owner:"CIO + Data & AI Team", effort:"High", impact:"Critical" },
    { title:"Quantitative Management Implementation", desc:"Move from descriptive to predictive analytics. Implement statistical process control for critical practices. Target: 90% of practices achieve Level 4 (Quantitatively Managed) by Month 24.", owner:"Head of ITSM", effort:"High", impact:"High" },
    { title:"ITIL 5 / AI-Ready Process Architecture", desc:"Redesign process flows to accommodate AI co-pilots, automated approvals, and real-time decision support. Align to ITIL 5 working group publications. Pilot AI-assisted Change Enablement and Incident Management.", owner:"Architecture + ITSM", effort:"High", impact:"High" },
  ].map(r=>`<div class="rec-card" style="background:#f0fdf4;border-color:#22c55e;margin-bottom:10px;" class="avoid-break">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;">
      <strong style="color:#1e293b;font-size:13px;">${r.title}</strong>
      <div style="display:flex;gap:6px;flex-shrink:0;margin-left:12px;">
        <span class="badge" style="background:#dcfce7;color:#15803d;">${r.impact}</span>
        <span class="badge" style="background:#f1f5f9;color:#475569;">${r.effort} Effort</span>
      </div>
    </div>
    <p style="margin:6px 0 4px;font-size:12px;color:#475569;">${r.desc}</p>
    <div style="font-size:11px;color:#94a3b8;"><strong>Owner:</strong> ${r.owner}</div>
  </div>`).join("")}
</div>`;


  /* ════════════════ ROADMAP ════════════════ */
  const roadmapPage = `
<div class="section page-break">
  <div class="section-label">Section 09</div>
  <h2>Implementation Roadmap</h2>
  <p>A structured 24-month transformation journey from current state (${maturityLabel(avgScore)} — ${avgScore.toFixed(2)}) to target state (Quantitatively Managed — 4.0+). Each phase builds on the prior, with measurable milestones and governance checkpoints.</p>

  ${roadmapSVG()}

  <div class="three-col" style="margin-top:24px;margin-bottom:24px;">
    ${[
      { phase:"Phase 1: Foundation", dur:"0–3 Months", col:"#ef4444", icon:"🏗️",
        goal:"Stabilise critical risks, establish governance, document processes",
        milestones:["Governance Council established","All critical processes documented","KPI baseline published","ITIL Foundation training underway","Emergency security controls in place"],
        kpis:["% processes formally documented","# KPIs activated","# staff trained","Risk rating reduced from Critical"],
        resource:"2–3 ITSM consultants + internal process owners" },
      { phase:"Phase 2: Standardisation", dur:"3–12 Months", col:"#f97316", icon:"⚙️",
        goal:"Achieve consistency, consolidate tooling, implement measurement framework",
        milestones:["ITSM platform selected & deployed","Process playbooks rolled out","SLA framework operational","Supplier KPI dashboard live","Monthly exec dashboard launched"],
        kpis:["Process conformance >85%","SLA achievement rate","Tooling consolidation %","MTTR reduction %"],
        resource:"5–8 FTE including platform engineers, process analysts" },
      { phase:"Phase 3: Optimisation", dur:"12–24 Months", col:"#22c55e", icon:"🚀",
        goal:"Quantitative management, AI integration, ITIL 5 readiness",
        milestones:["AI incident classification live","Predictive problem detection","CI Board operating","90% practices at L4","ITIL 5 pilot complete"],
        kpis:["MTTR −30%","Incidents −25%","Score: 4.0+ overall","AI adoption: 5+ use cases"],
        resource:"3–5 FTE + AI/ML specialist + TCS AI Practice" },
    ].map(ph=>`<div style="background:#fff;border-radius:12px;padding:20px;border-top:4px solid ${ph.col};border:1px solid #e2e8f0;box-shadow:0 1px 4px rgba(0,0,0,.06);" class="avoid-break">
      <div style="font-size:22px;margin-bottom:8px;">${ph.icon}</div>
      <div style="font-weight:800;color:#1e293b;font-size:13px;margin-bottom:4px;">${ph.phase}</div>
      <div style="font-size:11px;color:${ph.col};font-weight:700;margin-bottom:8px;">${ph.dur}</div>
      <div style="font-size:11px;color:#475569;margin-bottom:12px;font-style:italic;">${ph.goal}</div>
      <div style="font-size:10px;font-weight:700;color:#94a3b8;margin-bottom:6px;text-transform:uppercase;letter-spacing:.8px;">Key Milestones</div>
      ${ph.milestones.map(m=>`<div style="font-size:11px;color:#334155;padding:3px 0;border-bottom:1px solid #f8fafc;">▸ ${m}</div>`).join("")}
      <div style="font-size:10px;font-weight:700;color:#94a3b8;margin:10px 0 6px;text-transform:uppercase;letter-spacing:.8px;">Success KPIs</div>
      ${ph.kpis.map(k=>`<div style="font-size:11px;color:#64748b;padding:2px 0;">✓ ${k}</div>`).join("")}
      <div style="font-size:10px;color:#94a3b8;margin-top:10px;padding-top:8px;border-top:1px solid #f1f5f9;"><strong>Resources:</strong> ${ph.resource}</div>
    </div>`).join("")}
  </div>

  <!-- Governance checkpoints -->
  <div class="card avoid-break">
    <h3>Governance & Reporting Cadence</h3>
    <table>
      <thead><tr><th>Cadence</th><th>Forum</th><th>Agenda</th><th>Audience</th></tr></thead>
      <tbody>
        <tr><td>Weekly</td><td>ITSM Ops Review</td><td>Risk items, process adherence, incident trends</td><td>Process Owners, ITSM Lead</td></tr>
        <tr><td>Monthly</td><td>IT Steering Committee</td><td>Maturity progress, KPI dashboard, budget burn</td><td>CIO, Heads of IT</td></tr>
        <tr><td>Quarterly</td><td>Board Technology Committee</td><td>Transformation progress, risk posture, ROI tracking</td><td>CEO, CIO, CISO, Board</td></tr>
        <tr><td>6-Monthly</td><td>Formal Re-Assessment</td><td>Full ITIL 4 maturity re-score, benchmark update</td><td>CIO, TCS Consultants</td></tr>
      </tbody>
    </table>
  </div>
</div>`;

  /* ════════════════ ROI ════════════════ */
  const roiPage = `
<div class="section page-break">
  <div class="section-label">Section 10</div>
  <h2>Return on Investment & Business Case</h2>
  <p>ROI projections are modelled on industry benchmarks for ITSM transformation programmes of comparable scope. Figures should be validated against organisational headcount and incident volumes during programme scoping.</p>

  <div class="kpi-grid" style="margin-bottom:24px;">
    <div class="kpi-card" style="border-top:4px solid #003087;">
      <div class="kpi-val" style="color:#003087;">$${(implCost/1e6).toFixed(1)}M</div>
      <div class="kpi-sub">Total Investment</div>
      <div class="kpi-lbl">Programme cost (3yr)</div>
    </div>
    <div class="kpi-card" style="border-top:4px solid #22c55e;">
      <div class="kpi-val" style="color:#22c55e;">$${(totalBenefit/1e6).toFixed(1)}M</div>
      <div class="kpi-sub">3-Year Benefits</div>
      <div class="kpi-lbl">Cumulative savings</div>
    </div>
    <div class="kpi-card" style="border-top:4px solid #f97316;">
      <div class="kpi-val" style="color:#f97316;">${roi3yr}%</div>
      <div class="kpi-sub">3-Year ROI</div>
      <div class="kpi-lbl">Net return on investment</div>
    </div>
    <div class="kpi-card" style="border-top:4px solid #009BDE;">
      <div class="kpi-val" style="color:#009BDE;">${paybackMonths}mo</div>
      <div class="kpi-sub">Payback Period</div>
      <div class="kpi-lbl">Break-even point</div>
    </div>
  </div>

  <div class="two-col" style="margin-bottom:24px;">
    <div class="card avoid-break">
      <h3>3-Year Cumulative Benefit vs Investment</h3>
      ${roiChartSVG(year1Saving,year2Saving,year3Saving,implCost,460,200)}
      <div style="font-size:11px;color:#64748b;margin-top:8px;text-align:center;">Green area = cumulative benefit. Red area = investment cost. Intersection = break-even.</div>
    </div>
    <div class="card avoid-break">
      <h3>Benefit Breakdown</h3>
      ${[
        ["Staff Productivity Gains",Math.round(annualSaving*0.45),"Reduced manual effort, rework elimination"],
        ["Incident Cost Avoidance",Math.round(annualSaving*0.25),"Faster resolution, reduced escalations"],
        ["Change Failure Reduction",Math.round(annualSaving*0.15),"Fewer failed changes, rollback costs"],
        ["Audit & Compliance Savings",Math.round(annualSaving*0.10),"Automated evidence, reduced audit prep"],
        ["Tooling Consolidation",Math.round(annualSaving*0.05),"Licence rationalisation, support costs"],
      ].map(([label,val,note])=>`<div style="margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
          <span style="font-size:12px;font-weight:600;color:#334155;">${label}</span>
          <span style="font-size:12px;font-weight:700;color:#15803d;">$${(val/1e3).toFixed(0)}K/yr</span>
        </div>
        <div style="font-size:10px;color:#94a3b8;margin-bottom:4px;">${note}</div>
        <div class="bar-bg"><div class="bar-fill" style="width:${Math.round(val/annualSaving*100)}%;background:#22c55e;"></div></div>
      </div>`).join("")}
      <div style="border-top:2px solid #e2e8f0;padding-top:10px;margin-top:4px;display:flex;justify-content:space-between;">
        <strong style="font-size:13px;">Total Annual Savings (Yr 3)</strong>
        <strong style="font-size:14px;color:#15803d;">$${(annualSaving/1e3).toFixed(0)}K</strong>
      </div>
    </div>
  </div>

  <div class="card avoid-break">
    <h3>Year-by-Year Financial Projection</h3>
    <table>
      <thead><tr><th>Year</th><th>Investment</th><th>Benefit (Year)</th><th>Cumulative Benefit</th><th>Net Position</th><th>ROI (Cumulative)</th></tr></thead>
      <tbody>
        <tr><td style="color:#64748b;">Year 0 (Q4)</td><td style="color:#dc2626;">$${(implCost*0.4/1e3).toFixed(0)}K</td><td>—</td><td>—</td><td style="color:#dc2626;">-$${(implCost*0.4/1e3).toFixed(0)}K</td><td style="color:#dc2626;">N/A</td></tr>
        <tr><td>Year 1</td><td style="color:#dc2626;">$${(implCost*0.4/1e3).toFixed(0)}K</td><td style="color:#15803d;">$${(year1Saving/1e3).toFixed(0)}K</td><td style="color:#15803d;">$${(year1Saving/1e3).toFixed(0)}K</td><td style="color:${year1Saving-implCost*0.8>0?"#15803d":"#dc2626"};">$${((year1Saving-implCost*0.8)/1e3).toFixed(0)}K</td><td>${Math.round((year1Saving-implCost*0.8)/implCost*100)}%</td></tr>
        <tr><td>Year 2</td><td style="color:#dc2626;">$${(implCost*0.2/1e3).toFixed(0)}K</td><td style="color:#15803d;">$${(year2Saving/1e3).toFixed(0)}K</td><td style="color:#15803d;">$${((year1Saving+year2Saving)/1e3).toFixed(0)}K</td><td style="color:#15803d;">$${((year1Saving+year2Saving-implCost)/1e3).toFixed(0)}K</td><td style="color:#15803d;">${Math.round((year1Saving+year2Saving-implCost)/implCost*100)}%</td></tr>
        <tr><td><strong>Year 3</strong></td><td style="color:#94a3b8;">$${(implCost*0.0/1e3).toFixed(0)}K</td><td style="color:#15803d;"><strong>$${(year3Saving/1e3).toFixed(0)}K</strong></td><td style="color:#15803d;"><strong>$${(totalBenefit/1e3).toFixed(0)}K</strong></td><td style="color:#15803d;"><strong>$${((totalBenefit-implCost)/1e3).toFixed(0)}K</strong></td><td style="color:#15803d;"><strong>${roi3yr}%</strong></td></tr>
      </tbody>
    </table>
  </div>
</div>`;


  /* ════════════════ ITIL 5 / AI READINESS ════════════════ */
  const itil5Page = `
<div class="section page-break">
  <div class="section-label">Section 11</div>
  <h2>ITIL 5 & Artificial Intelligence Readiness</h2>

  <div class="insight-box" style="margin-bottom:28px;">
    <h3>📡 The AI Transformation of ITSM Is Already Here</h3>
    <p>ITIL 5 (anticipated 2025–2026) is expected to formalise AI as a core component of service management — embedding machine learning in decision making, automation in process execution, and natural language in service interaction. Organisations that achieve ITIL 4 Level 4+ maturity <em>now</em> will have the process discipline required to harness AI safely and at scale. Those that do not will find AI amplifies their existing process failures.</p>
  </div>

  <div class="two-col" style="margin-bottom:28px;">
    <div class="card avoid-break">
      <h3>Your AI Readiness Score</h3>
      <div style="text-align:center;padding:24px 0;">
        <div style="font-size:64px;font-weight:900;color:${aiReadiness>=70?"#22c55e":aiReadiness>=50?"#f97316":"#ef4444"};">${aiReadiness}%</div>
        <div style="font-size:14px;font-weight:700;color:${aiReadiness>=70?"#15803d":aiReadiness>=50?"#92400e":"#991b1b"};">${aiReadiness>=70?"AI Ready":"AI Foundation Required"}</div>
        <div style="font-size:12px;color:#64748b;margin-top:8px;">Industry average: 52% · Leaders: 78%</div>
      </div>
      <div class="bar-bg" style="height:16px;margin:0 20px;"><div class="bar-fill" style="width:${aiReadiness}%;background:${aiReadiness>=70?"#22c55e":aiReadiness>=50?"#f97316":"#ef4444"};height:100%;"></div></div>
      <div style="margin:16px 0 8px;font-size:12px;color:#475569;">AI Readiness is calculated from:<br/>
        CI dimension (${(dimAvgs.CI||1).toFixed(2)} × 30%) + MM dimension (${(dimAvgs.MM||1).toFixed(2)} × 30%) + TI dimension (${(dimAvgs.TI||1).toFixed(2)} × 40%)</div>
      <div class="highlight-box" style="background:${aiReadiness>=70?"#dcfce7":"#fee2e2"};border:1px solid ${aiReadiness>=70?"#86efac":"#fecaca"};">
        <div class="highlight-icon">${aiReadiness>=70?"✅":"⚠️"}</div>
        <div style="font-size:12px;color:${aiReadiness>=70?"#15803d":"#991b1b"};">${aiReadiness>=70?"Strong foundation for AI deployment. Focus on governance and responsible AI policies.":"Process consistency and measurement gaps will cause AI projects to fail. Fix the foundation first."}</div>
      </div>
    </div>
    <div class="card avoid-break">
      <h3>What ITIL 5 Is Expected to Introduce</h3>
      ${[
        ["🤖 AI Practice Integration","AI will be a named ITIL practice — with process flows for AI model governance, bias detection, and incident response for AI failures."],
        ["⚡ Autonomous Change Enablement","AI-assessed change risk scoring becomes standard. Low-risk changes may be auto-approved via ML models trained on historical data."],
        ["💬 Conversational Service Desk","NLP-powered virtual agents replace Level 1 triage. ITIL 5 will define quality standards for AI-human escalation handoffs."],
        ["🔮 Predictive Problem Management","ML-driven pattern recognition identifies incident clusters before user impact. Proactive problem records generated automatically."],
        ["📊 Continuous Intelligence","Real-time process performance measurement replaces periodic reviews. ITIL 5 will define AI-native metrics and outcome models."],
        ["🌐 Value Co-Creation with AI","ITIL 5 expands the Service Value Chain to include AI agents as contributors. Process design must accommodate human-AI collaboration."],
      ].map(([icon,desc])=>`<div style="display:flex;gap:10px;margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid #f1f5f9;">
        <div style="font-size:16px;flex-shrink:0;">${icon}</div>
        <div style="font-size:12px;color:#475569;">${desc}</div>
      </div>`).join("")}
    </div>
  </div>

  <h3 style="margin-bottom:16px;">12 Steps to Adapt All 34 Processes for AI</h3>
  ${[
    ["01","Process Documentation First","AI cannot automate what isn't documented. Ensure 100% of ITIL 4 processes are formally documented with inputs, outputs, RACI, and decision points before any AI project begins.","Foundation","0–3 months"],
    ["02","Data Quality & Collection","AI requires clean, consistent historical data. Instrument all ITSM processes to capture structured data: ticket attributes, timestamps, resolution actions, configuration items. Target: 18 months of clean data minimum.","Data","0–6 months"],
    ["03","Implement Process Metrics","AI models need labelled outcomes. Establish clear KPIs and outcome labels (e.g., 'resolved', 'escalated', 'failed') for all 34 practices. This data trains the AI models.","Measurement","3–6 months"],
    ["04","Integrate the ITSM Platform","AI works best on a unified data model. Consolidate to a single ITSM platform (ServiceNow, BMC, or equivalent) before deploying AI features. Fragmented tooling creates fragmented AI.","Integration","3–12 months"],
    ["05","AI Use Case Prioritisation","Identify the 5 highest-value AI use cases based on volume and manual effort. Recommended starting points: incident classification, change risk scoring, knowledge article suggestion, problem root cause analysis, SLA breach prediction.","Strategy","3–6 months"],
    ["06","AI Governance Framework","Establish an AI Governance Policy covering: model bias auditing, explainability requirements, human override protocols, and AI incident escalation paths. Align to EU AI Act and ISO 42001 as applicable.","Governance","3–9 months"],
    ["07","Pilot: Intelligent Incident Management","Deploy AI-assisted incident classification and routing. Measure: classification accuracy, MTTR impact, false positive rate. Target: 80%+ auto-classification accuracy before broad rollout.","AI Deployment","6–12 months"],
    ["08","Pilot: Predictive Problem Management","Deploy ML-based pattern detection on incident data. Identify top 10 recurring problem patterns. Implement proactive problem records. Target: 20% reduction in repeat incidents within 6 months of deployment.","AI Deployment","9–15 months"],
    ["09","Intelligent Knowledge Management","Implement AI-generated knowledge articles from resolved tickets. Deploy conversational search (semantic, not keyword). Measure: knowledge utilisation rate, self-service resolution rate. Target: 35% self-service resolution.","AI Deployment","9–18 months"],
    ["10","AI-Augmented Change Enablement","Deploy ML-based change risk scoring using historical change success/failure data. Auto-approve standard changes matching proven low-risk patterns. Implement real-time configuration drift detection.","AI Deployment","12–18 months"],
    ["11","Continual AI Improvement Programme","Establish monthly AI model retraining cycles. Monitor for model drift, bias, and performance degradation. Create AI-specific CI register. Target: model accuracy maintained above 85% for all production AI.","Optimisation","12–24 months"],
    ["12","ITIL 5 Transition Readiness Review","Conduct a formal ITIL 5 gap assessment once publications are available. Map current processes to ITIL 5 framework. Identify net-new practices (AI Governance, Responsible AI, Autonomous Operations). Engage TCS ITSM Practice for transition consulting.","Strategic","18–24 months"],
  ].map(([num,title,desc,cat,timeline])=>`<div class="ai-step avoid-break">
    <div class="ai-num">${num}</div>
    <div style="flex:1;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <strong style="color:#1e293b;font-size:13px;">${title}</strong>
        <div style="display:flex;gap:6px;flex-shrink:0;margin-left:12px;">
          <span class="badge" style="background:#003087;color:#fff;font-size:10px;">${cat}</span>
          <span class="badge" style="background:#f1f5f9;color:#475569;font-size:10px;">${timeline}</span>
        </div>
      </div>
      <p style="margin:6px 0 0;font-size:12px;color:#475569;">${desc}</p>
    </div>
  </div>`).join("")}
</div>`;


  /* ════════════════ APPENDIX ════════════════ */
  const appendixPage = `
<div class="section page-break">
  <div class="section-label">Section 12</div>
  <h2>Appendix — Full Assessment Data</h2>

  <h3 style="margin-bottom:12px;">Complete Practice Score Table</h3>
  <table>
    <thead>
      <tr><th>#</th><th>Practice</th><th>Group</th><th>Level</th><th>Score</th>
      ${DIM_KEYS.map(dk=>`<th style="color:${DIMS[dk].color}">${dk}</th>`).join("")}
      <th>Maturity</th><th>Gap to L4</th></tr>
    </thead>
    <tbody>
    ${GROUPS.map(g=>{
      const gp=practiceRows.filter(p=>p.group===g);
      if(!gp.length) return "";
      const gAvg=gp.reduce((s,p)=>s+scores[p.id],0)/gp.length;
      return `<tr><td colspan="${4+DIM_KEYS.length+3}" style="background:#003087;color:#fff;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;padding:8px 12px;">${g} — Group Average: ${gAvg.toFixed(2)}</td></tr>`+
        gp.map((p,i)=>{
          const sc=scores[p.id]; const dim=dimScores[p.id]||{}; const lv=levels[p.id]||"—";
          const lvBg={beginner:"#dcfce7",practitioner:"#fef9c3",expert:"#fee2e2"};
          const lvCol={beginner:"#15803d",practitioner:"#92400e",expert:"#991b1b"};
          return `<tr>
            <td style="color:#94a3b8;font-size:11px;">${i+1}</td>
            <td style="font-weight:600;">${p.name}</td>
            <td style="font-size:11px;color:#64748b;">${g.replace(" Management","")}</td>
            <td><span class="badge" style="background:${lvBg[lv]||"#f1f5f9"};color:${lvCol[lv]||"#475569"};font-size:10px;">${lv}</span></td>
            <td><strong style="color:${maturityColor(sc)}">${sc.toFixed(2)}</strong></td>
            ${DIM_KEYS.map(dk=>`<td style="text-align:center;font-weight:600;color:${DIMS[dk].color};font-size:11px;">${(dim[dk]||1).toFixed(2)}</td>`).join("")}
            <td style="color:${maturityColor(sc)};font-size:11px;">${maturityLabel(sc)}</td>
            <td style="color:${sc>=TARGET?"#22c55e":"#ef4444"};font-weight:600;font-size:11px;">${sc>=TARGET?"✓":"+"+Math.max(0,TARGET-sc).toFixed(2)}</td>
          </tr>`;}).join("");}).join("")}
    </tbody>
  </table>

  <div class="two-col" style="margin-top:28px;">
    <div class="card">
      <h3>About This Assessment</h3>
      <p style="font-size:12px;">This report was generated by the <strong>${TOOL_NAME}</strong>, a proprietary assessment platform developed by <strong>${ORG_BRAND}</strong>. The platform applies the ITIL 4 framework (© AXELOS Limited) to evaluate organisational process maturity across all 34 practices. Assessment data is collected via structured questionnaires at Beginner, Practitioner, or Expert competency levels.</p>
      <p style="font-size:12px;margin-bottom:0;">Version: ${VERSION} · Generated: ${dateStr} · Assessor: ${username||"TCS Consultant"}${companyProfile ? ` · Client: ${companyProfile.companyName}` : ""}</p>
    </div>
    <div class="card">
      <h3>Contact & Next Steps</h3>
      <p style="font-size:12px;">To discuss the findings, commission a Phase 1 engagement, or schedule an executive briefing, contact your TCS ITSM Practice account team.</p>
      <div style="margin-top:12px;">
        ${[["🌐 Website","www.tcs.com/itsm"],["📧 Practice Lead","itsm-practice@tcs.com"],["📞 Global ITSM Hotline","+44 20 xxxx xxxx"],["📋 Next Assessment","Recommended in 6 months"]].map(([l,v])=>`<div style="display:flex;gap:8px;font-size:12px;padding:6px 0;border-bottom:1px solid #f1f5f9;"><strong style="width:120px;flex-shrink:0;color:#475569;">${l}</strong><span>${v}</span></div>`).join("")}
      </div>
    </div>
  </div>

  <!-- Final footer -->
  <div style="margin-top:48px;padding:24px;background:linear-gradient(135deg,#003087,#001a4d);border-radius:12px;text-align:center;">
    <div style="font-size:10px;color:rgba(255,255,255,.5);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:8px;">Confidential — For Executive Use Only</div>
    <div style="color:#fff;font-weight:700;font-size:14px;">${TOOL_NAME} · ${ORG_BRAND} · ${VERSION}</div>
    <div style="color:rgba(255,255,255,.6);font-size:11px;margin-top:4px;">${dateStr} · ITIL 4 Process Maturity Assessment</div>
    <div style="color:rgba(255,255,255,.4);font-size:10px;margin-top:8px;">ITIL® is a registered trademark of AXELOS Limited. This assessment is produced using the TCS ITSM Maturity Framework aligned to ITIL 4 Guidelines.</div>
  </div>
</div>`;

  /* ════════════════ ASSEMBLE FULL REPORT ════════════════ */
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>${TOOL_NAME} — ${maturityLabel(avgScore)} Report — ${dateStr}</title>
  <style>${CSS}</style>
</head>
<body>
  ${coverPage}
  ${tocPage}
  ${execSummary}
  ${methodologyPage}
  ${currentStatePage}
  ${dimensionalPage}
  ${heatmapPage}
  ${gapPage}
  ${riskPage}
  ${recsPage}
  ${roadmapPage}
  ${roiPage}
  ${itil5Page}
  ${appendixPage}
</body>
</html>`;
}

/* ─── Print Report ──────────────────────────────────────────────── */
function printReport(data) {
  const html = generatePDFHTML(data);
  const win  = window.open("","_blank","width=1200,height=900");
  if (!win) { alert("Please allow popups to generate the report."); return; }
  win.document.write(html);
  win.document.close();
  win.onload = () => {
    setTimeout(() => win.print(), 500);
  };
}

/* ─── ReportView ─────────────────────────────────────────────────── */
function ReportView({ scores, dimScores, levels, reportData, historyList, onBack, onLogout, user, companyProfile }) {
  const [tab, setTab] = useState("overview");
  const [selPractice, setSelPractice] = useState(null);
  const [cloudSaving, setCloudSaving] = useState(false);
  const [cloudUrl,    setCloudUrl]    = useState(null);
  const isAdmin = user?.role === "admin";

  const practiceRows = PRACTICES.filter(p => scores[p.id] != null);
  const avgScore = practiceRows.length > 0
    ? practiceRows.reduce((s,p) => s+scores[p.id],0) / practiceRows.length : 0;

  // Dimension averages across all assessed practices
  const dimAvgs = useMemo(() => {
    const res = {};
    for (const dk of DIM_KEYS) {
      const vals = practiceRows.map(p=>dimScores[p.id]?.[dk]).filter(v=>v!=null);
      res[dk] = vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : 1;
    }
    return res;
  }, [dimScores, practiceRows]);

  // Radar data for overview
  const radarData = DIM_KEYS.map(dk => ({ dim: dk, score: Math.round(dimAvgs[dk]*10)/10, fullMark:5 }));
  // Bar data for all practices
  const barData = practiceRows.map(p => ({
    name: p.name.length > 20 ? p.name.slice(0,18)+"…" : p.name,
    score: Math.round(scores[p.id]*100)/100,
  }));

  const tabBtnStyle = active => ({
    padding:"9px 20px", borderRadius:8, border:"none", cursor:"pointer",
    fontWeight:600, fontSize:13,
    background: active ? TC : "transparent",
    color: active ? "#fff" : "#64748b",
  });

  function saveHistory() {
    const entry = {
      username: user?.username,
      ts: Date.now(),
      scores, dimScores, levels,
      completedCount: practiceRows.length,
      avgScore,
      companyProfile,
    };
    const hist = ls.get(HISTORY_KEY, []);
    hist.push(entry);
    ls.set(HISTORY_KEY, hist);
  }

  async function saveToCloud() {
    if (!IS_VERCEL) { alert("Cloud save requires a Vercel deployment."); return; }
    setCloudSaving(true);
    const html = generatePDFHTML({
      scores, dimScores, levels,
      username: user?.username,
      ts: Date.now(),
      companyProfile,
    });
    const { ok, data } = await api.call("POST", "/api/reports", {
      htmlContent:  html,
      username:     user?.username,
      companyName:  companyProfile?.companyName || user?.username,
      timestamp:    Date.now(),
    });
    setCloudSaving(false);
    if (ok) {
      setCloudUrl(data.url);
      return true;
    } else {
      alert("Cloud save failed: " + (data?.detail || data?.error || "unknown error"));
      return false;
    }
  }

  return (
    <div style={{minHeight:"100vh",background:"#f0f4f8"}}>
      {/* Header */}
      <div style={{background:TC,padding:"16px 24px",display:"flex",alignItems:"center",gap:12,
        position:"sticky",top:0,zIndex:100}}>
        <button onClick={onBack} style={{background:"rgba(255,255,255,.15)",border:"none",
          color:"#fff",borderRadius:8,padding:"6px 12px",cursor:"pointer",fontSize:13}}>← Back</button>
        <div style={{flex:1}}>
          <div style={{color:"#fff",fontWeight:700,fontSize:16}}>Assessment Report</div>
          <div style={{color:"rgba(255,255,255,.6)",fontSize:11}}>
            {user?.name||user?.username} · {practiceRows.length} practices · Overall {avgScore.toFixed(2)}
          </div>
        </div>
        {/* BUG 4 — Print/PDF only for admin */}
        {isAdmin && (
          <button onClick={()=>printReport({scores,dimScores,levels,username:user?.username,ts:Date.now(),companyProfile})}
            style={{padding:"8px 16px",borderRadius:8,border:"1px solid rgba(255,255,255,.3)",
              background:"transparent",color:"#fff",cursor:"pointer",fontSize:13,fontWeight:600}}>
            🖨️ Print / PDF
          </button>
        )}
        {/* Cloud save — all users, only on Vercel */}
        {IS_VERCEL && !cloudUrl && (
          <button onClick={saveToCloud} disabled={cloudSaving}
            style={{padding:"8px 16px",borderRadius:8,border:"1px solid rgba(255,255,255,.3)",
              background:cloudSaving?"rgba(255,255,255,.1)":"transparent",
              color:cloudSaving?"rgba(255,255,255,.5)":"#fff",
              cursor:cloudSaving?"not-allowed":"pointer",fontSize:13,fontWeight:600}}>
            {cloudSaving ? "Saving…" : "☁️ Save to Cloud"}
          </button>
        )}
        {cloudUrl && (
          <a href={cloudUrl} target="_blank" rel="noreferrer"
            style={{padding:"8px 16px",borderRadius:8,border:"1px solid #4ade80",
              background:"rgba(74,222,128,.15)",color:"#4ade80",
              fontSize:13,fontWeight:600,textDecoration:"none"}}>
            ✅ Saved — View
          </a>
        )}
        <button onClick={()=>{saveHistory();}}
          style={{padding:"8px 16px",borderRadius:8,border:"1px solid rgba(255,255,255,.3)",
            background:"transparent",color:"rgba(255,255,255,.8)",cursor:"pointer",fontSize:13}}>
          💾 Save
        </button>
        <button onClick={onLogout} style={{padding:"8px 12px",borderRadius:8,
          border:"1px solid rgba(255,255,255,.25)",background:"transparent",
          color:"rgba(255,255,255,.7)",cursor:"pointer",fontSize:12}}>Sign Out</button>
      </div>

      {/* Tab bar */}
      <div style={{background:"#fff",borderBottom:"1px solid #e2e8f0",padding:"8px 24px"}}>
        <div style={{display:"inline-flex",gap:4,background:"#f1f5f9",borderRadius:10,padding:4}}>
          {[
            { key:"overview", label:"📊 Overview" },
            { key:"practices", label:"📋 Practice Scores" },
            { key:"history",  label:"🕐 History" },
          ].map(t => (
            <button key={t.key} style={tabBtnStyle(tab===t.key)} onClick={()=>setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{maxWidth:1100,margin:"24px auto",padding:"0 16px"}}>

        {/* ── Overview Tab ── */}
        {tab === "overview" && (
          <div>
            {/* KPI Cards */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",
              gap:16,marginBottom:24}}>
              {[
                { label:"Overall Score", val:avgScore.toFixed(2), sub:maturityLabel(avgScore), col:maturityColor(avgScore) },
                { label:"Practices Done", val:`${practiceRows.length}/${PRACTICES.length}`, sub:"completed", col:TC },
                { label:"Remaining", val:PRACTICES.length-practiceRows.length, sub:"practices", col:"#64748b" },
                { label:"Best Dimension", val:DIM_KEYS.reduce((b,dk)=>dimAvgs[dk]>dimAvgs[b]?dk:b,DIM_KEYS[0]),
                  sub:dimAvgs[DIM_KEYS.reduce((b,dk)=>dimAvgs[dk]>dimAvgs[b]?dk:b,DIM_KEYS[0])]?.toFixed(2), col:TCG },
              ].map((kpi,i) => (
                <div key={i} style={{background:"#fff",borderRadius:12,padding:20,
                  boxShadow:"0 1px 4px rgba(0,0,0,.06)",borderTop:`3px solid ${kpi.col}`}}>
                  <div style={{fontSize:11,color:"#94a3b8",fontWeight:600,textTransform:"uppercase",
                    letterSpacing:.5,marginBottom:6}}>{kpi.label}</div>
                  <div style={{fontSize:26,fontWeight:800,color:kpi.col}}>{kpi.val}</div>
                  <div style={{fontSize:12,color:"#64748b",marginTop:2}}>{kpi.sub}</div>
                </div>
              ))}
            </div>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,marginBottom:24}}>
              {/* Dimension Radar */}
              <div style={{background:"#fff",borderRadius:12,padding:24,boxShadow:"0 1px 4px rgba(0,0,0,.06)"}}>
                <h3 style={{color:TC,margin:"0 0 16px",fontSize:15}}>Dimensional Profile</h3>
                <DimRadar dimData={dimAvgs} />
                <div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:8}}>
                  {DIM_KEYS.map(dk=>(
                    <div key={dk} style={{display:"flex",alignItems:"center",gap:6,fontSize:12}}>
                      <div style={{width:10,height:10,borderRadius:2,background:DIMS[dk].color}}/>
                      <span style={{color:"#475569"}}><strong style={{color:DIMS[dk].color}}>{dk}</strong> {dimAvgs[dk].toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Dimension bars */}
              <div style={{background:"#fff",borderRadius:12,padding:24,boxShadow:"0 1px 4px rgba(0,0,0,.06)"}}>
                <h3 style={{color:TC,margin:"0 0 20px",fontSize:15}}>Dimension Breakdown</h3>
                {DIM_KEYS.map(dk => (
                  <div key={dk} style={{marginBottom:14}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                      <span style={{fontSize:13,fontWeight:600,color:"#334155"}}>
                        <span style={{color:DIMS[dk].color}}>{dk}</span> {DIMS[dk].label}
                      </span>
                      <span style={{fontSize:13,fontWeight:700,color:DIMS[dk].color}}>
                        {dimAvgs[dk].toFixed(2)}
                      </span>
                    </div>
                    <div style={{background:"#f1f5f9",borderRadius:999,height:8,overflow:"hidden"}}>
                      <div style={{height:"100%",background:DIMS[dk].color,borderRadius:999,
                        width:`${((dimAvgs[dk]-1)/4)*100}%`,transition:"width .5s ease"}} />
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:10,
                      color:"#94a3b8",marginTop:2}}>
                      <span>Weight: {(DIMS[dk].weight*100).toFixed(0)}%</span>
                      <span>{maturityLabel(dimAvgs[dk])}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Practice scores bar chart */}
            {barData.length > 0 && (
              <div style={{background:"#fff",borderRadius:12,padding:24,
                boxShadow:"0 1px 4px rgba(0,0,0,.06)",marginBottom:24}}>
                <h3 style={{color:TC,margin:"0 0 16px",fontSize:15}}>
                  All Practice Scores ({practiceRows.length} assessed)
                </h3>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={barData} margin={{top:5,right:20,left:0,bottom:60}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{fontSize:10,fill:"#64748b"}} angle={-35} textAnchor="end" interval={0} />
                    <YAxis domain={[0,5]} tick={{fontSize:11}} />
                    <Tooltip formatter={v=>[v.toFixed(2),"Score"]} />
                    <Bar dataKey="score" fill={TC} radius={[4,4,0,0]}
                      label={{position:"top",fontSize:10,formatter:v=>v.toFixed(1)}} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

        {/* ── Practice Scores Tab ── */}
        {tab === "practices" && (
          <div style={{display:"grid",gridTemplateColumns:"300px 1fr",gap:20}}>
            {/* Practice list */}
            <div style={{background:"#fff",borderRadius:12,padding:16,
              boxShadow:"0 1px 4px rgba(0,0,0,.06)",height:"fit-content",position:"sticky",top:100}}>
              <h3 style={{color:TC,margin:"0 0 12px",fontSize:14}}>Select Practice</h3>
              {GROUPS.map(g => (
                <div key={g} style={{marginBottom:12}}>
                  <div style={{fontSize:10,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",
                    letterSpacing:.5,marginBottom:6}}>{g}</div>
                  {PRACTICES.filter(p=>p.group===g&&scores[p.id]!=null).map(p => (
                    <div key={p.id} onClick={()=>setSelPractice(p.id)}
                      style={{padding:"8px 12px",borderRadius:8,cursor:"pointer",marginBottom:3,
                        background:selPractice===p.id?TC+"11":"transparent",
                        border:`1px solid ${selPractice===p.id?TC:"transparent"}`,
                        display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span style={{fontSize:12,color:selPractice===p.id?TC:"#334155",fontWeight:selPractice===p.id?700:400}}>
                        {p.name}
                      </span>
                      <span style={{fontSize:12,fontWeight:700,color:maturityColor(scores[p.id])}}>
                        {scores[p.id].toFixed(1)}
                      </span>
                    </div>
                  ))}
                  {PRACTICES.filter(p=>p.group===g&&scores[p.id]==null).map(p => (
                    <div key={p.id} style={{padding:"8px 12px",borderRadius:8,marginBottom:3,opacity:.4}}>
                      <span style={{fontSize:12,color:"#94a3b8"}}>{p.name}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {/* Practice detail */}
            <div>
              {selPractice && scores[selPractice] != null ? (() => {
                const p   = PRACTICES.find(x=>x.id===selPractice);
                const sc  = scores[selPractice];
                const dim = dimScores[selPractice] || {};
                const lv  = levels[selPractice] || "—";
                return (
                  <div>
                    <div style={{background:"#fff",borderRadius:12,padding:24,
                      boxShadow:"0 1px 4px rgba(0,0,0,.06)",marginBottom:16}}>
                      <div style={{display:"flex",gap:20,alignItems:"center",flexWrap:"wrap"}}>
                        <GaugeSVG score={sc} size={140} />
                        <div style={{flex:1}}>
                          <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>{p.group}</div>
                          <h2 style={{color:TC,fontSize:18,margin:"0 0 8px"}}>{p.name}</h2>
                          <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
                            <div style={{padding:"6px 14px",borderRadius:20,
                              background:maturityColor(sc)+"22",color:maturityColor(sc),
                              fontWeight:700,fontSize:13}}>
                              Level {sc.toFixed(1)} — {maturityLabel(sc)}
                            </div>
                            <div style={{padding:"6px 14px",borderRadius:20,
                              background:"#f1f5f9",color:"#475569",fontSize:12,
                              textTransform:"capitalize"}}>
                              {lv} assessment
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Dimension breakdown */}
                    <div style={{background:"#fff",borderRadius:12,padding:24,
                      boxShadow:"0 1px 4px rgba(0,0,0,.06)",marginBottom:16}}>
                      <h3 style={{color:TC,margin:"0 0 16px",fontSize:15}}>Dimensional Breakdown</h3>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
                        <div>
                          {DIM_KEYS.map(dk => (
                            <div key={dk} style={{marginBottom:14}}>
                              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                                <div>
                                  <span style={{fontWeight:700,color:DIMS[dk].color,fontSize:13}}>{dk}</span>
                                  <span style={{fontSize:12,color:"#475569",marginLeft:6}}>{DIMS[dk].label}</span>
                                </div>
                                <span style={{fontWeight:800,color:DIMS[dk].color,fontSize:14}}>
                                  {dim[dk]?.toFixed(2) || "—"}
                                </span>
                              </div>
                              <div style={{background:"#f1f5f9",borderRadius:999,height:10,overflow:"hidden"}}>
                                <div style={{height:"100%",background:DIMS[dk].color,borderRadius:999,
                                  width:`${dim[dk]?((dim[dk]-1)/4)*100:0}%`,transition:"width .5s"}} />
                              </div>
                              <div style={{fontSize:10,color:"#94a3b8",marginTop:2,display:"flex",justifyContent:"space-between"}}>
                                <span>Weight: {(DIMS[dk].weight*100).toFixed(0)}%</span>
                                <span>{dim[dk]?maturityLabel(dim[dk]):""}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div>
                          <DimRadar dimData={dim} />
                        </div>
                      </div>
                    </div>

                    {/* Dimension contributions to overall */}
                    <div style={{background:"#fff",borderRadius:12,padding:24,
                      boxShadow:"0 1px 4px rgba(0,0,0,.06)"}}>
                      <h3 style={{color:TC,margin:"0 0 12px",fontSize:15}}>Score Contribution</h3>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10}}>
                        {DIM_KEYS.map(dk => {
                          const contrib = dim[dk] ? dim[dk] * DIMS[dk].weight : 0;
                          return (
                            <div key={dk} style={{background:DIMS[dk].color+"11",borderRadius:10,
                              padding:14,textAlign:"center",border:`1px solid ${DIMS[dk].color}33`}}>
                              <div style={{fontSize:18,fontWeight:800,color:DIMS[dk].color}}>
                                {contrib.toFixed(2)}
                              </div>
                              <div style={{fontSize:11,fontWeight:700,color:DIMS[dk].color,margin:"4px 0 2px"}}>{dk}</div>
                              <div style={{fontSize:10,color:"#94a3b8"}}>of {DIMS[dk].weight.toFixed(2)}</div>
                            </div>
                          );
                        })}
                      </div>
                      <div style={{marginTop:12,padding:"12px 16px",background:"#f8fafc",borderRadius:8,
                        display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <span style={{fontSize:13,color:"#475569"}}>Weighted Overall Score</span>
                        <span style={{fontSize:18,fontWeight:800,color:maturityColor(sc)}}>{sc.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                );
              })() : (
                <div style={{background:"#fff",borderRadius:12,padding:60,textAlign:"center",
                  boxShadow:"0 1px 4px rgba(0,0,0,.06)"}}>
                  <div style={{fontSize:40,marginBottom:16}}>👈</div>
                  <div style={{color:"#94a3b8",fontSize:15}}>Select a practice from the list to view its detailed scores.</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── History Tab ── */}
        {tab === "history" && (
          <div style={{background:"#fff",borderRadius:12,padding:24,
            boxShadow:"0 1px 4px rgba(0,0,0,.06)"}}>
            <h3 style={{color:TC,margin:"0 0 16px",fontSize:16}}>Assessment History</h3>
            {(() => {
              const all = ls.get(HISTORY_KEY, []);
              const mine = all.filter(h=>h.username===user?.username).reverse();
              if (!mine.length) return (
                <div style={{textAlign:"center",padding:40,color:"#94a3b8"}}>
                  <div style={{fontSize:36,marginBottom:12}}>📭</div>
                  No saved assessments yet. Use the Save button to archive the current state.
                </div>
              );
              return mine.map((h,i) => (
                <div key={i} style={{padding:"16px 0",borderBottom:"1px solid #f1f5f9"}}>
                  <div style={{display:"flex",alignItems:"center",gap:16,flexWrap:"wrap"}}>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:600,color:"#1e293b",fontSize:14}}>
                        {new Date(h.ts).toLocaleString("en-GB")}
                      </div>
                      <div style={{fontSize:12,color:"#64748b",marginTop:2}}>
                        {h.completedCount} practices assessed
                      </div>
                    </div>
                    <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
                      <div style={{textAlign:"center"}}>
                        <div style={{fontSize:20,fontWeight:800,color:maturityColor(h.avgScore)}}>
                          {h.avgScore?.toFixed(2)||"—"}
                        </div>
                        <div style={{fontSize:10,color:"#94a3b8"}}>Overall</div>
                      </div>
                      {DIM_KEYS.map(dk => {
                        const vals = Object.values(h.dimScores||{}).map(d=>d[dk]).filter(v=>v!=null);
                        const avg  = vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null;
                        return avg != null ? (
                          <div key={dk} style={{textAlign:"center"}}>
                            <div style={{fontSize:16,fontWeight:700,color:DIMS[dk].color}}>
                              {avg.toFixed(1)}
                            </div>
                            <div style={{fontSize:10,color:"#94a3b8"}}>{dk}</div>
                          </div>
                        ) : null;
                      })}
                    </div>
                  </div>
                </div>
              ));
            })()}
          </div>
        )}

      </div>
    </div>
  );
}

