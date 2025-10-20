import React, { useEffect, useMemo, useState } from "react";

/** ---------------- Types (kept local so we don't fight the originals) --------------- */
type Job = {
  id: string;
  jobTitleDisplay?: string;
  jobTitle?: string;
  jobLocation?: string;
  created?: string;
  locationTree?: string[];
  recruiterName?: string | null;            // legacy shape (string)
  recruiterId?: string | null;
  recruiter?: { id?: string; displayName?: string } | string | null; // new shape (object)
};

type Channel = { name: string; slug: string };
type AdminSettings = {
  apiEndpoint: string;
  enableFacebook?: boolean;
  enableGoogle?: boolean;
  enableLinkedin?: boolean;
  enableTiktok?: boolean;
};

const slugify = (s: string) =>
  String(s || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** --------------- Local storage helpers ---------------- */
const LS_CHANNELS = "admin.channels";
const LS_TOGGLE_PREFIX = "feed:job"; // feed:job:{jobId}:{channelSlug}

const loadLS = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};
const saveLS = (key: string, v: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {}
};

/** Safely derive the recruiter label from mixed shapes */
function getRecruiterLabel(j: Job): string {
  // 1) New shape (object)
  if (j.recruiter && typeof j.recruiter === "object") {
    const label =
      (j.recruiter as any)?.displayName ||
      (j.recruiter as any)?.name ||
      j.recruiterId ||
      j.recruiterName;
    if (label) return String(label);
  }
  // 2) New shape (string)
  if (typeof j.recruiter === "string" && j.recruiter.trim()) {
    return j.recruiter.trim();
  }
  // 3) Legacy fields
  if (typeof j.recruiterName === "string" && j.recruiterName.trim()) {
    return j.recruiterName.trim();
  }
  if (typeof j.recruiterId === "string" && j.recruiterId.trim()) {
    return j.recruiterId.trim();
  }
  return "—";
}

/** --------------- Channels come from Admin (or fallback) ---------------- */
function useChannels(admin: AdminSettings | null): Channel[] {
  return useMemo(() => {
    // If user has stored channels manually, prefer those
    const fromLS = loadLS<Channel[]>(LS_CHANNELS, []);
    if (fromLS.length) return fromLS;

    // Otherwise seed from admin flags (include if true or missing)
    const defaults: { key: keyof AdminSettings; name: string }[] = [
      { key: "enableFacebook", name: "facebook" },
      { key: "enableGoogle", name: "google" },
      { key: "enableLinkedin", name: "linkedin" },
      { key: "enableTiktok", name: "tiktok" },
    ];
    const seeded =
      admin
        ? defaults
            .filter((d) => (admin as any)[d.key] !== false)
            .map(({ name }) => ({ name, slug: slugify(name) }))
        : defaults.map(({ name }) => ({ name, slug: slugify(name) }));
    // persist so everything stays in sync app-wide
    saveLS(LS_CHANNELS, seeded);
    return seeded;
  }, [admin]);
}

/** --------------- Toggles per job/channel ---------------- */
function isOn(jobId: string, channelSlug: string): boolean {
  const key = `${LS_TOGGLE_PREFIX}:${jobId}:${channelSlug}`;
  return loadLS<boolean>(key, false);
}
function setOn(jobId: string, channelSlug: string, v: boolean) {
  const key = `${LS_TOGGLE_PREFIX}:${jobId}:${channelSlug}`;
  saveLS(key, v);
}

/** --------------- API base ---------------- */
function useApiBase(): string {
  return useMemo(() => {
    const v = (import.meta as any)?.env?.VITE_API_BASE_URL;
    const base = (typeof v === "string" && v.trim()) || "http://localhost:5174";
    return base.replace(/\/$/, "");
  }, []);
}

