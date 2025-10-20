import React, { useEffect, useMemo, useState } from "react";
import AreaDropdown from "../ui/AreaDropdown";

type Any = Record<string, any>;
type Channel = { id: string; format: "json" | "xml"; active: boolean };
type PublishState = { channels: Channel[]; byChannel: Record<string, Record<string, Any>> };

type Job = {
  id: string;
  title?: string;
  jobTitle?: string;
  jobLocation?: string;
  locationTree?: string[];
  recruiter?: { displayName?: string; name?: string };
  recruiterName?: string;
  consultant?: string;
  owner?: { name?: string };

  // NEW: geo fields from server
  areaToken?: string | null;
  locationStatus?: "valid" | "missing" | "suggested";
  areaSuggestions?: Array<string | { token?: string; name?: string; score?: number }>;
};

function apiBase(): string {
  const env = (import.meta as any)?.env?.VITE_API_BASE_URL;
  if (env && typeof env === "string" && env.trim()) return env.trim();
  return "http://localhost:5174";
}

function recruiterOf(j: Job): string {
  return (
    j?.recruiter?.displayName ||
    j?.recruiter?.name ||
    j?.recruiterName ||
    j?.consultant ||
    j?.owner?.name ||
    ""
  );
}
function createdOf(j: Job): string | null {
  return (
    (j as any).created ||
    (j as any).createdDate ||
    (j as any).created_at ||
    (j as any).dateCreated ||
    (j as any).datePosted ||
    (j as any).published_at ||
    (j as any).date ||
    null
  );
}
function fmtDate(s?: string | null) {
  if (!s) return "";
  try { return new Date(s).toLocaleDateString(); } catch { return s; }
}
function isAreaValid(j: Job): boolean {
  return j.locationStatus === "valid" && !!j.areaToken;
}

function Switch({
  disabled = false,
  checked,
  onChange,
  title,
}: {
  disabled?: boolean;
  checked: boolean;
  onChange: (v: boolean) => void;
  title?: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-disabled={disabled}
      title={title}
      disabled={disabled}
      onClick={() => { if (disabled) return; onChange(!checked); }}
      style={{
        width: 44,
        height: 24,
        display: "inline-block",
        background: checked ? "#10b981" : "#e5e7eb",
        borderRadius: 999,
        position: "relative",
        cursor: disabled ? "not-allowed" : "pointer",
        outline: "none",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: checked ? 22 : 2,
          width: 20,
          height: 20,
          borderRadius: 999,
          background: "#fff",
          boxShadow: "0 1px 2px rgba(0,0,0,.25)",
          transition: "left 120ms ease",
        }}
      />
    </button>
  );
}

