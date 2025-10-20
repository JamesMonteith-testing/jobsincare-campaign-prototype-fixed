import React, { useEffect, useMemo, useState, lazy, Suspense } from "react";

const AdminClient = lazy(() => import("./admin/AdminClient"));
const CampaignManagement = lazy(() => import("./manage/CampaignManagement"));

type Job = {
  id?: string;
  jobId?: string;
  title?: string;
  jobTitle?: string;
  jobTitleDisplay?: string;
  recruiterName?: string;
  recruiter?: any; // can be string or { id, displayName, ... }
  postedBy?: string;
  recruiterId?: string;
  location?: string;
  areaName?: string;
  jobLocation?: string;
  locationTree?: string[];
  createdAt?: string;
  created?: string;
};

type UiChannel = { name: string; slug: string };

// ---------- helpers ----------
const loadLS = <T,>(k: string, fb: T): T => {
  try {
    const raw = localStorage.getItem(k);
    return raw ? (JSON.parse(raw) as T) : fb;
  } catch {
    return fb;
  }
};
const CHANNELS_KEY = "manage.channels";
const readChannels = (): UiChannel[] =>
  loadLS<UiChannel[]>(CHANNELS_KEY, [
    { name: "facebook", slug: "facebook" },
    { name: "google", slug: "google" },
    { name: "linkedin", slug: "linkedin" },
    { name: "tiktok", slug: "tiktok" },
  ]);

const stext = (v: any) => (typeof v === "string" ? v : String(v ?? "")).trim();

/** Safely derive the recruiter label from mixed shapes */
const jobRecruiter = (j: any) => {
  // always prefer recruiterName, guaranteed by the API
  if (typeof j.recruiterName === "string" && j.recruiterName.trim()) {
    return j.recruiterName.trim();
  }
  return "—";
};

function extractJobs(js: any): Job[] {
  if (Array.isArray(js)) return js;
  const keys = ["items", "data", "results", "jobs", "records", "rows"];
  for (const k of keys) if (Array.isArray(js?.[k])) return js[k] as Job[];
  if (js && typeof js === "object") {
    for (const v of Object.values(js)) {
      if (Array.isArray(v) && v.length && typeof v[0] === "object") return v as Job[];
    }
  }
  return [];
}
const idOf = (j: Job) => j.id || j.jobId || "";

// ---------- mini router ----------
type TabKey = "jobs" | "manage" | "admin";
const getHashTab = (): TabKey => {
  const h = (location.hash || "").toLowerCase();
  if (h.includes("admin")) return "admin";
  if (h.includes("manage")) return "manage";
  return "jobs";
};

function TopNav({ active }: { active: TabKey }) {
  const link = (href: string, label: string, isActive: boolean) => (
    <a
      href={href}
      style={{
        textDecoration: "none",
        padding: "10px 14px",
        borderRadius: 8,
        border: "1px solid #e5e7eb",
        background: isActive ? "#2563eb" : "#f9fafb",
        color: isActive ? "#fff" : "#111827",
        fontWeight: 600,
      }}
    >
      {label}
    </a>
  );
  return (
    <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
      {link("#", "Job Campaigns", active === "jobs")}
      {link("#manage", "Campaign Management", active === "manage")}
      {link("#admin", "Administrator", active === "admin")}
      <a
        href="/expired.html"
        style={{
          textDecoration: "none",
          padding: "10px 14px",
          borderRadius: 8,
          border: "1px solid #e5e7eb",
          background: "#f9fafb",
          color: "#111827",
          fontWeight: 600,
        }}
      >
        Expired & Reactivate
      </a>
    </div>
  );
}

// ---------- accessible toggle switch ----------
function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  const knobLeft = checked ? 20 : 3;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      style={{
        width: 40,
        height: 22,
        borderRadius: 999,
        border: "1px solid #e5e7eb",
        background: disabled ? "#f3f4f6" : checked ? "#16a34a" : "#e5e7eb",
        position: "relative",
        cursor: disabled ? "not-allowed" : "pointer",
        padding: 0,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 3,
          left: knobLeft,
          width: 16,
          height: 16,
          borderRadius: 999,
          background: "#fff",
          boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
          transition: "left 120ms",
        }}
      />
    </button>
  );
}

