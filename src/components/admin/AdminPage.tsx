/* eslint-disable no-console */
const path = require("path");
const fs = require("fs");
const http = require("http");
const express = require("express");
const cors = require("cors");

// Node 18+ has global fetch
const app = express();
const PORT = Number(process.env.PORT || 5174);

// -------------------- middleware --------------------
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// -------------------- paths --------------------
const SERVER_DIR = __dirname;
const DATA_DIR = path.join(SERVER_DIR, "data");
const ROUTES_DIR = path.join(SERVER_DIR, "routes");
const AREAS_CSV_PATH = path.join(ROUTES_DIR, "areas.csv");
const LOCATION_OVERRIDES_PATH = path.join(DATA_DIR, "location-overrides.json");
const ADMIN_SETTINGS_PATH = path.join(DATA_DIR, "admin-settings.json");

// ensure folders
fs.mkdirSync(DATA_DIR, { recursive: true });

// -------------------- helpers --------------------
function readJson(fp, fallback) {
  try {
    if (!fs.existsSync(fp)) return fallback;
    return JSON.parse(fs.readFileSync(fp, "utf8"));
  } catch (e) {
    console.warn("[readJson] failed:", fp, e.message);
    return fallback;
  }
}
function writeJson(fp, obj) {
  try {
    fs.writeFileSync(fp, JSON.stringify(obj, null, 2), "utf8");
    return true;
  } catch (e) {
    console.error("[writeJson] failed:", fp, e.message);
    return false;
  }
}

// -------------------- Admin settings --------------------
const DEFAULT_ADMIN_SETTINGS = {
  apiEndpoint: "http://localhost:5174",
  liveWindowWeeks: 6,
  enableFacebook: true,
  enableGoogle: true,
  enableLinkedin: false,
  enableTiktok: false,
};

app.get("/api/admin/settings", (_req, res) => {
  const s = readJson(ADMIN_SETTINGS_PATH, DEFAULT_ADMIN_SETTINGS);
  if (!s || typeof s !== "object") return res.json({ ...DEFAULT_ADMIN_SETTINGS });
  if (!s.apiEndpoint) s.apiEndpoint = DEFAULT_ADMIN_SETTINGS.apiEndpoint;
  res.json({ ...DEFAULT_ADMIN_SETTINGS, ...s });
});

app.post("/api/admin/settings", (req, res) => {
  const next = { ...DEFAULT_ADMIN_SETTINGS, ...(req.body || {}) };
  if (!writeJson(ADMIN_SETTINGS_PATH, next)) {
    return res.status(500).json({ error: "persist_failed" });
  }
  res.json({ ok: true, settings: next });
});

// -------------------- Areas CSV loader --------------------
// ONE column with header "Areas" (case-insensitive). Handle UTF-8 BOM on Windows.
function parseCSV(textRaw) {
  // Strip BOM if present and normalise newlines
  const text = String(textRaw).replace(/^\uFEFF/, "");
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter(Boolean);
  if (!lines.length) return [];

  // CSV line parser with quotes
  const parseLine = (line) => {
    const out = []; let cur = ""; let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++; }
          else { inQ = false; }
        } else cur += ch;
      } else {
        if (ch === '"') inQ = true;
        else if (ch === ",") { out.push(cur); cur = ""; }
        else cur += ch;
      }
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };

  const headerCells = parseLine(lines[0]).map((h) => h.replace(/^\uFEFF/, "").trim().toLowerCase());
  const areasIdx = headerCells.indexOf("areas");
  if (areasIdx === -1) {
    console.warn("[areas] CSV must have a single header named 'Areas'. Got:", headerCells);
    return [];
  }

  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseLine(lines[i]);
    const name = (cols[areasIdx] || "").trim();
    if (!name) continue;
    out.push({ token: name, name, county_unitary: name, district_borough: null });
  }

  // dedupe + sort
  const seen = new Map();
  for (const r of out) if (!seen.has(r.token)) seen.set(r.token, r);
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function loadAreasFromCSV() {
  if (!fs.existsSync(AREAS_CSV_PATH)) {
    console.warn("[areas] CSV not found at", AREAS_CSV_PATH);
    return [];
  }
  try {
    const txt = fs.readFileSync(AREAS_CSV_PATH, "utf8");
    const list = parseCSV(txt);
    console.log(`[areas] loaded ${list.length} areas from areas.csv`);
    return list;
  } catch (e) {
    console.warn("[areas] failed to read CSV:", e.message);
    return [];
  }
}

let AREAS_CACHE = loadAreasFromCSV();

// -------------------- /api/areas + debug --------------------
app.get("/api/areas", (req, res) => {
  try {
    const q = (req.query?.q ? String(req.query.q) : "").trim();
    const all = String(req.query?.all || "") === "1";
    if (all) return res.json(AREAS_CACHE);
    if (!q) return res.status(400).json({ error: "Provide q=term or all=1" });

    const term = q.toLowerCase();
    const filtered = AREAS_CACHE.filter((a) =>
      a.name?.toLowerCase().includes(term) || a.county_unitary?.toLowerCase().includes(term)
    );
    res.json(filtered);
  } catch (err) {
    console.error("GET /api/areas failed:", err);
    res.status(500).json({ error: "areas_query_failed" });
  }
});

