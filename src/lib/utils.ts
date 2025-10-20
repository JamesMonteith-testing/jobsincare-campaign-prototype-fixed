// src/lib/utils.ts
import { ChannelKey, ChannelSettings, JobRow } from "./types";

export function todayISO(): string {
  const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString().slice(0, 10);
}
export function daysBetween(aISO: string, bISO: string): number {
  const a = new Date(aISO); a.setHours(0, 0, 0, 0);
  const b = new Date(bISO); b.setHours(0, 0, 0, 0);
  return Math.floor((b.getTime() - a.getTime()) / 86400000);
}
export function toISODate(input: any, fallbackToday = false): string {
  if (!input) return fallbackToday ? todayISO() : "";
  try { return new Date(String(input)).toISOString().slice(0, 10); } catch { return fallbackToday ? todayISO() : ""; }
}

export function isChannelLocked(settings: Record<ChannelKey, ChannelSettings>, key: ChannelKey): boolean {
  const meta = settings[key]; if (!meta) return true;
  return !meta.enabled || (meta.durationDays ?? 0) <= 0;
}

export function deriveStatusAsOf(row: JobRow, asOfISO: string): JobRow["status"] {
  if (!row.liveDate) return "Pending";
  const d = daysBetween(row.liveDate, asOfISO);
  if (d < 0) return "Pending";
  return d <= 42 ? "Live" : "Expired"; // 6 weeks window
}

export function download(name: string, data: string, mime: string) {
  const blob = new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a);
  a.click(); a.remove(); URL.revokeObjectURL(url);
}

export function xmlEscape(s: string) {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
}
