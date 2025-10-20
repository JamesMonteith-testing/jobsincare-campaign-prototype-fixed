// server/db/locations-mysql.cjs
// MySQL adapter for OS Open Names lookups used by the feeds.
// Exposes the same API shape as the SQLite adapter.
//
// Required env (already set):
//   GEO_DB_DIALECT=mysql
//   MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE
//
// Table expected: os_open_names with columns:
//   POSTCODE_DISTRICT (e.g., 'G64', 'KA10', ...)
//   COUNTY_UNITARY    (e.g., 'North Ayrshire', 'South Ayrshire', ...)
//
// Queries we support:
//   - DISTINCT POSTCODE_DISTRICT by COUNTY_UNITARY LIKE '%AYRSHIRE%'
//   - rows by POSTCODE_DISTRICT prefix (e.g., 'G64%')

const mysql = require("mysql2/promise");

let pool = null;

function getCfg() {
  return {
    host: process.env.MYSQL_HOST || "localhost",
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "1GiantLeap",
    database: process.env.MYSQL_DATABASE || "postcode_locations",
    // optional tuning
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
  };
}

async function ensurePool() {
  if (pool) return pool;
  const cfg = getCfg();
  try {
    pool = mysql.createPool(cfg);
    // quick connectivity check
    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();
    console.log(`[geo/mysql] Connected ${cfg.user}@${cfg.host}:${cfg.port}/${cfg.database}`);
    return pool;
  } catch (e) {
    console.warn("[geo/mysql] Connection failed:", e.message);
    pool = null;
    return null;
  }
}

// Public: get distinct outcodes (POSTCODE_DISTRICT) for a county substring
// If caller passed 'AYRSHIRE' we match '%AYRSHIRE%'; if they passed '%AYRSHIRE%' we honor it.
async function getDistrictsByCounty(countyLike) {
  const p = await ensurePool();
  if (!p) return [];
  if (!countyLike || !countyLike.trim()) return [];
  const needle = countyLike.includes("%") ? countyLike.trim() : `%${countyLike.trim()}%`;
  try {
    const sql = `
      SELECT DISTINCT POSTCODE_DISTRICT
      FROM os_open_names
      WHERE UPPER(COUNTY_UNITARY) LIKE UPPER(?)
      ORDER BY POSTCODE_DISTRICT ASC
    `;
    const [rows] = await p.query(sql, [needle]);
    return rows.map(r => String(r.POSTCODE_DISTRICT).toUpperCase());
  } catch (e) {
    console.warn("[geo/mysql] getDistrictsByCounty error:", e.message);
    return [];
  }
}

// Public: rows where POSTCODE_DISTRICT starts with a prefix (e.g., 'G64')
async function getByDistrictPrefix(prefix) {
  const p = await ensurePool();
  if (!p) return [];
  if (!prefix || !prefix.trim()) return [];
  try {
    const sql = `
      SELECT *
      FROM os_open_names
      WHERE UPPER(POSTCODE_DISTRICT) LIKE CONCAT(UPPER(?), '%')
      LIMIT 2000
    `;
    const [rows] = await p.query(sql, [prefix.trim()]);
    return rows;
  } catch (e) {
    console.warn("[geo/mysql] getByDistrictPrefix error:", e.message);
    return [];
  }
}

// Pure function: parse a full UK postcode -> OUTCODE (variable length before 3-char incode)
function deriveOutcodeFromPostcode(postcode) {
  if (!postcode) return "";
  const raw = String(postcode).toUpperCase().trim();
  const noSpace = raw.replace(/\s+/g, "");
  // OUTCODE + INCODE(3) — simplified general UK postcode pattern
  const m = noSpace.match(/^([A-Z]{1,2}\d[A-Z\d]?)(\d[A-Z]{2})$/);
  if (m) return m[1];
  const sp = raw.indexOf(" ");
  if (sp > 0) return raw.slice(0, sp);
  if (raw.length > 3) return raw.slice(0, -3);
  return raw;
}

module.exports = {
  getDistrictsByCounty,
  getByDistrictPrefix,
  deriveOutcodeFromPostcode,
};
