/* Kitchen Log app logic. Recipe data lives in data.js (RECIPES, PAIRS, ADDONS, ALL, APP_LABEL, EXAMPLE).
   Saved data keeps the original "pk-" localStorage keys so plates, servings and ticks from v1 carry over. */
const store = {
  get(k, d) { try { const v = localStorage.getItem("pk-" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("pk-" + k, JSON.stringify(v)); } catch {} }
};
const state = { filter:"all", sort:"protein", q:"", rid:null, unit: store.get("unit","lb"), weight: store.get("weight",176), plate: store.get("plate", null), got: store.get("got", {}), units: store.get("units", "metric"), servings: store.get("servings", {}) };
if (state.plate) state.plate = state.plate.filter(x => ALL[x[0]]);
let isExample = state.plate === null;
if (isExample) state.plate = EXAMPLE.map(x => [...x]);

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[ch]));
const kg = () => { const w = Number(state.weight) || 0; return state.unit === "lb" ? w / 2.2046 : w; };
const targets = () => { const k = kg(); return { lo:Math.round(k*1.6), hi:Math.round(k*2.2), mlo:Math.round(k*0.4), mhi:Math.round(k*0.55) }; };
const ICON = { crockpot:"crockpot", airfryer:"airfryer", grill:"grill", griddle:"griddle", oven:"oven", stovetop:"pot", salad:"bowl" };
const icon = app => `<svg class="ico" aria-hidden="true"><use href="#i-${ICON[app] || "pot"}"/></svg>`;
const UNITS_LABEL = { metric:"Grams", us:"Cups" };
const SORT_LABEL = { protein:"Most protein", density:"Leanest", kcal:"Fewest calories", rating:"Most reviewed", name:"A to Z" };

function ratingText(src, short) {
  if (src.stars == null && src.n == null) return "No rating listed";
  if (src.stars == null) return `${src.n} reviews`;
  const s = `<span class="stars" aria-hidden="true">★</span> ${src.stars}`;
  return short ? `${s} (${src.n})` : `${s} from ${src.n} rating${src.n === 1 ? "" : "s"}`;
}

/* Amounts: each ingredient is [[qty, unit, grams], ...parts], name. Grams is the default view; US shows cups and spoons. */
const MASS = new Set(["lb", "oz", "cup", "tbsp", "tsp"]);
const servingsOf = r => state.servings[r.id] || r.serves;
const scaleOf = r => servingsOf(r) / r.serves;
const FR = [[0,""],[1/8,"⅛"],[1/4,"¼"],[1/3,"⅓"],[3/8,"⅜"],[1/2,"½"],[5/8,"⅝"],[2/3,"⅔"],[3/4,"¾"],[7/8,"⅞"],[1,""]];
function frac(x) {
  let w = Math.floor(x), rem = x - w, best = FR[0];
  for (const f of FR) if (Math.abs(rem - f[0]) < Math.abs(rem - best[0])) best = f;
  if (best[0] === 1) { w += 1; best = FR[0]; }
  if (!w && !best[1]) return x > 0 ? "⅛" : "0";
  return (w ? String(w) : "") + best[1];
}
function grams(v) {
  if (v < 0.5) return "<1";
  if (v < 10) return String(Math.round(v * 2) / 2);
  if (v < 100) return String(Math.round(v));
  return String(Math.round(v / 5) * 5);
}
function plural(unit, v) {
  if (!unit || v <= 1 || /^(small|medium|large|lb|oz)$/.test(unit)) return unit;
  const [first, ...rest] = unit.split(" ");
  return [first + "s", ...rest].join(" ");
}
function usPart(q, u, f) {
  const v = q * f;
  if (u === "tsp" || u === "tbsp" || u === "cup") {
    const t = v * (u === "tsp" ? 1 : u === "tbsp" ? 3 : 48);
    const near = (x, set) => set.some(y => Math.abs(x - y) < 0.03);
    if (t >= 12) {
      const c = t / 48, rem = c - Math.floor(c);
      if (near(rem, [0, 1/4, 1/3, 1/2, 2/3, 3/4, 1])) return frac(c) + (c > 1 ? " cups" : " cup");
      const qc = Math.floor(c * 4) / 4, tb = (t - qc * 48) / 3;
      return `${frac(qc)} ${qc > 1 ? "cups" : "cup"} + ${frac(tb)} tbsp`;
    }
    if (t >= 3) {
      const tb = Math.floor(t / 3 + 1e-9), rt = t - tb * 3;
      if (rt < 0.12 || near(t / 3 - tb, [1/2])) return frac(t / 3) + " tbsp";
      return `${tb} tbsp + ${frac(rt)} tsp`;
    }
    return frac(t) + " tsp";
  }
  if (u === "lb" && v < 1) return frac(v * 16) + " oz";
  return (frac(v) + " " + plural(u, v)).trim();
}
/* Small whole items (garlic cloves, bay leaves, eggs, scoops) round to whole numbers when scaled. */
function wholeCount(q, u, g, f) {
  if (!(u === "" || u === "scoop" || u === "large" || u === "ear") || q < 1) return null;
  const each = g == null ? 0 : g / q;
  if (g != null && each > 60) return null;
  return Math.max(1, Math.round(q * f));
}
function partText([q, u, g], f, units) {
  if (typeof q === "string") return q;
  const w = wholeCount(q, u, g, f);
  if (w != null) { f = w / q; }
  if (units === "us") return usPart(q, u, f);
  if (MASS.has(u)) return grams(g * f) + " g";
  const head = (frac(q * f) + " " + plural(u, q * f)).trim();
  return g ? `${head}, ${grams(g * f)} g` : head;
}
const amountText = (ing, f, units = state.units) => ing[0].map(pt => partText(pt, f, units)).join(" + ");