// quick visibility for troubleshooting
app.get("/api/areas/debug", (_req, res) => {
  res.json({
    path: AREAS_CSV_PATH,
    count: AREAS_CACHE.length,
    sample: AREAS_CACHE.slice(0, 5),
  });
});

// -------------------- location overrides --------------------
function readOverrides() {
  const o = readJson(LOCATION_OVERRIDES_PATH, {});
  return o && typeof o === "object" ? o : {};
}
function writeOverrides(o) {
  return writeJson(LOCATION_OVERRIDES_PATH, o);
}

app.post("/api/jobs/:jobId/location", (req, res) => {
  try {
    const jobId = String(req.params.jobId || "").trim();
    const area = (req.body?.area ? String(req.body.area) : "").trim();
    if (!jobId) return res.status(400).json({ error: "missing_jobId" });
    if (!area) return res.status(400).json({ error: "missing_area" });

    const exists = AREAS_CACHE.find((a) => a.token.toLowerCase() === area.toLowerCase());
    if (!exists) return res.status(400).json({ error: "area_not_found" });

    const current = readOverrides();
    current[jobId] = { areaToken: exists.token, savedAt: new Date().toISOString() };
    if (!writeOverrides(current)) return res.status(500).json({ error: "persist_failed" });

    res.json({ ok: true, areaToken: exists.token });
  } catch (e) {
    console.error("POST /api/jobs/:jobId/location failed:", e);
    res.status(500).json({ error: "save_failed" });
  }
});

// -------------------- upstream jobs proxy + merge overrides --------------------
const UPSTREAM_BASE = process.env.UPSTREAM_BASE || "https://jobsincare.com/api/jobs";
console.log("Upstream base:", `${UPSTREAM_BASE}?perPage=50&pageNumber=1`);

function minimalLocationStatus(job, overrides) {
  const ov = overrides[job.id];
  if (ov?.areaToken) return "valid";
  if (["valid", "missing", "suggested"].includes(job.locationStatus)) return job.locationStatus;
  return "missing";
}

app.get("/api/jobs", async (req, res) => {
  try {
    const perPage = Number(req.query.perPage || 50);
    const pageNumber = Number(req.query.pageNumber || 1);
    const recruiter = req.query.recruiter ? String(req.query.recruiter) : "";

    const url = new URL(UPSTREAM_BASE);
    url.searchParams.set("perPage", String(perPage));
    url.searchParams.set("pageNumber", String(pageNumber));
    if (recruiter) url.searchParams.set("recruiter", recruiter);

    const upstream = await fetch(url.toString(), { headers: { Accept: "application/json" } });
    if (!upstream.ok) {
      const txt = await upstream.text();
      console.warn("[/api/jobs] upstream error:", upstream.status, txt.slice(0, 300));
      return res.status(502).json({ error: "upstream_failed", status: upstream.status });
    }
    const json = await upstream.json();

    const overrides = readOverrides();
    const jobs = Array.isArray(json.jobs) ? json.jobs.slice() : [];
    for (const j of jobs) {
      if (!j || typeof j !== "object") continue;
      if (overrides[j.id]?.areaToken) {
        j.areaToken = overrides[j.id].areaToken;
        j.locationStatus = "valid";
      } else {
        j.locationStatus = minimalLocationStatus(j, overrides);
      }
      if (!Array.isArray(j.areaSuggestions)) j.areaSuggestions = [];
    }

    res.json({ ...json, jobs });
  } catch (e) {
    console.error("GET /api/jobs failed:", e);
    res.status(500).json({ error: "jobs_failed" });
  }
});

// -------------------- publish state (in-memory) --------------------
const PUBLISH_CHANNELS = [
  { id: "facebook", format: "json", active: true },
  { id: "google", format: "json", active: true },
];
const publishState = { channels: PUBLISH_CHANNELS, byChannel: {} };

app.get("/api/publish/state", (_req, res) => res.json(publishState));

app.post("/api/publish/toggle", (req, res) => {
  try {
    const { jobId, channelId, active } = req.body || {};
    if (!jobId || !channelId) return res.status(400).json({ error: "missing_params" });

    // enforce valid-area gate
    const overrides = readOverrides();
    if (active && !overrides[String(jobId)]?.areaToken) {
      return res.status(400).json({ error: "Select a valid area first" });
    }

    publishState.byChannel[channelId] ||= {};
    if (active) publishState.byChannel[channelId][String(jobId)] = { activatedAt: new Date().toISOString() };
    else delete publishState.byChannel[channelId][String(jobId)];
    res.json({ ok: true });
  } catch (e) {
    console.error("POST /api/publish/toggle failed:", e);
    res.status(500).json({ error: "toggle_failed" });
  }
});

// -------------------- health --------------------
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// -------------------- start --------------------
http.createServer(app).listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
  console.log(`Check admin:  http://localhost:${PORT}/api/admin/settings`);
  console.log(`Check areas:  http://localhost:${PORT}/api/areas?all=1`);
  console.log(`Debug areas:  http://localhost:${PORT}/api/areas/debug`);
});
