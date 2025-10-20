// public/admin.js
const $ = (sel) => document.querySelector(sel);
const statusEl = $("#status");
const adminEl = $("#admin");
const alertEl = $("#alert");
const channelsWrap = $("#channels");

const g = {
  sourceFilter: $("#sourceFilter"),
  liveWeeks: $("#liveWeeks"),
  apiEndpoint: $("#apiEndpoint"),
  outputFormat: $("#outputFormat"),
  supplierLabel: $("#supplierLabel"),
};

let cache = { global: null, channels: [] };

function showAlert(kind, msg) {
  alertEl.innerHTML = `<div class="${kind === "ok" ? "ok" : "err"}">${msg}</div>`;
}

function fmtNow() {
  const d = new Date();
  return d.toLocaleString();
}

async function getJSON(url, init) {
  const r = await fetch(url, init);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

function hydrateGlobal(ui, data) {
  ui.sourceFilter.value = data.sourceFilter ?? "user";
  ui.liveWeeks.value = Number(data.liveWeeks ?? 6);
  ui.apiEndpoint.value = data.apiEndpoint ?? "";
  ui.outputFormat.value = data.outputFormat ?? "JSON";
  ui.supplierLabel.value = data.supplierLabel ?? "Jobs in Care";
}

function renderChannels(channels) {
  channelsWrap.innerHTML = "";
  if (!channels || !channels.length) {
    channelsWrap.innerHTML = `<div class="muted">No channels yet.</div>`;
    return;
  }
  for (const ch of channels) {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div><strong>${ch.label ?? ch.id}</strong> <span class="pill">${ch.id}</span></div>
        <label class="muted">
          <input type="checkbox" ${ch.enabled ? "checked" : ""} data-k="enabled" />
          Enabled
        </label>
      </div>
      <div class="row" style="margin-top:10px">
        <label>Endpoint</label>
        <input value="${ch.endpoint ?? ""}" data-k="endpoint" />
      </div>
      <div class="row">
        <label>Format</label>
        <select data-k="format">
          <option ${ch.format === "json" ? "selected" : ""}>json</option>
          <option ${ch.format === "xml" ? "selected" : ""}>xml</option>
        </select>
      </div>
    `;
    // wire change handlers: mutate in cache
    card.querySelectorAll("[data-k]").forEach((el) => {
      el.addEventListener("change", (e) => {
        const k = e.target.getAttribute("data-k");
        if (k === "enabled") {
          ch.enabled = !!e.target.checked;
        } else if (k === "endpoint") {
          ch.endpoint = e.target.value.trim();
        } else if (k === "format") {
          ch.format = e.target.value;
        }
      });
    });
    channelsWrap.appendChild(card);
  }
}

async function load() {
  try {
    statusEl.textContent = "Loading settings…";
    const data = await getJSON("/api/admin/settings");
    cache.global = data.global ?? {};
    cache.channels = Array.isArray(data.channels) ? data.channels : [];
    hydrateGlobal(g, cache.global);
    renderChannels(cache.channels);
    $("#meta").textContent =
      `API: ${cache.global.apiEndpoint || "(unset)"} • ` +
      `Source filter: ${cache.global.sourceFilter || "user"} • Loaded ${fmtNow()}`;
    adminEl.hidden = false;
    statusEl.textContent = "";
    showAlert("ok", "Settings loaded.");
  } catch (e) {
    adminEl.hidden = true;
    statusEl.textContent = "";
    showAlert("err", `Failed to load settings: ${e.message}`);
    console.error(e);
  }
}

async function saveGlobal() {
  try {
    const body = {
      global: {
        sourceFilter: g.sourceFilter.value.trim(),
        liveWeeks: Number(g.liveWeeks.value),
        apiEndpoint: g.apiEndpoint.value.trim(),
        outputFormat: g.outputFormat.value,
        supplierLabel: g.supplierLabel.value.trim(),
      },
    };
    await getJSON("/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    showAlert("ok", "Global settings saved.");
    await load();
  } catch (e) {
    showAlert("err", `Save failed: ${e.message}`);
    console.error(e);
  }
}

async function saveChannels() {
  try {
    const body = { channels: cache.channels };
    await getJSON("/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    showAlert("ok", "Channels saved.");
    await load();
  } catch (e) {
    showAlert("err", `Save failed: ${e.message}`);
    console.error(e);
  }
}

async function syncFromServer() {
  try {
    await getJSON("/api/jobs?pageNumber=1&perPage=1"); // cheap ping to force upstream sync in your API
    showAlert("ok", "Sync request sent. Check timestamps in header.");
  } catch (e) {
    showAlert("err", `Sync failed: ${e.message}`);
  }
}

$("#saveGlobal").addEventListener("click", saveGlobal);
$("#saveChannels").addEventListener("click", saveChannels);
$("#sync").addEventListener("click", syncFromServer);

load();