/* Build the tabular recipe: rows are ingredients; each step cell spans the rows it combines. */
function recipeTable(r) {
  const cells = []; let row = 0;
  function walk(node) {
    if (typeof node === "number") { const c = { kind:"ing", idx:node, col:0, row:row++, span:1 }; cells.push(c); return c; }
    const [label, ...kids] = node;
    const kc = kids.map(walk);
    const col = Math.max(...kc.map(k => k.col)) + 1;
    kc.forEach(k => k.parentCol = col);
    const c = { kind:"op", label, col, row:Math.min(...kc.map(k => k.row)), span:kc.reduce((a, k) => a + k.span, 0) };
    cells.push(c); return c;
  }
  const root = walk(r.tree);
  root.parentCol = root.col + 1; root.final = true;
  const width = root.col + 1;
  const rows = Array.from({ length: row }, () => []);
  cells.forEach(c => rows[c.row].push(c));
  const full = t => `<tr><td class="step" colspan="${width}">${esc(t)}</td></tr>`;
  let html = (r.pre || []).map(full).join("");
  rows.forEach(list => {
    list.sort((a, b) => a.col - b.col);
    html += "<tr>" + list.map(c => {
      const cs = c.parentCol - c.col;
      if (c.kind === "ing") { const g = r.ing[c.idx]; return `<td class="ing" colspan="${cs}"><span class="amt">${esc(amountText(g, scaleOf(r)))}</span> ${esc(g[1])}</td>`; }
      return `<td class="op${c.final ? " final" : ""}" rowspan="${c.span}" colspan="${cs}">${esc(c.label)}</td>`;
    }).join("") + "</tr>";
  });
  html += (r.post || []).map(full).join("");
  return `<div class="cfe-wrap"><table class="cfe" aria-label="${esc(r.name)} recipe table">${html}</table></div>`;
}

/* ---------- Target ---------- */
function renderTarget() {
  const t = targets(), w = `${Number(state.weight) || 0} ${state.unit}`;
  $("t-daily").textContent = `${t.lo}–${t.hi} g`;
  $("t-meal").textContent = `${t.mlo}–${t.mhi} g`;
  $("home-target").textContent = `${t.lo}–${t.hi} g/day`;
  $("home-weight").textContent = `Body weight ${w}`;
  $("set-weight").textContent = w;
  $("unit-lb").setAttribute("aria-pressed", state.unit === "lb");
  $("unit-kg").setAttribute("aria-pressed", state.unit === "kg");
}
function setUnit(u) {
  if (u === state.unit) return;
  const w = Number(state.weight) || 0;
  state.weight = Math.round(u === "kg" ? w / 2.2046 : w * 2.2046);
  state.unit = u; $("weight").value = state.weight;
  store.set("unit", u); store.set("weight", state.weight);
  renderTarget(); renderPlate();
}

