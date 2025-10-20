// src/lib/api.ts
import { ChannelKey, ChannelSettings, CreditType, JobsInCareAPI, JobRow } from "./types";
import { toISODate } from "./utils";

export class ApiClient {
  constructor(public base: string, public token?: string) {}

  private headers(): Record<string, string> {
    const h: Record<string, string> = { Accept: "application/json" };
    if (this.token) h.Authorization = `Bearer ${this.token}`;
    return h;
  }

  private async get(path: string) {
    const baseTrimmed = this.base.endsWith("/") ? this.base.slice(0, -1) : this.base;
    const url = `${baseTrimmed}${path}`;
    const res = await fetch(url, { method: "GET", headers: this.headers(), credentials: "omit", cache: "no-store", mode: "cors" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async fetchPagedJobs(maxPages = 10): Promise<any[]> {
    const all: any[] = [];
    let page = 1;
    let mode: "unknown" | "pageNumber" | "page" = "unknown";

    while (page <= maxPages) {
      let raw: JobsInCareAPI | null = null;

      if (mode === "unknown" || mode === "pageNumber") {
        try { raw = await this.get(`/api/jobs?pageNumber=${page}`) as JobsInCareAPI; mode = "pageNumber"; } catch {}
      }
      if (!raw && (mode === "unknown" || mode === "page")) {
        try { raw = await this.get(`/api/jobs?page=${page}`) as JobsInCareAPI; mode = "page"; } catch {}
      }
      if (!raw) break;

      const chunk = Array.isArray(raw.jobs) ? raw.jobs : [];
      if (chunk.length === 0) break;

      all.push(...chunk);

      const perPage = Number((raw as any).perPage ?? chunk.length);
      const these = Number((raw as any).theseJobsCount ?? chunk.length);
      if (these < perPage) break;
      page += 1;
    }
    return all;
  }
}

/** map listing type -> credit */
function mapListingTypeToCredit(listingType: any): CreditType {
  const v = String(listingType || "").toLowerCase().trim();
  if (v === "premiumplus" || v === "premium-plus" || v === "premier position" || v === "premierposition" || v === "premium_plus") return "Premium Plus";
  return "Premium";
}

/** Adapt API payload to JobRow[] */
export function adaptFromJobsInCare(raw: JobsInCareAPI, knownChannels: Record<ChannelKey, ChannelSettings>): JobRow[] {
  const list = Array.isArray(raw.jobs) ? raw.jobs : [];
  return list.map((j: any, i: number) => {
    const id = String(j.id ?? `ext-${i + 1}`);
    const title = String(j.jobTitleDisplay || j.jobTitle || "Untitled role").trim();
    const recruiter = (j.recruiter?.displayName) ? String(j.recruiter.displayName) : "Jobs in Care";
    const location = String(j.jobLocation || (Array.isArray(j.locationTree) ? j.locationTree.join(", ") : "UK"));
    const createdISO = toISODate(j.created, true);
    const credit = mapListingTypeToCredit(j.listingType);
    const source = String(j.source || "user") as "user";
    const url = j.url ? String(j.url) : undefined;

    const channels: Record<string, boolean> = {};
    Object.keys(knownChannels).forEach(k => (channels[k] = false));

    return {
      id,
      title,
      department: "General",
      location,
      recruiter,
      status: "Pending",
      eligibleDate: createdISO,
      liveDate: createdISO,
      channels: channels as Record<ChannelKey, boolean>,
      source,
      credit,
      url,
    };
  });
}
