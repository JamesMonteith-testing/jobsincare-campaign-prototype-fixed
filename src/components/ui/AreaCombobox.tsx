// src/components/ui/AreaDropdown.tsx


export default function AreaDropdown({
apiBase,
jobId,
currentToken,
status,
initialSuggestions,
onSaved,
}: {
apiBase: string;
jobId: string;
currentToken?: string | null;
status?: "valid" | "missing" | "suggested";
initialSuggestions?: Suggestion[];
onSaved: (token: string) => void;
}) {
// Build option list from suggestions and include current token if not present
const [saving, setSaving] = useState(false);
const opts = useMemo(() => {
const base: { token: string; label: string }[] = Array.isArray(initialSuggestions) ? initialSuggestions.map(norm) : [];
const hasCurrent = currentToken && base.some(o => o.token === currentToken);
const list = [...base];
if (currentToken && !hasCurrent) list.unshift({ token: currentToken, label: currentToken });
// dedupe
const seen = new Set<string>(); const out: { token: string; label: string }[] = [];
for (const o of list) { if (!o.token || seen.has(o.token)) continue; seen.add(o.token); out.push(o); }
return out;
}, [initialSuggestions, currentToken]);


const [value, setValue] = useState<string>(currentToken || "");


useEffect(() => { setValue(currentToken || ""); }, [currentToken]);


async function save(token: string) {
if (!token) return;
setSaving(true);
try {
const r = await fetch(`${apiBase.replace(/\/$/, "")}/api/jobs/${encodeURIComponent(jobId)}/location`, {
method: "POST",
headers: { "Content-Type": "application/json", Accept: "application/json" },
body: JSON.stringify({ area: token }),
});
if (!r.ok) throw new Error(await r.text() || `HTTP ${r.status}`);
onSaved(token);
} finally {
setSaving(false);
}
}


const disabled = saving;


return (
<select
value={value || ""}
onChange={(e) => { const t = e.target.value; setValue(t); if (t) save(t); }}
title={status !== "valid" ? "Select a valid area (county/unitary) first." : undefined}
disabled={disabled}
style={{ width: "100%", padding: "6px 8px", border: "1px solid #d1d5db", borderRadius: 6 }}
>
<option value="">{value ? value : "Select area…"}</option>
{opts.map((o) => (
<option key={o.token} value={o.token}>{o.label}</option>
))}
</select>
);
}