/* ---------- Plate ---------- */
const onPlate = id => state.plate.some(x => x[0] === id);
function savePlate() { isExample = false; store.set("plate", state.plate); renderPlate(); renderGrid(); }
function add(id) {
  const hit = state.plate.find(x => x[0] === id);
  if (hit) hit[1] = +(hit[1] + 0.5).toFixed(1); else state.plate.push([id, 1]);
  savePlate();
  const x = state.plate.find(p => p[0] === id);
  PH.toast(`${ALL[id].name.replace(/,.*$/, "")}: ${x[1]}× on plate.`);
}

function renderPlate() {
  const t = targets();
  let P=0,K=0,C=0,F=0;
  state.plate.forEach(([id, n]) => { const x = ALL[id]; P+=x.p*n; K+=x.kcal*n; C+=x.c*n; F+=x.f*n; });
  $("p-total").innerHTML = `${Math.round(P)}<small> g</small>`;
  $("p-target").textContent = `${t.lo}–${t.hi}`;
  $("m-kcal").textContent = Math.round(K);
  $("m-c").textContent = Math.round(C) + " g";
  $("m-f").textContent = Math.round(F) + " g";
  const scale = Math.max(t.hi * 1.15, P, 1);
  $("p-fill").style.setProperty("--value", Math.min(100, P / scale * 100) + "%");
  $("p-band").style.left = (t.lo / scale * 100) + "%";
  $("p-band").style.width = ((t.hi - t.lo) / scale * 100) + "%";
  const m = $("p-meter"); m.setAttribute("aria-valuemax", t.hi); m.setAttribute("aria-valuenow", Math.round(P));
  const s = $("p-status");
  if (!state.plate.length) { s.textContent = "Your plate is empty. Add a dish from the menu."; s.className = "status"; }
  else if (P < t.lo) { s.textContent = `${Math.round(t.lo - P)} g to go to reach your minimum.`; s.className = "status warn"; }
  else if (P <= t.hi) { s.textContent = "Right in your target range."; s.className = "status good"; }
  else { s.textContent = "Above the range. That's safe, but the extra adds little muscle."; s.className = "status good"; }
  $("example-note").hidden = !isExample;
  $("plate-items").innerHTML = state.plate.map(([id, q], i) => {
    const x = ALL[id];
    const name = x.ing ? `<button type="button" class="name-link" data-open="${id}">${esc(x.name)}</button>` : esc(x.name);
    return `<li><span class="name">${name}</span>
      <span class="qty"><button type="button" class="btn" data-dec="${i}" aria-label="Less ${esc(x.name)}">−</button><span class="num">${q}×</span><button type="button" class="btn" data-inc="${i}" aria-label="More ${esc(x.name)}">+</button></span>
      <span class="p">${Math.round(x.p*q)} g</span></li>`;
  }).join("");
  $("plate-items").hidden = !state.plate.length;
  renderShop();
}

function renderAddons() {
  $("addons").innerHTML = ADDONS.map(a =>
    `<button type="button" class="menu-item" data-add="${a.id}" aria-label="Add ${esc(a.name)} to plate"><span class="mi-glyph" aria-hidden="true">+</span><span class="mi-label">${esc(a.name)}<small>${a.kcal} kcal</small></span><span class="mi-value t-accent">${a.p} g</span></button>`).join("");
}

