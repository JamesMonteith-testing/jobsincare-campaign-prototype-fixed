// server/server.cjs
// Lightweight local API for Job Campaign Manager
// - Exposes /api/jobs (filtered + 6-week live window)
// - Exposes /api/admin/settings (persisted on disk)
// - Exposes /api/feeds/:channelId[.json|.xml]  (format can come from ext, ?format=, or per-channel setting)
// - Access tokens are ACCEPTED (Authorization: Bearer ... or ?access_token=...) but NOT enforced yet.

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs/promises");

// ---------- Config ----------
const PORT = process.env.PORT || 5174;
const DATA_DIR = path.join(__dirname, "data");
const SETTINGS_PATH = path.join(DATA_DIR, "settings.json");

// Default channels and admin settings
const DEFAULT_SETTINGS = {
  global: {
    // If blank => include all sources. Set to "user" to include only user-sourced jobs.
    sourceFilter: "user",
    outputFormat: "json", // default when a channel has no override
    apiEndpoint: "https://jobsincare.com/api/jobs?perPage=50&pageNumber=1",
  },
  channels: {
    google:   { label: "Google",   enabled: true,  budgets: { premium: 200, premiumPlus: 350 }, durationDays: 14, endpoint: "https://feeds.google.com/jobs",     source: "user", feedFormat: "json",  accessToken: "" },
    facebook: { label: "Facebook", enabled: true,  budgets: { premium: 200, premiumPlus: 350 }, durationDays: 14, endpoint: "https://graph.facebook.com/ads",    source: "user", feedFormat: "json",  accessToken: "" },
    linkedin: { label: "LinkedIn", enabled: true,  budgets: { premium: 200, premiumPlus: 350 }, durationDays: 14, endpoint: "https://api.linkedin.com/jobfeeds",  source: "user", feedFormat: "xml",   accessToken: "" },
    tiktok:   { label: "TikTok",   enabled: true,  budgets: { premium: 200, premiumPlus: 350 }, durationDays: 14, endpoint: "https://business-api.tiktokglobalshop.com/feeds", source: "user", feedFormat: "xml", accessToken: "" },
  }
};

// Fallback sample payload if upstream fetch fails
const SAMPLE_API_PAYLOAD = {
  "jobs": [
    {"jobTitleDisplay":"support worker ","url":"https://jobsincare.com/job/support-worker-glasgow-jjmnxPKta","id":"jjmnxPKta","jobTitle":"support worker ","recruiterId":"rxY3K0uLN","listingType":"premiumplus","locationTree":["Glasgow","Scotland","UK"],"created":"2025-08-27T11:24:07.707Z","source":"user","jobLocation":"Glasgow, Scotland, UK","recruiter":{"id":"rxY3K0uLN","displayName":"Plus Homecare"}},
    {"jobTitleDisplay":"Registered Manager","url":"https://jobsincare.com/job/registered-manager-nottingham-j0ZztnJeW","id":"j0ZztnJeW","jobTitle":"Registered Manager","recruiterId":"rmE25XYhZ","listingType":"premiumplus","locationTree":["Nottingham","England","UK"],"created":"2025-08-26T16:01:53.912Z","source":"user","jobLocation":"Nottingham, England, UK","recruiter":{"id":"rmE25XYhZ","displayName":"Visiting Angels East Nottinghamshire"}},
    {"jobTitleDisplay":"Carer (Night Shift)","url":"https://jobsincare.com/job/carer-dingwall-jYKlKYvbP","id":"jYKlKYvbP","jobTitle":"Carer (Night Shift)","recruiterId":"rUd7y7SYL","listingType":"premium","locationTree":["Dingwall","Scotland","UK"],"created":"2025-08-21T14:42:28.613Z","source":"user","jobLocation":"Dingwall, Scotland, UK","recruiter":{"id":"rUd7y7SYL","displayName":"Highland Home Carers"}},
    {"jobTitleDisplay":"Care Assistant","url":"https://jobsincare.com/job/care-assistant-cambridge-j6uRzwTuR","id":"j6uRzwTuR","jobTitle":"Care Assistant","recruiterId":"rAfy2sF6","listingType":"premium","locationTree":["Cambridge","England","UK"],"created":"2025-08-20T14:37:03.332Z","source":"user","jobLocation":"Cambridge, England, UK","recruiter":{"id":"rAfy2sF6","displayName":"Caremark"}},
    {"jobTitleDisplay":"Care Worker","url":"https://jobsincare.com/job/care-worker-sunderland-jgWHsvu2l","id":"jgWHsvu2l","jobTitle":"Care Worker","recruiterId":"rje7Pr5FJ","listingType":"premiumplus","locationTree":["Sunderland","England","UK"],"created":"2025-08-20T09:56:10.937Z","source":"user","jobLocation":"Sunderland, England, UK","recruiter":{"id":"rje7Pr5FJ","displayName":"Blue Ribbon Community Care"}}
  ]
};

