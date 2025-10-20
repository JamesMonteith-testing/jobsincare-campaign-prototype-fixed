import React, { useEffect, useMemo, useState } from "react";

/** ---------------- Types ---------------- */
type ChannelKey = "google" | "facebook" | "linkedin" | "tiktok";
type AdminSettings = {
  apiEndpoint: string;
  liveWindowWeeks: number;
  enableFacebook: boolean;
  enableGoogle: boolean;
  enableLinkedin: boolean;
  enableTiktok: boolean;
};

type ChannelConfig = {
  enabled: boolean;
  premiumBudget: number;
  premiumPlusBudget: number;
  defaultDurationDays: number;
  loading?: boolean;
  error?: string;
  jobCount?: number;
};

type UiChannel = { name: string; slug: string };

/** ---------------- Helpers ---------------- */
const DEFAULT_CHANNELS: UiChannel[] = [
  { name: "Google", slug: "google" },
  { name: "Facebook", slug: "facebook" },
  { name: "LinkedIn", slug: "linkedin" },
  { name: "TikTok", slug: "tiktok" },
];

const DEFAULT_CONFIG: Record<ChannelKey, ChannelConfig> = {
  google:   { enabled: true,  premiumBudget: 200, premiumPlusBudget: 350, defaultDurationDays: 14 },
  facebook: { enabled: true,  premiumBudget: 200, premiumPlusBudget: 350, defaultDurationDays: 14 },
  linkedin: { enabled: true,  premiumBudget: 200, premiumPlusBudget: 350, defaultDurationDays: 14 },
  tiktok:   { enabled: true,  premiumBudget: 200, premiumPlusBudget: 350, defaultDurationDays: 14 },
};

const loadLS = <T,>(key: string, fallback: T): T => {
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : fallback; }
  catch { return fallback; }
};
const saveLS = (key: string, value: unknown) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** For sync across pages */
const CHANNELS_KEY = "manage.channels";
function broadcastChannelsUpdated() {
  window.dispatchEvent(new CustomEvent("channels-updated"));
}

const readChannels = (): UiChannel[] => {
  const list = loadLS<UiChannel[]>(CHANNELS_KEY, []);
  return list.length ? list : DEFAULT_CHANNELS;
};

// tolerant extractor for counting jobs on “Sync from server”
function extractJobs(js: any): any[] {
  if (Array.isArray(js)) return js;
  const keys = ["items", "data", "results", "jobs", "records", "rows"];
  for (const k of keys) { if (Array.isArray(js?.[k])) return js[k]; }
  if (js && typeof js === "object") {
    for (const v of Object.values(js)) {
      if (Array.isArray(v) && v.length && typeof v[0] === "object") return v as any[];
    }
  }
  return [];
}

