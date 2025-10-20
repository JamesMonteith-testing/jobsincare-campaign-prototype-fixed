// src/components/ui/AreaDropdown.tsx
import React, { useEffect, useMemo, useState } from "react";

type Area = {
  token: string;
  county_unitary?: string | null;
  district_borough?: string | null;
  name: string; // "County — District" or just County
};

function dedupeAndSort(list: Area[]): Area[] {
  const map = new Map<string, Area>();
  for (const a of list) {
    if (!a?.token) continue;
    const prev = map.get(a.token);
    if (!prev || (a.name && a.name.length > prev.name.length)) {
      map.set(a.token, a);
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export default function AreaDropdown({
  apiBase,
  jobId,
  currentToken,
  status,
  onSaved,
  // accepted but unused props (to avoid TS errors if parent passes them)
  initialSuggestions,
}: {
  apiBase: string;
  jobId: string;
  currentToken?: string | null;
  status?: "valid" | "missing" | "suggested";
  onSaved: (token: string) => void;
  initialSuggestions?: unknown;
}) {
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [areas, setAreas] = useState<Area[]>([]);
  const [value, setValue] = useState<string>(currentToken || "");

  // Preload ALL areas once (CSV-backed /api/areas?all=1)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const base = apiBase.replace(/\/$/, "");
        const r = await fetch(`${base}/api/areas?all=1`, {
          headers: { Accept: "application/json" },
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = (await r.json()) as Area[];
        if (!cancelled && Array.isArray(data)) {
          setAreas(dedupeAndSort(data));
        }
      } catch {
        // keep silent in UI; if this fails, the select will just show currentToken
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiBase]);

  // Keep currentToken reflected
  useEffect(() => {
    setValue(currentToken || "");
  }, [currentToken]);

  // Merge currentToken to top if not present
  const merged = useMemo(() => {
    const list = [...areas];
    if (currentToken && !list.some((a) => a.token === currentToken)) {
      list.unshift({
        token: currentToken,
        county_unitary: currentToken,
        district_borough: null,
        name: currentToken,
      });
    }
    return dedupeAndSort(list);
  }, [areas, currentToken]);

  async function save(token: string) {
    if (!token) return;
    setSaving(true);
    try {
      const r = await fetch(
        `${apiBase.replace(/\/$/, "")}/api/jobs/${encodeURIComponent(jobId)}/location`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ area: token }),
        }
      );
      if (!r.ok) throw new Error((await r.text()) || `HTTP ${r.status}`);
      onSaved(token);
    } finally {
      setSaving(false);
    }
  }

  return (
    <select
      value={value || ""}
      onChange={(e) => {
        const t = e.target.value;
        setValue(t);
        if (t) save(t);
      }}
      title={
        status !== "valid" ? "Select a valid area (county/unitary) first." : undefined
      }
      disabled={saving || loading}
      style={{
        width: "100%",
        padding: "6px 8px",
        border: "1px solid #d1d5db",
        borderRadius: 6,
      }}
    >
      <option value="">
        {loading ? "Loading areas…" : value ? value : "Select area…"}
      </option>
      {merged.map((a) => (
        <option key={a.token} value={a.token}>
          {a.name}
        </option>
      ))}
    </select>
  );
}
