// server/routes/areas.cjs
// Simple /api/areas backed by a CSV file instead of the DB.
// Expects a header row with at least: county_unitary, district_borough

const fs = require("fs");
const path = require("path");

function parseCSV(csvText) {
  // very small, safe CSV parser (supports quoted fields, commas)
  const lines = csvText.replace(/\r\n/g, "\n").split("\n").filter(Boolean);
  if (lines.length === 0) return [];

  // parse a CSV line -> array of fields
  const parseLine = (line) => {
    const out = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++; } // escaped quote
          else inQ = false;
        } else {
          cur += ch;
        }
      } else {
        if (ch === '"') inQ = true;
        else if (ch === ",") { out.push(cur); cur = ""; }
        else cur += ch;
      }
    }
    out.push(cur);
    return out.map(s => s.trim());
  };

  const header = parseLine(lines[0]);
  const idx = {
    county_unitary: header.findIndex(h => h.toLowerCase() === "county_unitary"),
    district_borough: header.findIndex(h => h.toLowerCase() === "district_borough"),
  };
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseLine(lines[i]);
    const cu = (idx.county_unitary >= 0 ? cols[idx.county_unitary] : "").trim();
    const db = (idx.district_borough >= 0 ? cols[idx.district_borough] : "").trim();
    if (!cu && !db) continue;

    const label = cu && db ? `${cu} — ${db}` : (cu || db);
    rows.push({
      token: cu || label,
      county_unitary: cu || null,
      district_borough: db || null,
      name: label,
    });
  }

  // Dedupe by token, prefer most descriptive label
  const seen = new Map();
  for (const r of rows) {
    const k = r.token;
    if (!seen.has(k) || (r.name && r.name.length > seen.get(k).name.length)) {
      seen.set(k, r);
    }
  }

  // Sort A→Z by label
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function loadAreasFromCSV() {
  const csvPath = path.join(__dirname, "locations.csv"); // place file at server/routes/locations.csv
  if (!fs.existsSync(csvPath)) {
    console.warn(`[areas] CSV file not found at ${csvPath}`);
    return [];
  }
  const text = fs.readFileSync(csvPath, "utf8");
  return parseCSV(text);
}

module.exports = function registerAreasRoutes(app) {
  // Load once at boot; tiny CSV will be fine in memory
  let AREAS = loadAreasFromCSV();

  // If you want hot-reload on edit, uncomment:
  // fs.watchFile(path.join(__dirname, "locations.csv"), () => {
  //   try { AREAS = loadAreasFromCSV(); console.log("[areas] reloaded CSV"); } catch {}
  // });

  // GET /api/areas?all=1   → full list (alphabetical)
  // GET /api/areas?q=term  → case-insensitive contains on county or district/borough
  app.get("/api/areas", (req, res) => {
    const q = (req.query && req.query.q ? String(req.query.q) : "").trim();
    const all = String((req.query && req.query.all) || "") === "1";

    if (!all && !q) {
      return res.status(400).json({ error: "Provide q=term or all=1" });
    }

    if (all) {
      return res.json(AREAS);
    }

    const term = q.toLowerCase();
    const filtered = AREAS.filter((a) =>
      (a.county_unitary && a.county_unitary.toLowerCase().includes(term)) ||
      (a.district_borough && a.district_borough.toLowerCase().includes(term)) ||
      (a.name && a.name.toLowerCase().includes(term))
    );

    res.json(filtered);
  });
};