/* ---------- Menu ---------- */
function renderGrid() {
  const q = state.q.trim().toLowerCase();
  const list = RECIPES.filter(r => {
    const f = state.filter;
    const okF = f === "all" || (f === "sweet" || f === "side" ? r.cat === f : r.app === f && !r.cat);
    const okQ = !q || r.name.toLowerCase().includes(q) || r.ing.map(i => i[1]).join(" ").toLowerCase().includes(q);
    return okF && okQ;
  });
  const by = { protein:(a,b)=>b.p-a.p, density:(a,b)=>b.p/b.kcal-a.p/a.kcal, kcal:(a,b)=>a.kcal-b.kcal, rating:(a,b)=>(b.src.n||0)-(a.src.n||0), name:(a,b)=>a.name.localeCompare(b.name) };
  list.sort(by[state.sort]);
  $("menu-count").textContent = `${list.length} dish${list.length === 1 ? "" : "es"}`;
  $("sort-label").textContent = SORT_LABEL[state.sort];
  document.querySelectorAll("[data-sort]").forEach(b => b.setAttribute("aria-checked", b.dataset.sort === state.sort));
  $("grid").innerHTML = list.length ? list.map(r => {
    const added = onPlate(r.id);
    const tag = r.cat === "sweet" ? `<span class="badge amber">Sweet</span>` : r.cat === "side" ? `<span class="badge cyan">Side</span>` : r.veg ? `<span class="badge">Plant-based</span>` : r.isNew ? `<span class="badge">New</span>` : "";
    const extra = PAIRS[r.id] ? `Goes with ${PAIRS[r.id].map(([sid]) => esc(ALL[sid].name)).join(" or ")}` : `${(r.p / r.kcal * 100).toFixed(1)} g protein per 100 kcal · ${r.ing.length} ingredients`;
    return `<article class="card${added ? " on" : ""}">
      <button type="button" class="card-open" data-open="${r.id}" aria-label="Open ${esc(r.name)}">
        <span class="card-top"><h3>${esc(r.name)}</h3><span class="pro">${r.p}<small>g</small></span></span>
        <span class="badges"><span class="badge dim">${icon(r.app)}${APP_LABEL[r.app]}</span>${tag}</span>
        <span class="macro-line"><b>${r.kcal}</b> kcal · Carbs <b>${r.c}g</b> · Fat <b>${r.f}g</b></span>
        <span class="meta">${ratingText(r.src, true)} · ${esc(r.src.site)} · makes ${servingsOf(r)}</span>
        <span class="meta">${extra}</span>
      </button>
      <button type="button" class="card-add" data-add="${r.id}" aria-label="${added ? "Add another serving of" : "Add"} ${esc(r.name)} to plate">${added ? "✓" : "+"}<small>${added ? "On plate" : "Plate"}</small></button>
    </article>`;
  }).join("") : `<div class="empty"><pre aria-hidden="true">  _____
 |     |
 | ? ? |
 |_____|</pre><p>No dishes match "${esc(state.q)}".</p><button type="button" class="btn" data-act="clear-search">Show all dishes</button></div>`;
}

/* ---------- Recipe page ---------- */
function openRecipe(id) {
  state.rid = id; renderRecipe();
  if (location.hash !== "#/menu/recipe") PH.go("/menu/recipe");
  else document.querySelector(".screen-body").scrollTop = 0;
}
function renderRecipe() {
  const r = ALL[state.rid]; if (!r) return;
  const added = onPlate(r.id), sv = servingsOf(r);
  const kind = [APP_LABEL[r.app], r.cat === "sweet" ? "Breakfast & sweets" : r.cat === "side" ? "Side" : "", r.veg ? "Plant-based" : ""].filter(Boolean).join(" · ");
  $("recipe").innerHTML = `<div class="stack" style="gap: var(--sp-4)">
    <div class="rec-head">
      <span class="label">${icon(r.app)}${esc(kind)}</span>
      <h2>${esc(r.name)}</h2>
      <div class="badges"><span class="badge dim">Makes ${r.serves}</span><span class="badge dim">${ratingText(r.src, true)}</span><span class="badge dim">${r.ing.length} ingredients</span></div>
    </div>
    <section class="panel" data-title="Per serving">
      <div class="per-serving">
        <div class="readout">${r.p}<small> g</small></div>
        <div class="stack"><div class="kv"><span>Calories</span><span>${r.kcal}</span></div><div class="kv"><span>Carbs</span><span>${r.c} g</span></div><div class="kv"><span>Fat</span><span>${r.f} g</span></div></div>
      </div>
    </section>
    <section class="panel" data-title="Make">
      <div class="stack">
        <div class="stepper"><span class="label">Servings</span>
          <button type="button" class="btn" data-serv="-1" aria-label="Fewer servings">−</button><output aria-live="polite">${sv}</output><button type="button" class="btn" data-serv="1" aria-label="More servings">+</button>
          <span class="grow">${sv !== r.serves ? `<button type="button" class="reset" data-serv="reset">Reset to ${r.serves}</button>` : ""}</span></div>
        <div class="segmented" role="group" aria-label="Measurements"><button type="button" data-units="metric" aria-pressed="${state.units === "metric"}">Grams</button><button type="button" data-units="us" aria-pressed="${state.units === "us"}">Cups &amp; spoons</button></div>
        <p class="hint">Amounts are for ${sv} serving${sv === 1 ? "" : "s"}. Macros stay per serving. Big batches may need longer cooking.</p>
      </div>
    </section>
    <section class="stack" aria-label="Recipe steps"><span class="label">Ingredients → steps</span>${recipeTable(r)}</section>
    ${PAIRS[r.id] ? `<section class="panel" data-title="Recommended sides">${PAIRS[r.id].map(([sid, why]) => { const sd = ALL[sid]; return `<div class="pair"><div><b>${esc(sd.name)}</b><small>${esc(why)} · ${sd.kcal} kcal, ${sd.p} g protein</small></div><div class="row"><button type="button" class="btn" data-open="${sid}">View</button><button type="button" class="btn" data-add="${sid}">${onPlate(sid) ? "✓ Add again" : "+ Add side"}</button></div></div>`; }).join("")}</section>` : ""}
    ${r.change ? `<section class="panel" data-title="Our changes"><p class="change">${esc(r.change)}</p></section>` : ""}
    <p class="source">Based on <b>${esc(r.src.title)}</b> from ${esc(r.src.site)}. <a href="${esc(r.src.url)}" target="_blank" rel="noopener">View the original recipe</a></p>
    <button type="button" class="btn btn-primary btn-block" data-add="${r.id}">${added ? "Add another serving" : "+ Add to plate"}</button>
  </div>`;
}

