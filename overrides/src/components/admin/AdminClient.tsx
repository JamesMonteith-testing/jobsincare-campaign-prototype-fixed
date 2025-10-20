import React, { useEffect, useMemo, useState } from "react";

type Settings = {
  apiEndpoint: string;
  liveWindowWeeks: number;
  enableFacebook: boolean;
  enableGoogle: boolean;
  enableLinkedin: boolean;
  enableTiktok: boolean;
};

type Channel = {
  name: string;
  slug: string;
  format: "json" | "xml";
};

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const LS_CHANNELS = "manage.channels";
const loadLS = <T,>(k: string, fb: T): T => {
  try {
    const raw = localStorage.getItem(k);
    return raw ? (JSON.parse(raw) as T) : fb;
  } catch {
    return fb;
  }
};
const saveLS = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {}
};

function readChannels(): Channel[] {
  const fb: Channel[] = [
    { name: "Facebook", slug: "facebook", format: "json" },
    { name: "Google", slug: "google", format: "json" },
    { name: "LinkedIn", slug: "linkedin", format: "json" },
    { name: "TikTok", slug: "tiktok", format: "json" },
  ];
  return loadLS<Channel[]>(LS_CHANNELS, fb);
}

function setChannelsLS(chs: Channel[]) {
  saveLS(LS_CHANNELS, chs);
  // Let other tabs/components know channels changed
  window.dispatchEvent(new Event("channels-updated"));
}

function getOnIdsForChannel(slug: string): string[] {
  // keys look like jc.toggle.<jobId>.<slug> = true
  const ids: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i) || "";
    if (!k.startsWith("jc.toggle.")) continue;
    // jc.toggle.<id>.<slug>
    const parts = k.split(".");
    if (parts.length < 4) continue;
    const s = parts[3];
    if (s !== slug) continue;
    const v = localStorage.getItem(k);
    if (v && v.toLowerCase() === "true") {
      const id = parts[2];
      ids.push(id);
    }
  }
  return ids;
}

export default function AdminClient() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState("");
  const [channels, setChannels] = useState<Channel[]>(readChannels());
  const [newName, setNewName] = useState("");

  const apiBase = useMemo(() => {
    const v = (import.meta as any)?.env?.VITE_API_BASE_URL;
    const base = (typeof v === "string" && v.trim()) || "http://localhost:5174";
    return base.replace(/\/$/, "");
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${apiBase}/api/admin/settings`, {
          headers: { Accept: "application/json" },
        });
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        setSettings((await r.json()) as Settings);
        setError("");
      } catch (e: any) {
        setError(e?.message || "Failed to reach admin settings");
      }
    })();
  }, [apiBase]);

  const addChannel = () => {
    const name = newName.trim();
    if (!name) return;
    const slug = slugify(name);
    if (channels.some((c) => c.slug === slug)) {
      setNewName("");
      return;
    }
    const next = [...channels, { name, slug, format: "json" }];
    setChannels(next);
    setChannelsLS(next);
    setNewName("");
  };

  const updateFormat = (slug: string, fmt: "json" | "xml") => {
    const next = channels.map((c) => (c.slug === slug ? { ...c, format: fmt } : c));
    setChannels(next);
    setChannelsLS(next);
  };

  const removeChannel = (slug: string) => {
    const next = channels.filter((c) => c.slug !== slug);
    setChannels(next);
    setChannelsLS(next);
  };

  function dataUrlFor(c: Channel) {
    const ids = getOnIdsForChannel(c.slug);
    const q = ids.length ? `?ids=${encodeURIComponent(ids.join(","))}` : "";
    return `http://localhost:5174/api/${c.slug}.${c.format}${q}`;
  }

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      alert("Copied link!");
    } catch {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      alert("Copied link!");
    }
  };

  if (error) {
    return (
      <div style={{ padding: 16, color: "#b91c1c" }}>
        Admin error: <code>{error}</code>
      </div>
    );
  }
  if (!settings) {
    return <div style={{ padding: 16, color: "#6b7280" }}>Loading admin…</div>;
  }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
        <h2 style={{ fontWeight: 700, fontSize: 20, margin: 0 }}>Admin</h2>
        <div style={{ marginLeft: "auto", color: "#6b7280", fontSize: 13 }}>
          API: <code>{apiBase}</code>
        </div>
      </div>

      {/* Channels manager – single page */}
      <div style={{ display: "grid", gap: 12 }}>
        {channels.map((c) => {
          const url = dataUrlFor(c);
          return (
            <div
              key={c.slug}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 12,
                padding: 14,
                background: "#fff",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 16 }}>{c.name}</div>
                <div style={{ color: "#6b7280", fontSize: 12 }}>({c.slug})</div>
                <div style={{ marginLeft: "auto" }}>
                  <button
                    onClick={() => removeChannel(c.slug)}
                    style={{
                      border: "1px solid #e5e7eb",
                      background: "#f9fafb",
                      borderRadius: 8,
                      padding: "6px 10px",
                      cursor: "pointer",
                    }}
                    title="Remove channel"
                  >
                    Remove
                  </button>
                </div>
              </div>

              <div style={{ marginTop: 8, display: "flex", gap: 16, alignItems: "center" }}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <label style={{ color: "#374151" }}>Format</label>
                  <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                    <input
                      type="radio"
                      name={`fmt-${c.slug}`}
                      checked={c.format === "json"}
                      onChange={() => updateFormat(c.slug, "json")}
                    />
                    JSON
                  </label>
                  <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                    <input
                      type="radio"
                      name={`fmt-${c.slug}`}
                      checked={c.format === "xml"}
                      onChange={() => updateFormat(c.slug, "xml")}
                    />
                    XML
                  </label>
                </div>
              </div>

              <div style={{ marginTop: 10, fontSize: 14 }}>
                Data URL:{" "}
                <a href={url} target="_blank" rel="noreferrer">
                  {url}
                </a>{" "}
                <button
                  onClick={() => copy(url)}
                  style={{
                    marginLeft: 8,
                    border: "1px solid #2563eb",
                    background: "#2563eb",
                    color: "#fff",
                    borderRadius: 8,
                    padding: "6px 10px",
                    cursor: "pointer",
                  }}
                >
                  Copy link
                </button>
              </div>

              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
                (This link is constructed for <code>localhost</code> only. It includes only jobs
                toggled ON for <code>{c.slug}</code>.)
              </div>
            </div>
          );
        })}

        {/* Add channel */}
        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            padding: 14,
            background: "#fff",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Add a new channel</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addChannel()}
              placeholder="Channel name (e.g., Indeed)"
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #e5e7eb",
                minWidth: 240,
              }}
            />
            <button
              onClick={addChannel}
              style={{
                border: "1px solid #2563eb",
                background: "#2563eb",
                color: "#fff",
                borderRadius: 8,
                padding: "8px 12px",
                cursor: "pointer",
              }}
            >
              Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