export default function JobCampaigns() {
  const API = useMemo(apiBase, []);
  const [pub, setPub] = useState<PublishState | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  // recruiter filter (kept)
  const [recruiter, setRecruiter] = useState("__ALL__");

  // simple paging
  const [pageNumber, setPageNumber] = useState(1);
  const perPage = 50;

  async function loadStateAndJobs(selectedRecruiter = recruiter) {
    try {
      setLoading(true);

      // publish state
      const r1 = await fetch(`${API}/api/publish/state`, { headers: { Accept: "application/json" }, cache: "no-store" });
      setPub(await r1.json());

      // jobs
      const url = new URL(`${API}/api/jobs`);
      url.searchParams.set("perPage", "500");
      url.searchParams.set("pageNumber", "1");
      if (selectedRecruiter && selectedRecruiter !== "__ALL__") {
        url.searchParams.set("recruiter", selectedRecruiter);
      }
      const r2 = await fetch(url.toString(), { headers: { Accept: "application/json" }, cache: "no-store" });
      const j2 = await r2.json();
      setJobs(j2.jobs || []);
      setPageNumber(1);
    } catch (e: any) {
      setMsg(`Load failed: ${e?.message || String(e)}`);
    } finally {
      setLoading(false);
      setTimeout(() => setMsg(""), 3000);
    }
  }

  useEffect(() => { loadStateAndJobs(); /* eslint-disable-line */ }, []);

  function isToggled(jobId: string, channelId: string): boolean {
    const ch = pub?.byChannel?.[channelId] || {};
    return !!ch[String(jobId)];
  }

  async function doToggle(jobId: string, channelId: string, active: boolean) {
    try {
      const r = await fetch(`${API}/api/publish/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ jobId, channelId, active }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      // optimistic update
      setPub((prev) => {
        const next: PublishState = prev
          ? { channels: prev.channels, byChannel: JSON.parse(JSON.stringify(prev.byChannel || {})) }
          : { channels: [], byChannel: {} };
        next.byChannel[channelId] ||= {};
        if (active) next.byChannel[channelId][String(jobId)] = { activatedAt: new Date().toISOString() };
        else delete next.byChannel[channelId][String(jobId)];
        return next;
      });
    } catch (e: any) {
      setMsg(e?.message || String(e));
      setTimeout(() => setMsg(""), 2500);
    }
  }

  // derived & paging
  const filtered = useMemo(() => {
    let arr = jobs.slice();
    if (recruiter !== "__ALL__") {
      arr = arr.filter((j) => recruiterOf(j).toLowerCase() === recruiter.toLowerCase());
    }
    arr.sort((a, b) => +new Date(createdOf(b) || 0) - +new Date(createdOf(a) || 0));
    return arr;
  }, [jobs, recruiter]);

  const maxPage = Math.max(1, Math.ceil(filtered.length / perPage));
  const page = filtered.slice((pageNumber - 1) * perPage, pageNumber * perPage);

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ marginBottom: 8 }}>Job Campaigns</h2>

      {!!msg && (
        <div style={{
          marginBottom: 12, padding: 10, border: "1px solid #fbbf24",
          background: "#fef3c7", color: "#92400e", borderRadius: 8,
        }}>{msg}</div>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
        <div style={{ color: "#6b7280" }}>Recruiter:</div>
        <select value={recruiter} onChange={(e) => setRecruiter(e.target.value)}
                style={{ padding: 6, border: "1px solid #d1d5db", borderRadius: 6 }}>
          {[ "__ALL__", ...Array.from(new Set(jobs.map(recruiterOf).filter(Boolean))).sort((a,b)=>a.localeCompare(b)) ]
            .map((r) => <option key={r} value={r}>{r==="__ALL__" ? "All" : r}</option>)}
        </select>
        <button onClick={() => loadStateAndJobs()}
                style={{ marginLeft: 8, padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: 6, background: "#f9fafb", cursor: "pointer" }}>
          Reload
        </button>
      </div>

      {loading ? (
        <div style={{ color: "#6b7280" }}>Loading…</div>
      ) : (
        <div>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, background: "#fff", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ background: "#f3f4f6" }}>
                <tr>
                  <th style={{ textAlign: "left", padding: 10 }}>Job</th>
                  <th style={{ textAlign: "left", padding: 10 }}>Recruiter</th>
                  <th style={{ textAlign: "left", padding: 10 }}>Location</th>
                  {pub?.channels?.map((c) => (
                    <th key={c.id} style={{ textAlign: "center", padding: 10 }}>{c.id}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {page.length === 0 ? (
                  <tr>
                    <td colSpan={(pub?.channels?.length || 0) + 3} style={{ padding: 12, color: "#6b7280" }}>
                      No jobs match your filter.
                    </td>
                  </tr>
                ) : (
                  page.map((j) => (
                    <tr key={j.id} style={{ borderTop: "1px solid #e5e7eb" }}>
                      <td style={{ padding: 10 }}>
                        <div><strong>{j.title || j.jobTitle || "(untitled)"}</strong></div>
                        <div style={{ color: "#6b7280", fontSize: 12 }}>Created: {fmtDate(createdOf(j)) || "—"}</div>
                        <div style={{ color: "#6b7280", fontFamily: "ui-monospace, Menlo, Consolas, monospace" }}>ID: {j.id}</div>
                      </td>

                      <td style={{ padding: 10 }}>{recruiterOf(j) || "—"}</td>

                      <td style={{ padding: 10 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ minWidth: 220 }}>
                            {j.jobLocation || (Array.isArray(j.locationTree) ? j.locationTree.join(" › ") : "") || "—"}
                          </div>
                          <div style={{ flex: "0 0 260px" }}>
                            <AreaDropdown
                              apiBase={API}
                              jobId={String(j.id)}
                              currentToken={j.areaToken ?? null}
                              status={j.locationStatus}
                              initialSuggestions={j.areaSuggestions}
                              onSaved={(token) => {
                                setJobs((prev) => prev.map((row) =>
                                  row.id === j.id
                                    ? ({ ...row, areaToken: token, locationStatus: "valid" })
                                    : row
                                ));
                              }}
                            />
                          </div>
                        </div>
                      </td>

                      {pub?.channels?.map((c) => (
                        <td key={c.id} style={{ textAlign: "center", padding: 10 }}>
                          <Switch
                            disabled={!isAreaValid(j)}
                            checked={!!pub?.byChannel?.[c.id]?.[String(j.id)]}
                            onChange={(v) => doToggle(j.id, c.id, v)}
                            title={!isAreaValid(j) ? "Select a valid area (county/unitary) first." : `Publish to ${c.id}`}
                          />
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
            <button
              onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
              style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #d1d5db", background: "#f9fafb", cursor: "pointer" }}
            >
              ← Prev
            </button>
            <div style={{ color: "#6b7280" }}>Page {pageNumber} of {maxPage}</div>
            <button
              onClick={() => setPageNumber((p) => Math.min(maxPage, p + 1))}
              style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #d1d5db", background: "#f9fafb", cursor: "pointer" }}
            >
              Next →
            </button>
            <div style={{ marginLeft: "auto", color: "#6b7280" }}>API: {API}</div>
          </div>
        </div>
      )}
    </div>
  );
}