// ---------- Utils ----------
function todayISO() {
  const d = new Date();
  d.setHours(0,0,0,0);
  return d.toISOString().slice(0,10);
}
function toISODate(input, fallbackToday=false) {
  if (!input) return fallbackToday ? todayISO() : "";
  try { return new Date(String(input)).toISOString().slice(0,10); } catch { return fallbackToday ? todayISO() : ""; }
}
function daysBetween(aISO, bISO) {
  const a = new Date(aISO); a.setHours(0,0,0,0);
  const b = new Date(bISO); b.setHours(0,0,0,0);
  return Math.floor((b.getTime()-a.getTime())/86400000);
}
function addDays(iso, n) {
  const d = new Date(iso); d.setDate(d.getDate()+n);
  d.setHours(0,0,0,0);
  return d.toISOString().slice(0,10);
}
function mapListingTypeToCredit(listingType) {
  const v = String(listingType || "").toLowerCase().trim();
  if (v === "premiumplus" || v === "premium-plus" || v === "premier position" || v === "premierposition" || v === "premium_plus") return "Premium Plus";
  return "Premium";
}
function adaptFromJobsInCare(raw) {
  const list = Array.isArray(raw.jobs) ? raw.jobs : [];
  return list.map((j, i) => {
    const id = String(j.id ?? `ext-${i+1}`);
    const title = String(j.jobTitleDisplay || j.jobTitle || "Untitled role").trim();
    const recruiter = (j.recruiter && j.recruiter.displayName) ? String(j.recruiter.displayName) : "Jobs in Care";
    const location = String(j.jobLocation || (Array.isArray(j.locationTree) ? j.locationTree.join(", ") : "UK"));
    const createdISO = toISODate(j.created, true);
    const credit = mapListingTypeToCredit(j.listingType);
    const source = String(j.source || "user");
    const url = j.url ? String(j.url) : undefined;
    return {
      id, title, location, recruiter,
      eligibleDate: createdISO, // created date
      liveDate: null, // set in frontend when toggled on; not needed for feed
      source, credit, url
    };
  });
}
function isLive(eligibleISO, asOfISO) {
  const d = daysBetween(eligibleISO, asOfISO);
  return d >= 0 && d <= 42; // 6 weeks window
}
function xmlEscape(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ---------- Storage ----------
async function ensureSettingsFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(SETTINGS_PATH);
  } catch {
    await fs.writeFile(SETTINGS_PATH, JSON.stringify(DEFAULT_SETTINGS, null, 2), "utf8");
  }
}
async function readSettings() {
  await ensureSettingsFile();
  const raw = await fs.readFile(SETTINGS_PATH, "utf8");
  return JSON.parse(raw);
}
async function writeSettings(obj) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(SETTINGS_PATH, JSON.stringify(obj, null, 2), "utf8");
}

