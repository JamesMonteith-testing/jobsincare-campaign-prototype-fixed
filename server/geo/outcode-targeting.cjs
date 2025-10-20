// server/geo/outcode-targeting.cjs
// CommonJS helper to derive outcodes + stats for a jobLocation.
// Uses tables: os_open_names, postcode_district_stats
// Env: GEO_DB_DIALECT=mysql with MYSQL_HOST/PORT/USER/PASSWORD/DATABASE

const mysql = require('mysql2/promise');

// UK postcode -> outcode regex (handles most formats, incl. GIR 0AA)
const OUTCODE_REGEX = /^([A-Z]{1,2}\d{1,2}[A-Z]?)[\s]?\d[A-Z]{2}$/i;

function extractOutcodeFromPostcode(input) {
  if (!input) return null;
  const s = String(input).trim().toUpperCase();
  const m = s.match(OUTCODE_REGEX);
  return m ? m[1] : null;
}

async function makePool() {
  return mysql.createPool({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    multipleStatements: false,
  });
}

// Expand a broad location (e.g., "AYRSHIRE") to distinct POSTCODE_DISTRICTs
async function expandAreaToOutcodes(pool, location) {
  const q = `
    SELECT DISTINCT POSTCODE_DISTRICT AS outcode
    FROM os_open_names
    WHERE POSTCODE_DISTRICT IS NOT NULL AND POSTCODE_DISTRICT <> ''
      AND (
        COUNTY_UNITARY LIKE CONCAT('%', ?, '%')
        OR DISTRICT_BOROUGH LIKE CONCAT('%', ?, '%')
        OR REGION LIKE CONCAT('%', ?, '%')
      )
    ORDER BY outcode
  `;
  const [rows] = await pool.execute(q, [location, location, location]);
  return rows.map(r => r.outcode);
}

// Fetch radius/diameter per outcode from postcode_district_stats
async function fetchOutcodeStats(pool, outcodes) {
  if (!outcodes || outcodes.length === 0) return new Map();
  const placeholders = outcodes.map(() => '?').join(',');
  const q = `
    SELECT outcode, approx_radius_km, approx_diameter_km,
           centroid_easting_m, centroid_northing_m
    FROM postcode_district_stats
    WHERE outcode IN (${placeholders})
  `;
  const [rows] = await pool.execute(q, outcodes);
  const map = new Map();
  for (const r of rows) {
    map.set(r.outcode, {
      outcode: r.outcode,
      approx_radius_km: Number(r.approx_radius_km),
      approx_diameter_km: Number(r.approx_diameter_km),
      centroid_easting_m: Number(r.centroid_easting_m),
      centroid_northing_m: Number(r.centroid_northing_m),
    });
  }
  return map;
}

/**
 * Resolve location to outcodes + stats.
 * @param {string} jobLocation (may be full postcode, town/county, etc.)
 * @param {object} [opts] { pool, preferStrictCountyMatch=false }
 * @returns { postal_codes: string[], coverage: Array<{outcode, approx_radius_km, approx_diameter_km, centroid_easting_m, centroid_northing_m}> }
 */
async function resolveTargeting(jobLocation, opts = {}) {
  const pool = opts.pool || (await makePool());
  const outcodes = [];
  const statsList = [];

  // 1) If it's a valid full UK postcode, derive outcode
  const outcodeFromPC = extractOutcodeFromPostcode(jobLocation);
  if (outcodeFromPC) {
    const stats = await fetchOutcodeStats(pool, [outcodeFromPC]);
    const item = stats.get(outcodeFromPC);
    if (item) {
      outcodes.push(outcodeFromPC);
      statsList.push(item);
    } else {
      // Still add the outcode even if stats missing (rare)
      outcodes.push(outcodeFromPC);
    }
  } else if (jobLocation && jobLocation.trim()) {
    // 2) Otherwise, treat as an area/county/region string
    const area = jobLocation.trim();
    const expanded = await expandAreaToOutcodes(pool, area);
    if (expanded.length) {
      outcodes.push(...expanded);
      const stats = await fetchOutcodeStats(pool, expanded);
      for (const oc of expanded) {
        const item = stats.get(oc);
        if (item) statsList.push(item);
      }
    }
  }

  // Deduplicate/normalize
  const uniq = Array.from(new Set(outcodes.map(String))).sort();

  // Platform-friendly serializations
  const metaBulkText = uniq.join('\n'); // paste into Meta bulk “Add locations in bulk”
  const platform_serializations = {
    meta_bulk_text: metaBulkText,
    tiktok_postal_codes: uniq,
    linkedin_postal_codes: uniq,
    pinterest_postal_codes: uniq,
    google_ads_postal_codes: uniq, // Next step: optional mapping to Google Geo IDs
  };

  return {
    postal_codes: uniq,
    postal_code_system: 'GB_POSTCODE_DISTRICT',
    coverage: statsList.sort((a, b) => a.outcode.localeCompare(b.outcode)),
    platform_serializations,
  };
}

module.exports = {
  resolveTargeting,
  extractOutcodeFromPostcode,
};
