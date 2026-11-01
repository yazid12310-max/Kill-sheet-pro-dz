import { compute, DEFAULT_INPUTS, tripRows } from "./engine.js";
import { STR, GUIDE, METHODS } from "./i18n.js";

// ---------- state ----------
const LS = { lang: "ksp.lang", inputs: "ksp.inputs", device: "ksp.device", tab: "ksp.tab" };
const state = {
  lang: localStorage.getItem(LS.lang) || "ar",
  tab: localStorage.getItem(LS.tab) || "calc",
  inputs: { ...DEFAULT_INPUTS, ...JSON.parse(localStorage.getItem(LS.inputs) || "{}") },
  trip: null,
};
let deviceId = localStorage.getItem(LS.device);
if (!deviceId) { deviceId = crypto.randomUUID(); localStorage.setItem(LS.device, deviceId); }

const t = (k) => STR[state.lang][k] ?? STR.en[k] ?? k;
const u = (k) => STR[state.lang].units[k] ?? k;
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (v, d = 0) => (v == null || Number.isNaN(v) ? "—" : Number(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));

async function api(path, opts = {}) {
  const res = await fetch(`/api/${path}`, {
    ...opts,
    headers: { "content-type": "application/json", "x-device-id": deviceId, ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.json();
}

function toast(msg, kind = "ok") {
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add("out"), 2200);
  setTimeout(() => el.remove(), 2600);
}

// ---------- tabs ----------
const TABS = [
  ["calc", "tabCalc", "M4 4h16v16H4z M8 8h8 M8 12h8 M8 16h5"],
  ["step", "tabStep", "M3 5h5v5h5v5h5v4"],
  ["trip", "tabTrip", "M12 3v18 M7 8l5-5 5 5 M7 16l5 5 5-5"],
  ["shift", "tabShift", "M12 7v5l3 3 M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18"],
  ["saved", "tabSaved", "M4 7h16v13H4z M3 4h18v3H3z M10 11h4"],
  ["guide", "tabGuide", "M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z M5 17a3 3 0 0 1 3-3h11"],
  ["methods", "tabMethods", "M4 6h7v12H4z M13 6h7v12h-7z"],
];

function renderShell() {
  document.documentElement.lang = state.lang;
  document.documentElement.dir = state.lang === "ar" ? "rtl" : "ltr";
  $("#brand-tag").textContent = t("tagline");
  $("#lang-btn").textContent = t("lang");
  $("#tabs").innerHTML = TABS.map(([id, key, d]) => `
    <button class="tab ${state.tab === id ? "active" : ""}" data-tab="${id}" aria-current="${state.tab === id ? "page" : "false"}">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg><span>${t(key)}</span>
    </button>`).join("");
}

function go(tab) {
  state.tab = tab;
  localStorage.setItem(LS.tab, tab);
  renderShell();
  const view = $("#view");
  view.classList.remove("enter"); void view.offsetWidth; view.classList.add("enter");
  ({ calc: viewCalc, step: viewStep, trip: viewTrip, shift: viewShift, saved: viewSaved, guide: viewGuide, methods: viewMethods })[tab]();
  window.scrollTo({ top: 0 });
}

// ---------- kill sheet ----------
const SECTIONS = [
  ["secWell", [["well", "", "text"], ["rig", "", "text"], ["md", "ft"], ["tvd", "ft"], ["omw", "ppg"]]],
  ["secFormation", [["shoeMd", "ft"], ["shoeTvd", "ft"], ["lotPressure", "psi"], ["lotMw", "ppg"]]],
  ["secKick", [["sidpp", "psi"], ["sicp", "psi"], ["pitGain", "bbl"]]],
  ["secPump", [["pumpOutput", "bblstk"], ["killRate", "spm"], ["scr", "psi"], ["surfaceLineStrokes", "stk"]]],
  ["secString", [["dpLen", "ft"], ["dpCap", "bblft"], ["hwdpLen", "ft"], ["hwdpCap", "bblft"], ["dcLen", "ft"], ["dcCap", "bblft"]]],
  ["secAnnulus", [["dcOhCap", "bblft"], ["dpOhCap", "bblft"], ["dpCsgCap", "bblft"]]],
];

function field(key, unit, type = "number", value = state.inputs[key]) {
  return `<label class="field">
    <span class="lbl">${t(key)}</span>
    <span class="inp"><input name="${key}" type="${type}" ${type === "number" ? 'inputmode="decimal" step="any" dir="ltr"' : ""} value="${esc(value)}"/>${unit ? `<em>${u(unit)}</em>` : ""}</span>
  </label>`;
}

function stat(label, value, unit, cls = "") {
  return `<div class="stat ${cls}"><span class="lbl">${label}</span><b dir="ltr">${value}<small>${unit ? u(unit) : ""}</small></b></div>`;
}

function viewCalc() {
  $("#view").innerHTML = `
    <header class="pagehead"><span class="kicker">IWCF · Surface BOP</span><h1>${t("tabCalc")}</h1></header>
    <div class="calc-grid">
      <form id="calc-form" class="inputs">
        ${SECTIONS.map(([sec, fields], n) => `
          <fieldset style="--d:${n}"><legend><i>${String(n + 1).padStart(2, "0")}</i>${t(sec)}</legend>
            <div class="fields">${fields.map(([k, unit, type]) => field(k, unit, type)).join("")}</div>
          </fieldset>`).join("")}
        <div class="actions">
          <button type="button" class="btn ghost" id="reset-btn">${t("reset")}</button>
          <button type="button" class="btn ghost" id="print-btn">${t("print")}</button>
        </div>
      </form>
      <aside class="results" id="results"></aside>
    </div>`;
  const form = $("#calc-form");
  form.addEventListener("input", (e) => {
    const { name, value } = e.target;
    state.inputs[name] = value;
    localStorage.setItem(LS.inputs, JSON.stringify(state.inputs));
    renderResults();
  });
  $("#reset-btn").onclick = () => { state.inputs = { ...DEFAULT_INPUTS }; localStorage.removeItem(LS.inputs); viewCalc(); };
  $("#print-btn").onclick = () => window.print();
  renderResults();
}

function renderResults() {
  const r = compute(state.inputs);
  const box = $("#results");
  if (r.errors.length) {
    box.innerHTML = `<div class="panel warn">${r.errors.map((e) => `<p>⚠ ${t(e)} &gt; 0</p>`).join("")}</div>`;
    return;
  }
  const sicp = Number(state.inputs.sicp) || 0;
  const alarm = sicp >= r.maasp ? `<div class="alarm danger">${t("sicpOver")}</div>`
    : sicp >= r.maasp * 0.85 ? `<div class="alarm">${t("sicpWarn")}</div>` : "";
  box.innerHTML = `
    ${alarm}
    <section class="panel hero">
      <h2>${t("resKill")}</h2>
      <div class="hero-row">
        ${stat(t("kmw"), fmt(r.kmw, 1), "ppg", "big accent")}
        ${stat(t("icp"), fmt(r.icp), "psi", "big")}
        ${stat(t("fcp"), fmt(r.fcp), "psi", "big")}
      </div>
      <div class="stats">
        ${stat(t("formationPressure"), fmt(r.formationPressure), "psi")}
        ${stat(t("overbalance"), fmt(r.overbalanceKmw), "psi")}
        ${stat(t("dropPer100"), fmt(r.dropPer100, 1), "psi")}
      </div>
    </section>
    <section class="panel">
      <h2>${t("resFrac")}</h2>
      <div class="stats">
        ${stat(t("mamw"), fmt(r.mamw, 1), "ppg")}
        ${stat(t("maasp"), fmt(r.maasp), "psi", sicp >= r.maasp ? "bad" : "")}
        ${stat(t("newMaasp"), fmt(r.newMaasp), "psi")}
      </div>
      ${gauge(sicp, r.maasp)}
    </section>
    <section class="panel">
      <h2>${t("resVol")}</h2>
      <table class="tbl">
        <thead><tr><th></th><th>${u("bbl")}</th><th>${u("stk")}</th><th>${u("min")}</th></tr></thead>
        <tbody>
          ${row(t("surfToBit"), r.stringVol, r.surfToBit, r.inputs.killRate)}
          ${row(t("bitToShoe"), r.openHoleVol, r.bitToShoe, r.inputs.killRate)}
          ${row(t("shoeToSurf"), r.csgVol, r.shoeToSurf, r.inputs.killRate)}
          ${row(t("bottomsUp"), r.annulusVol, r.bottomsUp, r.inputs.killRate)}
          ${row(t("totalStrokes"), r.totalVol, r.totalStrokes, r.inputs.killRate, "total")}
        </tbody>
      </table>
    </section>
    <section class="panel">
      <h2>${t("resInflux")}</h2>
      <div class="stats">
        ${stat(t("influxHeight"), fmt(r.influxHeight), "ft")}
        ${stat(t("influxGradient"), r.influxGradient == null ? "—" : fmt(r.influxGradient, 3), "psift")}
        ${stat(t("influxType"), r.influxType === "—" ? "—" : t(r.influxType), "", `type-${r.influxType}`)}
      </div>
    </section>
    <section class="panel save">
      <label class="field"><span class="lbl">${t("sheetName")}</span>
        <span class="inp"><input id="sheet-name" value="${esc(state.inputs.well || "")} ${new Date().toISOString().slice(0, 10)}"/></span></label>
      <button class="btn primary" id="save-btn">${t("save")}</button>
    </section>`;
  $("#save-btn").onclick = async (e) => {
    const btn = e.currentTarget; btn.disabled = true;
    try {
      await api("sheets", { method: "POST", body: { name: $("#sheet-name").value.trim() || t("tabCalc"), well: state.inputs.well, inputs: state.inputs, results: r } });
      toast(t("saved"));
    } catch { toast(t("netErr"), "err"); }
    btn.disabled = false;
  };
}

const row = (label, vol, stk, spm, cls = "") =>
  `<tr class="${cls}"><th>${label}</th><td dir="ltr">${fmt(vol, 1)}</td><td dir="ltr">${fmt(stk)}</td><td dir="ltr">${spm > 0 ? fmt(stk / spm, 1) : "—"}</td></tr>`;

function gauge(sicp, maasp) {
  const pct = maasp > 0 ? Math.min(sicp / maasp, 1.2) : 0;
  const w = Math.min(pct / 1.2, 1) * 100;
  return `<div class="gauge" title="SICP / MAASP"><div class="bar"><span style="width:${w}%" class="${pct >= 1 ? "bad" : pct >= 0.85 ? "mid" : ""}"></span><i style="inset-inline-start:${100 / 1.2}%"></i></div>
    <div class="gauge-l" dir="ltr"><span>SICP ${fmt(sicp)} psi</span><span>${fmt(pct * 100)}% MAASP</span></div></div>`;
}

// ---------- step-down ----------
function viewStep() {
  const r = compute(state.inputs);
  if (r.errors.length) { $("#view").innerHTML = `<div class="panel warn">${t("tabCalc")} ⚠</div>`; return; }
  $("#view").innerHTML = `
    <header class="pagehead"><span class="kicker">ICP ${fmt(r.icp)} → FCP ${fmt(r.fcp)} psi</span><h1>${t("stepTitle")}</h1></header>
    <div class="step-grid">
      <section class="panel chart-panel">
        ${chart(r)}
        <p class="hint">${t("stepHint")}</p>
        <div class="stats">
          ${stat(t("dropPer100"), fmt(r.dropPer100, 1), "psi", "accent")}
          ${stat(t("surfToBit"), fmt(r.surfToBit), "stk")}
          ${stat(t("time"), fmt(r.surfToBitMin, 1), "min")}
          ${field("steps", "", "number")}
        </div>
      </section>
      <section class="panel">
        <table class="tbl schedule">
          <thead><tr><th>${t("step")}</th><th>${t("strokes")}</th><th>${t("pressure")} (psi)</th><th>${t("time")} (${u("min")})</th></tr></thead>
          <tbody>${r.schedule.map((s) => `<tr><th dir="ltr">${s.step}</th><td dir="ltr">${fmt(s.strokes)}</td><td dir="ltr" class="p">${fmt(s.pressure)}</td><td dir="ltr">${fmt(s.minutes, 1)}</td></tr>`).join("")}
          <tr class="total"><th>→</th><td dir="ltr">${fmt(r.totalStrokes)}</td><td dir="ltr" class="p">${fmt(r.fcp)}</td><td dir="ltr">${fmt(r.totalMin, 1)}</td></tr></tbody>
        </table>
      </section>
    </div>`;
  $("#view input[name=steps]").addEventListener("change", (e) => {
    state.inputs.steps = e.target.value; localStorage.setItem(LS.inputs, JSON.stringify(state.inputs)); viewStep();
  });
}

function chart(r) {
  const W = 640, H = 300, P = { l: 56, r: 18, t: 18, b: 40 };
  const maxS = Math.max(r.totalStrokes, 1);
  const maxP = Math.ceil((Math.max(r.icp, r.fcp) * 1.1) / 100) * 100 || 100;
  const x = (s) => P.l + (s / maxS) * (W - P.l - P.r);
  const y = (p) => H - P.b - (p / maxP) * (H - P.t - P.b);
  const pts = [...r.schedule.map((s) => [x(s.strokes), y(s.pressure)]), [x(r.totalStrokes), y(r.fcp)]];
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("");
  const area = `${line}L${x(r.totalStrokes)},${y(0)}L${x(0)},${y(0)}Z`;
  const yt = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(maxP * f));
  const xt = [0, r.surfToBit, r.totalStrokes];
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" dir="ltr" role="img" aria-label="${t("stepTitle")}">
    <defs><linearGradient id="ga" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".35"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>
    ${yt.map((v) => `<line x1="${P.l}" x2="${W - P.r}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${P.l - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join("")}
    ${xt.map((v) => `<line x1="${x(v)}" x2="${x(v)}" y1="${P.t}" y2="${H - P.b}" class="grid v"/><text x="${x(v)}" y="${H - P.b + 18}" text-anchor="middle">${fmt(v)}</text>`).join("")}
    <text x="${x(r.surfToBit)}" y="${P.t + 12}" text-anchor="middle" class="tag">BIT</text>
    <text x="${x(r.totalStrokes) - 4}" y="${P.t + 12}" text-anchor="end" class="tag">SURFACE</text>
    <path d="${area}" fill="url(#ga)"/>
    <path d="${line}" class="ln"/>
    ${r.schedule.map((s) => `<circle cx="${x(s.strokes)}" cy="${y(s.pressure)}" r="3.5" class="dot"><title>${fmt(s.strokes)} stk · ${fmt(s.pressure)} psi</title></circle>`).join("")}
    <text x="${x(0) + 6}" y="${y(r.icp) - 8}" class="lab">ICP ${fmt(r.icp)}</text>
    <text x="${x(r.surfToBit) + 6}" y="${y(r.fcp) - 8}" class="lab">FCP ${fmt(r.fcp)}</text>
    <text x="${(W + P.l) / 2}" y="${H - 6}" text-anchor="middle" class="axis">${t("strokes")}</text>
  </svg>`;
}

// ---------- trip sheet ----------
const newTrip = () => ({ id: null, name: `${t("tabTrip")} ${new Date().toISOString().slice(0, 16).replace("T", " ")}`, settings: { direction: "pooh", pipeDisp: 0.0076, standLen: 93, tolerance: 2 }, entries: [] });

async function viewTrip() {
  if (!state.trip) state.trip = newTrip();
  $("#view").innerHTML = `
    <header class="pagehead"><span class="kicker">Trip tank · Hole fill</span><h1>${t("tripTitle")}</h1></header>
    <section class="panel" id="trip-editor"></section>
    <section class="panel"><h2>${t("trips")}</h2><div id="trip-list" class="list"><div class="skel"></div><div class="skel"></div></div></section>`;
  renderTripEditor();
  loadTrips();
}

function renderTripEditor() {
  const tr = state.trip, s = tr.settings;
  const rows = tripRows(s, tr.entries);
  const last = rows[rows.length - 1];
  const tol = Number(s.tolerance) || 0;
  let status = "";
  if (last) {
    const bad = s.direction === "pooh" ? last.cumDiff < -tol : last.cumDiff > tol;
    status = `<div class="alarm ${bad ? "danger" : "ok"}">${bad ? t(s.direction === "pooh" ? "tripWarnPooh" : "tripWarnRih") : t("tripOk")} <b dir="ltr">${last.cumDiff > 0 ? "+" : ""}${fmt(last.cumDiff, 2)} ${u("bbl")}</b></div>`;
  }
  $("#trip-editor").innerHTML = `
    <div class="fields trip-head">
      <label class="field wide"><span class="lbl">${t("tripName")}</span><span class="inp"><input data-k="name" value="${esc(tr.name)}"/></span></label>
      <label class="field"><span class="lbl">${t("direction")}</span><span class="inp"><select data-s="direction">
        <option value="pooh" ${s.direction === "pooh" ? "selected" : ""}>${t("pooh")}</option>
        <option value="rih" ${s.direction === "rih" ? "selected" : ""}>${t("rih")}</option></select></span></label>
      ${["pipeDisp:bblft", "standLen:ft", "tolerance:bbl"].map((p) => { const [k, un] = p.split(":"); return `<label class="field"><span class="lbl">${t(k)}</span><span class="inp"><input data-s="${k}" type="number" step="any" dir="ltr" value="${esc(s[k])}"/><em>${u(un)}</em></span></label>`; }).join("")}
    </div>
    ${status}
    <div class="scroll-x"><table class="tbl trip">
      <thead><tr><th>#</th><th>${t("standNo")}</th><th>${t("standsCount")}</th><th>${t("calc")}</th><th>${t("actual")}</th><th>${t("diff")}</th><th>${t("cum")} Δ</th><th>${t("notes")}</th><th></th></tr></thead>
      <tbody>${rows.map((e, i) => {
        const bad = s.direction === "pooh" ? e.cumDiff < -tol : e.cumDiff > tol;
        return `<tr data-i="${i}" class="${bad ? "flag" : ""}">
          <th dir="ltr">${i + 1}</th>
          <td><input data-e="standNo" dir="ltr" value="${esc(e.standNo)}"/></td>
          <td><input data-e="stands" type="number" step="any" dir="ltr" value="${esc(e.stands)}"/></td>
          <td dir="ltr">${fmt(e.calc, 2)}</td>
          <td><input data-e="actual" type="number" step="any" dir="ltr" value="${esc(e.actual)}"/></td>
          <td dir="ltr" class="${e.diff < 0 ? "neg" : "pos"}">${fmt(e.diff, 2)}</td>
          <td dir="ltr" class="${bad ? "neg" : ""}"><b>${fmt(e.cumDiff, 2)}</b></td>
          <td><input data-e="notes" value="${esc(e.notes)}"/></td>
          <td><button class="x" data-del="${i}" aria-label="${t("del")}">×</button></td></tr>`;
      }).join("")}</tbody>
    </table></div>
    <div class="actions">
      <button class="btn ghost" id="add-row">+ ${t("addRow")}</button>
      <span class="grow"></span>
      <button class="btn ghost" id="new-trip">${t("newTrip")}</button>
      <button class="btn primary" id="save-trip">${t("saveTrip")}</button>
    </div>`;

  const ed = $("#trip-editor");
  ed.onchange = (e) => {
    const el = e.target;
    if (el.dataset.k) tr.name = el.value;
    else if (el.dataset.s) tr.settings[el.dataset.s] = el.value;
    else if (el.dataset.e) tr.entries[+el.closest("tr").dataset.i][el.dataset.e] = el.value;
    else return;
    // re-render after focus has moved, then restore it to the same cell
    setTimeout(() => {
      const a = document.activeElement, tr0 = a?.closest("tr");
      const sel = a?.dataset.e && tr0 ? `tr[data-i="${tr0.dataset.i}"] [data-e="${a.dataset.e}"]` : a?.dataset.s ? `[data-s="${a.dataset.s}"]` : a?.dataset.k ? "[data-k]" : null;
      renderTripEditor();
      if (sel) $(`#trip-editor ${sel}`)?.focus();
    });
  };
  ed.onclick = (e) => { const d = e.target.dataset.del; if (d != null) { tr.entries.splice(+d, 1); renderTripEditor(); } };
  $("#add-row").onclick = () => {
    const prev = tr.entries[tr.entries.length - 1];
    const n = prev && /^\d+$/.test(prev.standNo) ? String(+prev.standNo + (tr.settings.direction === "pooh" ? -1 : 1) * (Number(prev.stands) || 1)) : "";
    tr.entries.push({ standNo: n, stands: prev?.stands ?? 5, actual: "", notes: "" });
    renderTripEditor();
    $("#trip-editor tbody tr:last-child input[data-e=actual]")?.focus();
  };
  $("#new-trip").onclick = () => { state.trip = newTrip(); renderTripEditor(); };
  $("#save-trip").onclick = async (e) => {
    e.currentTarget.disabled = true;
    try {
      const body = { name: tr.name, settings: tr.settings, entries: tr.entries };
      const row = tr.id ? await api(`trips/${tr.id}`, { method: "PUT", body }) : await api("trips", { method: "POST", body });
      tr.id = row.id; toast(t("saved")); loadTrips();
    } catch { toast(t("netErr"), "err"); }
    renderTripEditor();
  };
}

async function loadTrips() {
  const box = $("#trip-list");
  try {
    const trips = await api("trips");
    if (!box.isConnected) return;
    box.innerHTML = trips.length ? trips.map((tr) => `
      <article class="item ${state.trip?.id === tr.id ? "current" : ""}">
        <div><b>${esc(tr.name)}</b><span class="meta">${t(tr.settings.direction)} · ${tr.entries.length} ${t("standsCount")} · ${new Date(tr.updatedAt).toLocaleString()}</span></div>
        <div class="item-actions"><button class="btn sm" data-open="${tr.id}">${t("load")}</button><button class="btn sm ghost" data-rm="${tr.id}">${t("del")}</button></div>
      </article>`).join("") : `<div class="empty">${t("noTrips")}</div>`;
    box.onclick = async (e) => {
      const open = e.target.dataset.open, rm = e.target.dataset.rm;
      if (open) { const tr = trips.find((x) => x.id === +open); state.trip = structuredClone({ id: tr.id, name: tr.name, settings: tr.settings, entries: tr.entries }); renderTripEditor(); loadTrips(); window.scrollTo({ top: 0, behavior: "smooth" }); }
      if (rm && confirm(t("confirmDel"))) { await api(`trips/${rm}`, { method: "DELETE" }); if (state.trip?.id === +rm) state.trip.id = null; loadTrips(); }
    };
  } catch { box.innerHTML = `<div class="empty err">${t("netErr")}</div>`; }
}

// ---------- my shift ----------
function viewShift() {
  const today = new Date().toISOString().slice(0, 10);
  $("#view").innerHTML = `
    <header class="pagehead"><span class="kicker">Daily drilling report</span><h1>${t("shiftTitle")}</h1></header>
    <div class="shift-grid">
      <form class="panel" id="shift-form">
        <div class="fields">
          <label class="field"><span class="lbl">${t("date")}</span><span class="inp"><input name="date" type="date" value="${today}" required/></span></label>
          <label class="field"><span class="lbl">${t("shiftType")}</span><span class="inp"><select name="shift"><option value="day">${t("day")}</option><option value="night">${t("night")}</option></select></span></label>
          ${field("rig", "", "text", state.inputs.rig)}
          ${field("well", "", "text", state.inputs.well)}
          <label class="field"><span class="lbl">${t("start")}</span><span class="inp"><input name="start" type="time" value="06:00"/></span></label>
          <label class="field"><span class="lbl">${t("end")}</span><span class="inp"><input name="end" type="time" value="18:00"/></span></label>
          ${field("depthStart", "ft", "number", "")}
          ${field("depthEnd", "ft", "number", "")}
          ${field("omw", "ppg", "number", state.inputs.omw)}
          ${field("scr", "psi", "number", state.inputs.scr)}
        </div>
        <label class="field"><span class="lbl">${t("activity")}</span><textarea name="activity" rows="4"></textarea></label>
        <label class="field"><span class="lbl">${t("bopTest")}</span><textarea name="bop" rows="2"></textarea></label>
        <label class="field"><span class="lbl">${t("handover")}</span><textarea name="handover" rows="2"></textarea></label>
        <div class="actions"><span class="grow"></span><button class="btn primary">${t("addShift")}</button></div>
      </form>
      <section class="panel"><div id="shift-list" class="list"><div class="skel"></div><div class="skel"></div></div></section>
    </div>`;
  $("#shift-form").onsubmit = async (e) => {
    e.preventDefault();
    const btn = e.submitter; btn.disabled = true;
    const data = Object.fromEntries(new FormData(e.target));
    try { await api("shifts", { method: "POST", body: data }); toast(t("saved")); e.target.reset(); e.target.date.value = today; loadShifts(); }
    catch { toast(t("netErr"), "err"); }
    btn.disabled = false;
  };
  loadShifts();
}

async function loadShifts() {
  const box = $("#shift-list");
  try {
    const list = await api("shifts");
    if (!box.isConnected) return;
    box.innerHTML = list.length ? list.map(({ id, data: d }) => {
      const foot = Number(d.depthEnd) - Number(d.depthStart);
      return `<article class="item shift ${d.shift}">
        <div class="shift-top"><span class="badge">${t(d.shift)}</span><b dir="ltr">${esc(d.date)}</b><span class="meta" dir="ltr">${esc(d.start)}–${esc(d.end)}</span>
          <button class="btn sm ghost" data-rm="${id}">${t("del")}</button></div>
        <div class="meta">${esc(d.rig)} · ${esc(d.well)}</div>
        <div class="chips" dir="ltr">
          ${d.depthStart || d.depthEnd ? `<span>${fmt(+d.depthStart)} → ${fmt(+d.depthEnd)} ft</span>` : ""}
          ${foot > 0 ? `<span class="hl">+${fmt(foot)} ft</span>` : ""}
          ${d.omw ? `<span>${esc(d.omw)} ppg</span>` : ""}${d.scr ? `<span>SCR ${esc(d.scr)} psi</span>` : ""}
        </div>
        ${d.activity ? `<p>${esc(d.activity)}</p>` : ""}
        ${d.bop ? `<p class="sub"><b>${t("bopTest")}:</b> ${esc(d.bop)}</p>` : ""}
        ${d.handover ? `<p class="sub"><b>${t("handover")}:</b> ${esc(d.handover)}</p>` : ""}
      </article>`;
    }).join("") : `<div class="empty">${t("noShifts")}</div>`;
    box.onclick = async (e) => { const rm = e.target.dataset.rm; if (rm && confirm(t("confirmDel"))) { await api(`shifts/${rm}`, { method: "DELETE" }); loadShifts(); } };
  } catch { box.innerHTML = `<div class="empty err">${t("netErr")}</div>`; }
}

// ---------- archive ----------
async function viewSaved() {
  $("#view").innerHTML = `
    <header class="pagehead"><span class="kicker">Archive</span><h1>${t("savedTitle")}</h1></header>
    <div id="saved-list" class="cards"><div class="skel tall"></div><div class="skel tall"></div><div class="skel tall"></div></div>`;
  const box = $("#saved-list");
  try {
    const list = await api("sheets");
    if (!box.isConnected) return;
    box.innerHTML = list.length ? list.map((s) => `
      <article class="card">
        <header><b>${esc(s.name)}</b><span class="meta">${esc(s.well)} · ${new Date(s.createdAt).toLocaleString()}</span></header>
        <div class="mini" dir="ltr">
          <div><small>KMW</small><b>${fmt(s.results.kmw, 1)}</b><em>ppg</em></div>
          <div><small>ICP</small><b>${fmt(s.results.icp)}</b><em>psi</em></div>
          <div><small>FCP</small><b>${fmt(s.results.fcp)}</b><em>psi</em></div>
          <div><small>MAASP</small><b>${fmt(s.results.maasp)}</b><em>psi</em></div>
        </div>
        <footer><button class="btn sm" data-open="${s.id}">${t("load")}</button><button class="btn sm ghost" data-rm="${s.id}">${t("del")}</button></footer>
      </article>`).join("") : `<div class="empty big">${t("noSaved")}</div>`;
    box.onclick = async (e) => {
      const open = e.target.dataset.open, rm = e.target.dataset.rm;
      if (open) { const s = list.find((x) => x.id === +open); state.inputs = { ...DEFAULT_INPUTS, ...s.inputs }; localStorage.setItem(LS.inputs, JSON.stringify(state.inputs)); go("calc"); }
      if (rm && confirm(t("confirmDel"))) { await api(`sheets/${rm}`, { method: "DELETE" }); viewSaved(); }
    };
  } catch { box.innerHTML = `<div class="empty err">${t("netErr")}</div>`; }
}

// ---------- guide & methods ----------
function viewGuide() {
  $("#view").innerHTML = `
    <header class="pagehead"><span class="kicker">Field units · 0.052</span><h1>${t("guideTitle")}</h1></header>
    <div class="formulas">${GUIDE.map((g, i) => `
      <article class="formula" style="--d:${i}">
        <h3>${state.lang === "ar" ? g.ar : g.k}</h3>
        <code dir="ltr">${esc(g.f)}</code>
        ${g.n ? `<p>${state.lang === "ar" ? g.nar : g.n}</p>` : ""}
      </article>`).join("")}</div>`;
}

function viewMethods() {
  const m = METHODS[state.lang];
  const r = compute(state.inputs);
  const ok = !r.errors.length && r.inputs.killRate > 0;
  $("#view").innerHTML = `
    <header class="pagehead"><span class="kicker">W&amp;W vs Driller's</span><h1>${t("methodsTitle")}</h1></header>
    ${ok ? `<div class="versus">
      <div class="vs-card a"><span>${m.cols[1]}</span><b dir="ltr">${fmt(r.totalMin, 0)}<small> ${u("min")}</small></b><em dir="ltr">${fmt(r.totalStrokes)} ${u("stk")}</em></div>
      <div class="vs-mid">VS</div>
      <div class="vs-card b"><span>${m.cols[2]}</span><b dir="ltr">${fmt(r.totalMin + r.bottomsUpMin, 0)}<small> ${u("min")}</small></b><em dir="ltr">${fmt(r.totalStrokes + r.bottomsUp)} ${u("stk")}</em></div>
    </div>` : ""}
    <section class="panel"><div class="scroll-x"><table class="tbl methods">
      <thead><tr>${m.cols.map((c) => `<th>${c}</th>`).join("")}</tr></thead>
      <tbody>${m.rows.map((r) => `<tr><th>${r[0]}</th><td>${r[1]}</td><td>${r[2]}</td></tr>`).join("")}</tbody>
    </table></div></section>`;
}

// ---------- boot ----------
document.addEventListener("click", (e) => {
  const tab = e.target.closest("[data-tab]");
  if (tab) go(tab.dataset.tab);
});
$("#lang-btn").onclick = () => { state.lang = state.lang === "ar" ? "en" : "ar"; localStorage.setItem(LS.lang, state.lang); go(state.tab); };
go(TABS.some(([id]) => id === state.tab) ? state.tab : "calc");