/* ---------- Shopping ---------- */
function renderShop() {
  const recs = state.plate.map(x => ALL[x[0]]).filter(x => x && x.ing);
  let total = 0, got = 0;
  recs.forEach(r => r.ing.forEach((g, i) => { total++; if (state.got[r.id + ":" + i]) got++; }));
  const left = total - got;
  $("home-shop").textContent = total ? (left ? `${left} to get` : "All set") : "—";
  $("shop-count").textContent = left; $("shop-count").hidden = !left;
  if (!recs.length) {
    $("shop-progress").innerHTML = "";
    $("shop").innerHTML = `<div class="empty"><pre aria-hidden="true">  ______
 [      ]
 [  --  ]
 [______]</pre><p>Add a dish to today's plate and its ingredients show up here.</p><button type="button" class="btn" data-route="/menu">Browse the menu</button></div>`;
    return;
  }
  $("shop-progress").innerHTML = `<div class="kv"><span>Ticked off</span><span>${got} of ${total}</span></div><div class="meter" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${got}" aria-label="Items ticked off"><span style="--value:${total ? got / total * 100 : 0}%"></span></div>`;
  $("shop").innerHTML = recs.map(r => `<section class="panel shop-group" data-title="${esc(r.name)} · makes ${servingsOf(r)}">${
    r.ing.map((g, i) => { const k = r.id + ":" + i; return `<label class="check"><input type="checkbox" data-got="${k}" ${state.got[k] ? "checked" : ""}><span><b>${esc(amountText(g, scaleOf(r)))}</b> ${esc(g[1])}</span></label>`; }).join("")
  }</section>`).join("");
}

function syncUnits() {
  document.querySelectorAll("[data-units]").forEach(x => x.setAttribute("aria-pressed", x.dataset.units === state.units));
  document.querySelectorAll("[data-pick-units]").forEach(x => x.setAttribute("aria-checked", x.dataset.pickUnits === state.units));
  $("set-units").textContent = UNITS_LABEL[state.units];
}
function setUnits(u) { state.units = u; store.set("units", u); syncUnits(); renderShop(); if (state.rid) renderRecipe(); }
function uncheckAll() { state.got = {}; store.set("got", {}); renderShop(); PH.toast("Shopping list unchecked."); }

