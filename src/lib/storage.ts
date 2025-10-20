// src/lib/storage.ts
import { AdminConfig, ChannelKey, ChannelSettings } from "./types";

const LS_ADMIN = "jcm.admin";
const LS_CHANNELS = "jcm.channels";

export const DEFAULT_CHANNELS: Record<ChannelKey, ChannelSettings> = {
  google:   { label: "Google",   enabled: true, budgets: { premium: 200, premiumPlus: 350 }, durationDays: 14, endpoint: "https://feeds.google.com/jobs",       source: "user", exportFormat: "json", accessToken: "" },
  facebook: { label: "Facebook", enabled: true, budgets: { premium: 200, premiumPlus: 350 }, durationDays: 14, endpoint: "https://graph.facebook.com/ads",     source: "user", exportFormat: "json", accessToken: "" },
  linkedin: { label: "LinkedIn", enabled: true, budgets: { premium: 200, premiumPlus: 350 }, durationDays: 14, endpoint: "https://api.linkedin.com/jobfeeds",   source: "user", exportFormat: "json", accessToken: "" },
  tiktok:   { label: "TikTok",   enabled: true, budgets: { premium: 200, premiumPlus: 350 }, durationDays: 14, endpoint: "https://business-api.tiktokglobalshop.com/feeds", source: "user", exportFormat: "json", accessToken: "" },
};

export function loadAdmin(fallbackBase: string): AdminConfig {
  try {
    const raw = localStorage.getItem(LS_ADMIN);
    if (raw) return JSON.parse(raw) as AdminConfig;
  } catch {}
  return { apiBase: fallbackBase, sourceFilter: "" };
}

export function saveAdmin(cfg: AdminConfig) {
  try { localStorage.setItem(LS_ADMIN, JSON.stringify(cfg)); } catch {}
}

export function loadChannels(): Record<ChannelKey, ChannelSettings> {
  try {
    const raw = localStorage.getItem(LS_CHANNELS);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<ChannelKey, ChannelSettings>;
      const merged: Record<ChannelKey, ChannelSettings> = { ...DEFAULT_CHANNELS, ...parsed };
      for (const k of Object.keys(merged)) {
        merged[k].exportFormat = merged[k].exportFormat || "json";
        merged[k].accessToken = merged[k].accessToken ?? "";
      }
      return merged;
    }
  } catch {}
  return DEFAULT_CHANNELS;
}

export function saveChannels(ch: Record<ChannelKey, ChannelSettings>) {
  try { localStorage.setItem(LS_CHANNELS, JSON.stringify(ch)); } catch {}
}

export function slugifyLabel(label: string) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function ensureUniqueKey(existing: Record<ChannelKey, ChannelSettings>, base: string) {
  if (!existing[base]) return base;
  const suffix = Date.now().toString(36);
  return `${base}-${suffix}`;
}