// ---------- Jobs ----------
function JobsTable({ apiBase }: { apiBase: string }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [recruiterFilter, setRecruiterFilter] = useState("All");
  const [channels, setChannels] = useState<UiChannel[]>(readChannels());

  useEffect(() => {
    const update = () => setChannels(readChannels());
    window.addEventListener("storage", update);
    window.addEventListener("channels-updated", update as EventListener);
    return () => {
      window.removeEventListener("storage", update);
      window.removeEventListener("channels-updated", update as EventListener);
    };
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      try {
        const r = await fetch(`${apiBase}/api/jobs?perPage=50&pageNumber=1`, {
          headers: { Accept: "application/json" },
        });
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        const js = await r.json();
        setJobs(extractJobs(js));
      } catch (e: any) {
        setError(e?.message || "Failed to load jobs");
      } finally {
        setLoading(false);
      }
    })();
  }, [apiBase]);

  const recruiters = React.useMemo(() => {
    const s = new Set<string>();
    jobs.forEach((j) => {
      const r = jobRecruiter(j);
      if (r) s.add(r);
    });
    return ["All", ...Array.from(s).sort((a, b) => a.localeCompare(b))];
  }, [jobs]);

  const filteredJobs = jobs.filter(
    (j) => recruiterFilter === "All" || jobRecruiter(j) === recruiterFilter
  );

  const toggleKey = (jobId: string, slug: string) => `jc.toggle.${jobId}.${slug}`;
  const isOn = (jobId: string, slug: string) => loadLS<boolean>(toggleKey(jobId, slug), false);
  const setOn = (jobId: string, slug: string, v: boolean) =>
    localStorage.setItem(toggleKey(jobId, slug), JSON.stringify(v));

  return (
    <>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <div>
          <label style={{ fontSize: 13, color: "#6b7280", marginRight: 8 }}>Recruiter:</label>
        </div>
        <select
          value={recruiterFilter}
          onChange={(e) => setRecruiterFilter(e.target.value)}
          style={{ padding: "8px 10px", border: "1px solid #e5e7eb", borderRadius: 8 }}
        >
          {recruiters.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #e5e7eb",
            background: "#f9fafb",
            cursor: "pointer",
          }}
        >
          Reload
        </button>
        <div style={{ marginLeft: "auto", color: "#6b7280", fontSize: 13 }}>
          API: <code>{apiBase}</code>
        </div>
      </div>

      <div style={{ border: "1px solid #e5e7eb", borderRadius: 12 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `1.4fr 0.8fr 1fr ${channels.map(() => ".5fr").join(" ")}`,
            gap: 0,
            padding: "10px 12px",
            fontWeight: 600,
            color: "#6b7280",
            borderBottom: "1px solid #e5e7eb",
          }}
        >
          <div>Job</div>
          <div>Recruiter</div>
          <div>Location</div>
          {channels.map((c) => (
            <div key={c.slug} style={{ textAlign: "center", textTransform: "lowercase" }}>
              {c.slug}
            </div>
          ))}
        </div>

        {loading && <div style={{ padding: 16, color: "#6b7280" }}>Loading…</div>}
        {error && !loading && <div style={{ padding: 16, color: "#b91c1c" }}>Error: {error}</div>}
        {!loading && !error && filteredJobs.length === 0 && (
          <div style={{ padding: 16, color: "#6b7280" }}>No jobs.</div>
        )}

        {!loading &&
          !error &&
          filteredJobs.map((j, idx) => {
            const jobId = idOf(j);
            const created = j.createdAt || j.created || "";
            const title = j.jobTitleDisplay || j.title || j.jobTitle || "(untitled)";
            const loc =
              j.jobLocation || j.location || j.areaName || (j.locationTree || []).join(", ") || "";
            return (
              <div
                key={`${jobId}-${idx}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: `1.4fr 0.8fr 1fr ${channels.map(() => ".5fr").join(" ")}`,
                  gap: 0,
                  padding: "10px 12px",
                  borderTop: "1px solid #f3f4f6",
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>{title}</div>
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                    Created: {created ? new Date(created).toLocaleDateString() : "—"}
                    <br />ID: <code>{jobId || "—"}</code>
                  </div>
                </div>
                <div>{jobRecruiter(j) || "—"}</div>
                <div>{loc || <span style={{ color: "#6b7280" }}>Select area…</span>}</div>

                {channels.map((c) => {
                  const on = isOn(jobId, c.slug);
                  return (
                    <div key={c.slug} style={{ display: "flex", justifyContent: "center" }}>
                      <Toggle
                        checked={on}
                        onChange={(v) => {
                          setOn(jobId, c.slug, v);
                          // force an immediate re-render so the UI reflects the change
                          setJobs((prev) => [...prev]);
                        }}
                        label={`Enable ${c.name || c.slug} for job ${title}`}
                      />
                    </div>
                  );
                })}
              </div>
            );
          })}
      </div>
    </>
  );
}

// ---------- App shell ----------
export default function App() {
  const apiBase = useMemo(() => {
    const v = (import.meta as any)?.env?.VITE_API_BASE_URL;
    const base = (typeof v === "string" && v.trim()) || "http://localhost:5174";
    return base.replace(/\/$/, "");
  }, []);

  const [tab, setTab] = useState<TabKey>(getHashTab());
  useEffect(() => {
    const onHash = () => setTab(getHashTab());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  return (
    <div style={{ padding: 16 }}>
      <TopNav active={tab} />
      <Suspense fallback={<div style={{ color: "#6b7280" }}>Loading…</div>}>
        {tab === "jobs" && <JobsTable apiBase={apiBase} />}
        {tab === "manage" && <CampaignManagement />}
        {tab === "admin" && <AdminClient />}
      </Suspense>
    </div>
  );
}