/** --------------- Main Jobs table (fixed) ---------------- */
export default function JobsCampaignsFixed() {
  const apiBase = useApiBase();

  const [adminSettings, setAdminSettings] = useState<AdminSettings | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  // Pull quick admin flags so we can show channels consistently across pages
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${apiBase}/api/admin/settings`);
        if (r.ok) setAdminSettings(await r.json());
      } catch {
        // non-fatal for this page
      }
    })();
  }, [apiBase]);

  const channels = useChannels(adminSettings);

  // Load first page of jobs — same endpoint you’re already using
  async function load() {
    setLoading(true);
    setError("");
    try {
      const url = `${apiBase}/api/jobs?perPage=50&pageNumber=1`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = await r.json();
      // Expect json.jobs from your sample
      setJobs(Array.isArray(json?.jobs) ? (json.jobs as Job[]) : []);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []); // first mount only

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Job Campaigns</h2>
        <div style={{ marginLeft: "auto", fontSize: 12, color: "#6b7280" }}>
          API: <code>{apiBase}</code>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
        <button
          onClick={load}
          style={{
            padding: "6px 12px",
            borderRadius: 8,
            border: "1px solid #e5e7eb",
            background: "#fff",
            cursor: "pointer",
          }}
        >
          Reload
        </button>
      </div>

      {/* Table header */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `minmax(280px,1.6fr) minmax(160px,0.9fr) minmax(200px,1.1fr) repeat(${channels.length}, 110px)`,
          gap: 12,
          padding: "10px 12px",
          border: "1px solid #e5e7eb",
          borderBottom: "none",
          background: "#f9fafb",
          fontWeight: 600,
        }}
      >
        <div>Job</div>
        <div>Recruiter</div>
        <div>Location</div>
        {channels.map((c) => (
          <div key={c.slug} style={{ textAlign: "center", textTransform: "lowercase" }}>
            {c.name}
          </div>
        ))}
      </div>

      {/* Table body */}
      <div style={{ border: "1px solid #e5e7eb", borderTop: "none" }}>
        {loading ? (
          <div style={{ padding: 16, color: "#6b7280" }}>Loading…</div>
        ) : error ? (
          <div style={{ padding: 16, color: "#b91c1c" }}>Error: {error}</div>
        ) : !jobs.length ? (
          <div style={{ padding: 16, color: "#6b7280" }}>No jobs.</div>
        ) : (
          jobs.map((j) => {
            const title = j.jobTitleDisplay || j.jobTitle || "Untitled";
            const recruiterLabel = getRecruiterLabel(j);
            const jobId = j.id;

            return (
              <div
                key={jobId}
                style={{
                  display: "grid",
                  gridTemplateColumns: `minmax(280px,1.6fr) minmax(160px,0.9fr) minmax(200px,1.1fr) repeat(${channels.length}, 110px)`,
                  gap: 12,
                  padding: "14px 12px",
                  borderTop: "1px solid #f3f4f6",
                  alignItems: "center",
                }}
              >
                {/* Job title + meta */}
                <div>
                  <div style={{ fontWeight: 600 }}>{title}</div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    ID: <code>{jobId}</code>
                  </div>
                </div>

                {/* Recruiter (fixed) */}
                <div>{recruiterLabel}</div>

                {/* Location (unchanged – keep your existing behaviour) */}
                <div>
                  <span style={{ color: "#6b7280" }}>
                    {j.jobLocation || (j.locationTree || []).join(", ") || "Select area…"}
                  </span>
                </div>

                {/* Dynamic channel toggles */}
                {channels.map((c) => {
                  const on = isOn(jobId, c.slug);
                  return (
                    <div key={c.slug} style={{ display: "flex", justifyContent: "center" }}>
                      {/* Same visual “toggle” you had, just wired safely */}
                      <button
                        aria-label={`Toggle ${c.name} for ${title}`}
                        onClick={() => {
                          setOn(jobId, c.slug, !on);
                          // Force a local re-render by touching state in place
                          setJobs((prev) => [...prev]);
                        }}
                        style={{
                          width: 44,
                          height: 26,
                          borderRadius: 999,
                          border: "1px solid " + (on ? "#16a34a" : "#e5e7eb"),
                          background: on ? "#16a34a" : "#f9fafb",
                          position: "relative",
                          cursor: "pointer",
                        }}
                      >
                        <span
                          style={{
                            position: "absolute",
                            top: 2,
                            left: on ? 22 : 2,
                            width: 22,
                            height: 22,
                            borderRadius: "50%",
                            background: "#fff",
                            boxShadow: "0 1px 2px rgba(0,0,0,0.12)",
                            transition: "left 120ms ease",
                          }}
                        />
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })
        )}
      </div>

      {/* Footnote to remind how feeds get filtered */}
      <div style={{ marginTop: 12, fontSize: 12, color: "#6b7280" }}>
        Only jobs with the toggle <strong>ON</strong> for a channel are included in that channel’s
        feed.
      </div>
    </div>
  );
}