/** ---------------- Component ---------------- */
export default function CampaignManagement() {
  const apiBase = useMemo(() => {
    const v = (import.meta as any)?.env?.VITE_API_BASE_URL;
    const base = (typeof v === "string" && v.trim()) || "http://localhost:5174";
    return base.replace(/\/$/, "");
  }, []);

  const [adminSettings, setAdminSettings] = useState<AdminSettings | null>(null);
  const [channels, setChannels] = useState<UiChannel[]>(readChannels());
  const [newName, setNewName] = useState("");

  const [configs, setConfigs] = useState<Record<ChannelKey, ChannelConfig>>(
    loadLS<Record<ChannelKey, ChannelConfig>>("manage.configs", DEFAULT_CONFIG)
  );
  const [lastSyncAt, setLastSyncAt] = useState<string>(loadLS("manage.lastSyncAt", ""));

  // Save & broadcast channel list
  useEffect(() => {
    saveLS(CHANNELS_KEY, channels);
    broadcastChannelsUpdated();
  }, [channels]);

  // Load admin settings (default window label)
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${apiBase}/api/admin/settings`, { headers: { Accept: "application/json" } });
        if (r.ok) setAdminSettings(await r.json());
      } catch {}
    })();
  }, [apiBase]);

  // Persist configs + last sync
  useEffect(() => { saveLS("manage.configs", configs); }, [configs]);
  useEffect(() => { if (lastSyncAt) saveLS("manage.lastSyncAt", lastSyncAt); }, [lastSyncAt]);

  const updateCfg = (key: ChannelKey, patch: Partial<ChannelConfig>) =>
    setConfigs(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  const refreshJobs = async (key: ChannelKey) => {
    updateCfg(key, { loading: true, error: "", jobCount: undefined });
    try {
      const r = await fetch(`${apiBase}/api/jobs?perPage=50&pageNumber=1`, { headers: { Accept: "application/json" } });
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      const js = await r.json();
      const list = extractJobs(js);
      updateCfg(key, { loading: false, jobCount: list.length });
      setLastSyncAt(new Date().toLocaleString());
    } catch (e: any) {
      updateCfg(key, { loading: false, error: e?.message || "Fetch failed" });
    }
  };

  const addChannel = () => {
    const name = newName.trim();
    if (!name) return;
    const slug = slugify(name);
    if (channels.some(c => c.slug === slug)) { setNewName(""); return; }
    setChannels(chs => [...chs, { name, slug }]);
    setNewName("");
  };

  const removeChannel = (slug: string) => {
    setChannels(chs => chs.filter(c => c.slug !== slug));
  };

  const localhostBase = "http://localhost:5174";
  const formatsMap = loadLS<Record<string, "json" | "xml">>("admin.formats", {});
  const feedUrlFor = (slug: string) => {
    const fmt = formatsMap[slug] || "json";
    return `${localhostBase}/api/${slug}.${fmt}`;
  };

  const SectionCard: React.FC<{ title: string; enabled: boolean; onToggle(): void; children: React.ReactNode; onRemove?(): void }> = ({
    title, enabled, onToggle, children, onRemove
  }) => (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, background: "#fff" }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 12, gap: 8 }}>
        <div style={{ fontWeight: 700 }}>{title}</div>
        <div style={{ marginLeft: "auto", display: "inline-flex", gap: 8, alignItems: "center" }}>
          <span style={{ color: "#6b7280", fontSize: 13 }}>Enabled</span>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input type="checkbox" checked={enabled} onChange={onToggle} style={{ width: 0, height: 0, opacity: 0, position: "absolute" }} />
            <span aria-hidden style={{ width: 40, height: 22, borderRadius: 999, display: "inline-block", background: enabled ? "#2563eb" : "#e5e7eb", position: "relative", transition: "background 120ms" }}>
              <span style={{ position: "absolute", top: 3, left: enabled ? 20 : 3, width: 16, height: 16, borderRadius: 999, background: "#fff", transition: "left 120ms" }} />
            </span>
          </label>
          {onRemove && (
            <button onClick={onRemove} title="Remove channel" style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#f9fafb", cursor: "pointer" }}>
              Remove
            </button>
          )}
        </div>
      </div>
      {children}
    </div>
  );

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
        <h2 style={{ fontWeight: 700, fontSize: 20, margin: 0 }}>Campaign Management</h2>
        <div style={{ marginLeft: "auto", color: "#6b7280", fontSize: 13 }}>
          Source: <strong>campaigns</strong>
          {adminSettings && <> • Default window: <strong>{adminSettings.liveWindowWeeks} days</strong></>}
        </div>
      </div>

      {/* Add channel */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Add new channel (e.g. 'Indeed')…"
          onKeyDown={(e) => e.key === "Enter" && addChannel()}
          style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb", minWidth: 260 }}
        />
        <button
          onClick={addChannel}
          style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #2563eb", background: "#2563eb", color: "#fff", cursor: "pointer" }}
        >
          Add channel
        </button>
      </div>

      {/* Only channels configured here are shown */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 16 }}>
        {channels.map(({ name, slug }) => {
          // fall back to google/facebook/linkedin/tiktok config buckets for budgets; others aren’t persisted by key but UI still works
          const key = (slug as ChannelKey);
          const cfg = (configs[key] || { enabled: true, premiumBudget: 200, premiumPlusBudget: 350, defaultDurationDays: 14 }) as ChannelConfig;
          const feedUrl = feedUrlFor(slug);

          return (
            <SectionCard
              key={slug}
              title={name}
              enabled={cfg.enabled && cfg.defaultDurationDays !== 0}
              onToggle={() => {
                const willEnable = !(cfg.enabled && cfg.defaultDurationDays !== 0);
                if (willEnable && (["google","facebook","linkedin","tiktok"] as string[]).includes(slug)) {
                  refreshJobs(slug as ChannelKey);
                }
                if ((["google","facebook","linkedin","tiktok"] as string[]).includes(slug)) {
                  const k = slug as ChannelKey;
                  updateCfg(k, { enabled: willEnable });
                }
              }}
              onRemove={() => removeChannel(slug)}
            >
              <div style={{ display: "grid", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 6 }}>Budget — Premium</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ padding: "8px 10px", border: "1px solid #e5e7eb", borderRadius: 8, background: "#f9fafb" }}>£</div>
                    <input type="number" min={0} defaultValue={cfg.premiumBudget} style={{ padding: "8px 10px", border: "1px solid #e5e7eb", borderRadius: 8, width: "100%" }} />
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 6 }}>Budget — Premium Plus</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ padding: "8px 10px", border: "1px solid #e5e7eb", borderRadius: 8, background: "#f9fafb" }}>£</div>
                    <input type="number" min={0} defaultValue={cfg.premiumPlusBudget} style={{ padding: "8px 10px", border: "1px solid #e5e7eb", borderRadius: 8, width: "100%" }} />
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 6 }}>Default Duration (days)</div>
                  <input type="number" min={0} defaultValue={cfg.defaultDurationDays} style={{ padding: "8px 10px", border: "1px solid #e5e7eb", borderRadius: 8, width: "100%" }} />
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
                    Setting <code>0</code> locks the channel (toggles grey).
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <a href={feedUrl} target="_blank" rel="noreferrer" style={{ color: "#2563eb", wordBreak: "break-all" }}>{feedUrl}</a>
                  <button
                    onClick={async () => { try { await navigator.clipboard.writeText(feedUrl); } catch { alert("Copy failed"); } }}
                    style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#f9fafb", cursor: "pointer" }}
                  >
                    Copy link
                  </button>
                </div>

                <div style={{ fontSize: 12, color: "#6b7280" }}>
                  Source of truth for channels • Formats are set in <strong>Administrator</strong>.
                </div>
              </div>
            </SectionCard>
          );
        })}
      </div>

      <div style={{ marginTop: 8, color: "#6b7280", fontSize: 12, textAlign: "right" }}>
        API: <code>{apiBase}</code> {lastSyncAt ? <> • Last sync {lastSyncAt}</> : null}
      </div>
    </div>
  );
}