// ---------- Upstream fetch ----------
async function fetchJobsFromUpstream(apiEndpoint) {
  try {
    const res = await fetch(apiEndpoint, { headers: { "Accept": "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return adaptFromJobsInCare(json);
  } catch (e) {
    console.warn("[server] Upstream fetch failed, using sample payload:", e.message);
    return adaptFromJobsInCare(SAMPLE_API_PAYLOAD);
  }
}

// ---------- App ----------
const app = express();
app.use(cors());
app.use(express.json());

// Health
app.get("/", (_req, res) => res.send("JobsInCare local API OK"));

// Admin settings
app.get("/api/admin/settings", async (_req, res) => {
  const s = await readSettings();
  res.json(s);
});
app.post("/api/admin/settings", async (req, res) => {
  const body = req.body || {};
  // light validation
  if (!body.global || !body.channels) {
    return res.status(400).json({ error: "Invalid settings format" });
  }
  await writeSettings(body);
  res.json({ ok: true });
});

// Jobs (filtered, live window)
app.get("/api/jobs", async (req, res) => {
  const settings = await readSettings();
  const endpoint = settings.global.apiEndpoint || DEFAULT_SETTINGS.global.apiEndpoint;

  const all = await fetchJobsFromUpstream(endpoint);
  const asOf = toISODate(req.query.asOf || new Date());

  // Source filter (blank => include all)
  const sourceFilter = String(settings.global.sourceFilter || "").trim();
  const filteredBySource = sourceFilter ? all.filter(j => String(j.source).toLowerCase() === sourceFilter.toLowerCase()) : all;

  // Live 6-week window
  const live = filteredBySource.filter(j => isLive(j.eligibleDate, asOf));

  res.json({
    stats: { totalFetched: filteredBySource.length, liveCount: live.length, asOf },
    jobs: live
  });
});

// Feeds
// Support /api/feeds/:channelId(.json|.xml) and ?format=
app.get("/api/feeds/:channelId", async (req, res) => {
  const { channelId } = req.params;
  const ext = ""; // no ext here; format may come from query or settings
  await handleFeed(req, res, channelId, ext);
});
app.get("/api/feeds/:channelId.:ext", async (req, res) => {
  const { channelId, ext } = req.params;
  await handleFeed(req, res, channelId, ext);
});

async function handleFeed(req, res, channelId, ext) {
  const settings = await readSettings();
  const endpoint = settings.global.apiEndpoint || DEFAULT_SETTINGS.global.apiEndpoint;

  // Tokens (bypassed for now)
  const auth = req.headers.authorization || "";
  const queryToken = req.query.access_token || "";
  if (auth || queryToken) {
    console.log(`[feed:${channelId}] token provided (bypassed):`, auth || `access_token=${queryToken}`);
  } else {
    console.log(`[feed:${channelId}] no token provided (allowed; bypass on)`);
  }

  const all = await fetchJobsFromUpstream(endpoint);
  const asOf = toISODate(req.query.asOf || new Date());

  // Source filter (blank => include all)
  const sourceFilter = String(settings.global.sourceFilter || "").trim();
  const filteredBySource = sourceFilter ? all.filter(j => String(j.source).toLowerCase() === sourceFilter.toLowerCase()) : all;

  // Only live jobs in 6-week window
  const live = filteredBySource.filter(j => isLive(j.eligibleDate, asOf));

  // Determine output format precedence: URL ext > ?format= > channel.feedFormat > global.outputFormat > json
  const qFormat = (req.query.format || "").toString().toLowerCase();
  const ch = settings.channels[channelId] || {};
  const pick = (ext || qFormat || ch.feedFormat || settings.global.outputFormat || "json").toLowerCase();
  const format = (pick === "xml" ? "xml" : "json");

  const items = live.map(j => ({
    id: j.id,
    title: j.title,
    location: j.location,
    recruiter: j.recruiter,
    created: j.eligibleDate,
    expires: addDays(j.eligibleDate, 42),
    credit: j.credit,
    url: j.url || "",
    source: j.source
  }));

  if (format === "xml") {
    const xml = [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<jobs channel="${xmlEscape(channelId)}" generatedAt="${xmlEscape(new Date().toISOString())}">`,
      ...items.map(it => [
        `  <job>`,
        `    <id>${xmlEscape(it.id)}</id>`,
        `    <title>${xmlEscape(it.title)}</title>`,
        `    <location>${xmlEscape(it.location)}</location>`,
        `    <recruiter>${xmlEscape(it.recruiter)}</recruiter>`,
        `    <created>${xmlEscape(it.created)}</created>`,
        `    <expires>${xmlEscape(it.expires)}</expires>`,
        `    <credit>${xmlEscape(it.credit)}</credit>`,
        `    <url>${xmlEscape(it.url)}</url>`,
        `    <source>${xmlEscape(it.source)}</source>`,
        `  </job>`
      ].join("\n")),
      `</jobs>`
    ].join("\n");
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    return res.status(200).send(xml);
  } else {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.status(200).json({
      channel: channelId,
      generatedAt: new Date().toISOString(),
      format: "json",
      jobs: items
    });
  }
}

// ---------- Start ----------
app.listen(PORT, () => {
  console.log(`JobsInCare local API listening on http://localhost:${PORT}`);
});