/* ---------- Events ---------- */
document.addEventListener("click", async e => {
  const b = e.target.closest("button"); if (!b) return;
  const d = b.dataset;
  if (d.add) { add(d.add); if (state.rid && location.hash === "#/menu/recipe") renderRecipe(); return; }
  if (d.open) { openRecipe(d.open); return; }
  if (d.units) { setUnits(d.units); return; }
  if (d.pickUnits) { setUnits(d.pickUnits); PH.back(); return; }
  if (d.serv && state.rid) {
    const r = ALL[state.rid]; const v = d.serv === "reset" ? r.serves : Math.min(48, Math.max(1, servingsOf(r) + Number(d.serv)));
    if (v === r.serves) delete state.servings[r.id]; else state.servings[r.id] = v;
    store.set("servings", state.servings); renderRecipe(); renderShop(); renderGrid(); return;
  }
  if (d.inc) { state.plate[d.inc][1] += 0.5; savePlate(); return; }
  if (d.dec) { const i = +d.dec; state.plate[i][1] -= 0.5; if (state.plate[i][1] <= 0) state.plate.splice(i, 1); savePlate(); return; }
  if (d.filter) { state.filter = d.filter; document.querySelectorAll("[data-filter]").forEach(t => t.setAttribute("aria-pressed", t === b)); renderGrid(); return; }
  if (d.sort) { state.sort = d.sort; renderGrid(); return; }
  if (d.wunit) { setUnit(d.wunit); return; }
  const act = d.act || d.action;
  if (act === "add-recipe" && state.rid) { add(state.rid); renderRecipe(); }
  else if (act === "uncheck") uncheckAll();
  else if (act === "clear-search") { state.q = ""; $("search").value = ""; state.filter = "all"; document.querySelectorAll("[data-filter]").forEach(t => t.setAttribute("aria-pressed", t.dataset.filter === "all")); renderGrid(); }
  else if (act === "target") PH.go("/target");
  else if (act === "clear") {
    if (!state.plate.length) { PH.toast("Your plate is already empty."); return; }
    if (await PH.confirm(`Clear all ${state.plate.length} items from today's plate?`, { title: "Clear plate", ok: "Clear", danger: true })) {
      state.plate = []; savePlate(); PH.toast("Plate cleared.", "warn");
    }
  }
});
document.addEventListener("change", e => {
  const k = e.target.dataset && e.target.dataset.got; if (!k) return;
  if (e.target.checked) state.got[k] = 1; else delete state.got[k];
  store.set("got", state.got); renderShop();
});
$("search").addEventListener("input", e => { state.q = e.target.value; renderGrid(); });
$("weight").addEventListener("input", e => { state.weight = e.target.value; store.set("weight", state.weight); renderTarget(); renderPlate(); });
$("unit-lb").addEventListener("click", () => setUnit("lb"));
$("unit-kg").addEventListener("click", () => setUnit("kg"));

PH.on("route", r => {
  if (r === "/menu/recipe" && !ALL[state.rid]) { location.replace("#/menu"); return; }
  $("sort-key").hidden = r !== "/menu";
});

/* ---------- Data: backup, restore, erase (same file format as v1) ---------- */
const today = () => new Date().toISOString().slice(0, 10);
const ownKey = k => k.startsWith("pk-") || k.startsWith("kitchen-log:");
$("export").addEventListener("click", () => {
  const data = { app: "kitchen-log", version: 1, exported: new Date().toISOString(), keys: {} };
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (ownKey(k)) data.keys[k] = localStorage.getItem(k); } } catch (e) {}
  PH.exportFile("kitchen-log-backup-" + today() + ".json", JSON.stringify(data, null, 1));
});
$("import").addEventListener("click", () => $("import-file").click());
$("import-file").addEventListener("change", async e => {
  const f = e.target.files && e.target.files[0]; e.target.value = ""; if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (data.app !== "kitchen-log" || !data.keys) throw new Error("wrong file");
    Object.entries(data.keys).forEach(([k, v]) => { if (ownKey(k)) localStorage.setItem(k, v); });
    PH.toast("Backup restored. Reloading…"); setTimeout(() => location.reload(), 700);
  } catch (err) { PH.toast("That file isn't a Kitchen Log backup. Pick a kitchen-log-backup-….json file.", "error"); }
});
$("erase").addEventListener("click", async () => {
  if (!await PH.confirm("Erase your plate, servings, weight, shopping ticks and settings? This can't be undone.", { title: "Erase data", ok: "Erase", danger: true })) return;
  try { Object.keys(localStorage).filter(k => k.startsWith("pk-")).forEach(k => localStorage.removeItem(k)); } catch (e) {}
  PH.store.reset(); PH.toast("All data erased.", "warn"); setTimeout(() => location.replace(location.pathname), 700);
});
$("reset-display").addEventListener("click", () => { PH.store.reset(); PH.toast("Display reset."); });

/* ---------- Boot ---------- */
$("weight").value = state.weight;
$("ab-mains").textContent = RECIPES.filter(r => !r.cat).length;
$("ab-sides").textContent = RECIPES.filter(r => r.cat === "side").length;
$("ab-sweets").textContent = RECIPES.filter(r => r.cat === "sweet").length;
renderTarget(); renderAddons(); renderGrid(); renderPlate(); syncUnits();
PH.init({});
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
