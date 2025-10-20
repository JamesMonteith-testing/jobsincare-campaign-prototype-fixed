// src/lib/types.ts

export type ChannelKey = string;
export type TabKey = "jobs" | "manage" | "admin";
export type CreditType = "Premium" | "Premium Plus";
export type SortKey = "date" | "title" | "recruiter";
export type SortDir = "asc" | "desc";
export type OutputFormat = "json" | "xml";

export interface JobRow {
  id: string;
  title: string;
  department: string;
  location: string;
  recruiter: string;
  status: "Live" | "Expired" | "Pending";
  eligibleDate: string;     // created date
  liveDate: string | null;  // created date mirrors "eligibleDate"
  channels: Record<ChannelKey, boolean>;
  source: "user" | string;
  credit: CreditType;
  url?: string;
}

export interface ChannelSettings {
  label: string; // shown as "Supplier" in UI
  enabled: boolean;
  budgets: { premium: number; premiumPlus: number };
  durationDays: number;
  endpoint: string;
  source: "user";
  exportFormat?: OutputFormat; // json | xml
  accessToken?: string; // placeholder, not used yet
}

export type JobsInCareAPI = { jobs?: any[]; [k: string]: any };

export interface AdminConfig {
  apiBase: string;       // e.g., https://jobsincare.com
  sourceFilter: string;  // e.g., "user" (blank = all)
}

export interface ApiInfo {
  base: string;
  usedSample: boolean;
  lastSync?: string;
  error?: string;
  stats?: { totalFetched: number; liveCount: number };
}
