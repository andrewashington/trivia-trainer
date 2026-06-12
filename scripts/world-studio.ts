/**
 * World Studio — a local-only control panel for the map pipeline, so
 * nobody has to remember commands or file paths. Buttons wrap the
 * existing scripts; nothing here is deployed or reachable off-machine.
 *
 *   npm run world:studio            (or double-click "World Studio.command")
 *
 * Serves http://127.0.0.1:4499 with:
 *   - the map registry (with local-change indicators)
 *   - "New map" form  → scripts/world-new-map.ts
 *   - "Open in Tiled" → `open <tmx>` / the .tiled-project
 *   - "Validate"      → scripts/world-export-map.ts (export + contract check)
 *   - "Ship maps"     → export/validate → commit map files → rebase →
 *                       typecheck → push (main + deploy branch) → S3 sync
 */
import http from "node:http";
import fs from "node:fs";
import { spawn } from "node:child_process";

import { SURFACES, TIERS } from "../src/modules/world/catalog";

const PORT = 4499;
const REGISTRY = "src/modules/world/maps.ts";
const MAPS_DIR = "assets-src/runtime/world/maps";
const DEPLOY_BRANCH = "claude/serene-feynman-e4tdza";

// ── furniture catalog (tagging tool) ────────────────────────────────────
const DRAFT = "assets-src/runtime/world/catalog/draft.json";
const SEED = "src/modules/world/catalog-seed.json";

type DraftItem = {
  key: string; theme: string; themeLabel: string; file: string;
  pxW: number; pxH: number; tileW: number; tileH: number;
};
type SeedEntry = {
  name?: string; category?: string; tier?: string;
  price?: number | null; surface?: string; keep?: boolean; publish?: boolean;
};
type Seed = { items: Record<string, SeedEntry> };

let draftCache: { mtime: number; items: DraftItem[]; byKey: Map<string, DraftItem> } | null = null;

function loadDraft(): { items: DraftItem[]; byKey: Map<string, DraftItem> } {
  if (!fs.existsSync(DRAFT)) return { items: [], byKey: new Map() };
  const mtime = fs.statSync(DRAFT).mtimeMs;
  if (!draftCache || draftCache.mtime !== mtime) {
    const items = (JSON.parse(fs.readFileSync(DRAFT, "utf8")).items ?? []) as DraftItem[];
    draftCache = { mtime, items, byKey: new Map(items.map((i) => [i.key, i])) };
  }
  return draftCache;
}

function loadSeed(): Seed {
  if (!fs.existsSync(SEED)) return { items: {} };
  try {
    const s = JSON.parse(fs.readFileSync(SEED, "utf8"));
    return { items: s.items ?? {} };
  } catch {
    return { items: {} };
  }
}

function saveSeed(seed: Seed) {
  fs.mkdirSync(SEED.replace(/\/[^/]+$/, ""), { recursive: true });
  fs.writeFileSync(SEED, JSON.stringify(seed, null, 2));
}

// ── helpers ─────────────────────────────────────────────────────────────

function parseRegistry(): { id: string; tmx: string; label: string; kind: string }[] {
  const src = fs.readFileSync(REGISTRY, "utf8");
  const out: { id: string; tmx: string; label: string; kind: string }[] = [];
  const re = /id:\s*"([^"]+)",\s*tmx:\s*"([^"]+)",\s*label:\s*("(?:[^"\\]|\\.)*"),\s*kind:\s*"(\w+)"/g;
  for (const m of src.matchAll(re)) {
    out.push({ id: m[1], tmx: m[2], label: JSON.parse(m[3]), kind: m[4] });
  }
  return out;
}

/** Run a command, streaming combined output into `res`. Resolves exit code. */
function run(res: http.ServerResponse, cmd: string, args: string[]): Promise<number> {
  return new Promise((resolve) => {
    res.write(`\n$ ${cmd} ${args.join(" ")}\n`);
    const p = spawn(cmd, args, { cwd: process.cwd() });
    p.stdout.on("data", (d) => res.write(d));
    p.stderr.on("data", (d) => res.write(d));
    p.on("close", (code) => resolve(code ?? 1));
    p.on("error", (err) => {
      res.write(`error: ${err.message}\n`);
      resolve(1);
    });
  });
}

async function readBody(req: http.IncomingMessage): Promise<Record<string, string>> {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}

function gitDirty(): Promise<string> {
  return new Promise((resolve) => {
    const p = spawn("git", ["status", "--porcelain", MAPS_DIR, REGISTRY]);
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.on("close", () => resolve(out));
  });
}

// ── actions (each streams output and ends the response itself) ──────────

async function actNewMap(res: http.ServerResponse, b: Record<string, string>) {
  const id = (b.id ?? "").trim();
  if (!/^[a-z0-9-]+$/.test(id)) {
    res.write("✖ map id must be kebab-case (letters/numbers/dashes), e.g. cafe-interior\n");
    return 1;
  }
  const args = ["tsx", "scripts/world-new-map.ts", id, "--kind", b.kind === "exterior" ? "exterior" : "interior"];
  if (b.label?.trim()) args.push("--label", b.label.trim());
  if (/^\d+x\d+$/.test(b.size ?? "")) args.push("--size", b.size);
  const code = await run(res, "npx", args);
  if (code === 0) {
    res.write("\nOpening it in Tiled…\n");
    await run(res, "open", [`${MAPS_DIR}/${id}.tmx`]);
  }
  return code;
}

async function actImportDesign(res: http.ServerResponse, b: Record<string, string>) {
  const id = (b.id ?? "").trim();
  if (!/^[a-z0-9-]+$/.test(id)) {
    res.write("✖ map id must be kebab-case (letters/numbers/dashes), e.g. my-gym\n");
    return 1;
  }
  if (!b.design?.trim()) {
    res.write("✖ pick a design first\n");
    return 1;
  }
  const args = ["tsx", "scripts/world-import-design.ts", id, "--design", b.design.trim()];
  if (b.label?.trim()) args.push("--label", b.label.trim());
  const code = await run(res, "npx", args);
  if (code === 0) {
    res.write("\nOpening it in Tiled…\n");
    await run(res, "open", [`${MAPS_DIR}/${id}.tmx`]);
  }
  return code;
}

function listDesigns(): Promise<{ key: string; name: string; folder: string; layers: number }[]> {
  return new Promise((resolve) => {
    const p = spawn("npx", ["tsx", "scripts/world-import-design.ts", "--list", "--json"]);
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.on("close", () => {
      try {
        resolve(JSON.parse(out).designs);
      } catch {
        resolve([]);
      }
    });
    p.on("error", () => resolve([]));
  });
}

async function actShip(res: http.ServerResponse) {
  res.write("── 1/5 export + validate ──\n");
  if ((await run(res, "npx", ["tsx", "scripts/world-export-map.ts"])) !== 0) {
    res.write("\n✖ validation failed — fix the issues above in Tiled, then Ship again.\n");
    return 1;
  }
  res.write("\n── 2/5 commit map changes ──\n");
  await run(res, "git", ["add", MAPS_DIR, REGISTRY]);
  const dirty = await gitDirty();
  if (!dirty.trim()) {
    res.write("nothing to commit — maps already shipped. Continuing to asset sync.\n");
  } else {
    const msg =
      "World: map updates (via World Studio)\n\nCo-Authored-By: Claude Fable 5 <noreply@anthropic.com>";
    if ((await run(res, "git", ["commit", "-m", msg])) !== 0) return 1;
  }
  res.write("\n── 3/5 rebase on latest + typecheck ──\n");
  if ((await run(res, "git", ["pull", "--rebase", "--autostash", "origin", "main"])) !== 0) return 1;
  if ((await run(res, "npx", ["tsc", "--noEmit"])) !== 0) {
    res.write("\n✖ typecheck failed — ping Claude with the error above.\n");
    return 1;
  }
  res.write("\n── 4/5 push (main + deploy branch) ──\n");
  if ((await run(res, "git", ["push", "origin", "main"])) !== 0) return 1;
  if ((await run(res, "git", ["push", "origin", `main:${DEPLOY_BRANCH}`])) !== 0) return 1;
  res.write("\n── 5/5 sync assets to S3 ──\n");
  if (
    (await run(res, "railway", [
      "run",
      "--service",
      "trivia-trainer",
      "npx",
      "tsx",
      "scripts/world-sync-assets.ts",
    ])) !== 0
  ) {
    res.write("\n✖ S3 sync failed (is `railway login` done on this machine?). Maps are pushed; ask Claude to sync.\n");
    return 1;
  }
  res.write("\n✔ shipped — maps are live on next page load.\n");
  return 0;
}

const ACTIONS: Record<
  string,
  (res: http.ServerResponse, body: Record<string, string>) => Promise<number>
> = {
  "new-map": actNewMap,
  "import-design": actImportDesign,
  "scan-furniture": (res) => run(res, "npx", ["tsx", "scripts/world-scan-furniture.ts"]),
  "seed-catalog": async (res) => {
    res.write("── 1/2 pack atlases + upsert items (prod DB) ──\n");
    if (
      (await run(res, "railway", [
        "run", "--service", "trivia-trainer",
        "npx", "tsx", "scripts/world-seed-catalog.ts",
      ])) !== 0
    ) {
      res.write("\n✖ seed failed (railway login? draft scanned? items kept?).\n");
      return 1;
    }
    res.write("\n── 2/2 sync atlases to S3 ──\n");
    return run(res, "railway", [
      "run", "--service", "trivia-trainer",
      "npx", "tsx", "scripts/world-sync-assets.ts",
    ]);
  },
  validate: (res) => run(res, "npx", ["tsx", "scripts/world-export-map.ts"]),
  ship: (res) => actShip(res),
  "open-tiled": (res) => run(res, "open", ["assets-src/world.tiled-project"]),
  "open-map": async (res, b) => {
    const map = parseRegistry().find((m) => m.id === b.id);
    if (!map) {
      res.write(`✖ unknown map id ${b.id}\n`);
      return 1;
    }
    return run(res, "open", [map.tmx]);
  },
};

// ── page ────────────────────────────────────────────────────────────────

const PAGE = /* html */ `<!doctype html>
<html><head><meta charset="utf-8"><title>World Studio</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: ui-monospace, Menlo, monospace; background:#f5f1e8; color:#1a1a1a;
         max-width: 860px; margin: 24px auto; padding: 0 16px; }
  h1 { font-size: 22px; text-transform: uppercase; letter-spacing: -0.5px; }
  .card { border: 3px solid #1a1a1a; background: #fffdf7; box-shadow: 4px 4px 0 #1a1a1a;
          padding: 14px; margin-bottom: 18px; }
  .card h2 { margin: 0 0 8px; font-size: 13px; text-transform: uppercase; }
  button { border: 3px solid #1a1a1a; background: #fde047; box-shadow: 3px 3px 0 #1a1a1a;
           font: inherit; font-weight: 700; padding: 6px 12px; cursor: pointer; }
  button:active { transform: translate(2px,2px); box-shadow: 1px 1px 0 #1a1a1a; }
  button.ghost { background: #fffdf7; }
  button.green { background: #86efac; }
  button:disabled { opacity: .5; cursor: wait; }
  input, select { border: 2px solid #1a1a1a; background: #fff; font: inherit; padding: 5px 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  td, th { text-align: left; padding: 5px 8px 5px 0; border-bottom: 1px solid #1a1a1a22; }
  .tag { border: 2px solid #1a1a1a; padding: 0 5px; font-size: 10px; font-weight: 700; }
  .tag.interior { background: #c4b5fd; } .tag.exterior { background: #86efac; }
  .tag.dirty { background: #fca5a5; }
  #log { background: #1a1a1a; color: #e7e5e4; padding: 12px; min-height: 90px; max-height: 360px;
         overflow-y: auto; white-space: pre-wrap; font-size: 12px; border: 3px solid #1a1a1a; }
  #log .ok { color: #86efac; } #log .bad { color: #fca5a5; }
  .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .hint { font-size: 11px; opacity: .55; margin-top: 6px; }
</style></head><body>
<h1>🗺 World Studio</h1>

<div class="card">
  <h2>Maps</h2>
  <table id="maps"><tbody></tbody></table>
  <p class="hint">"local changes" = painted but not shipped. Open in Tiled, paint, then Ship.</p>
</div>

<div class="card">
  <h2>New map</h2>
  <div class="row">
    <input id="nm-id" placeholder="map-id (e.g. cafe-interior)" size="22">
    <select id="nm-kind"><option value="interior">interior</option><option value="exterior">exterior</option></select>
    <input id="nm-label" placeholder='label (e.g. "The Cafe")' size="18">
    <input id="nm-size" placeholder="size (blank = default)" size="16">
    <button onclick="newMap()">Create + open in Tiled</button>
  </div>
  <p class="hint">creates every layer pre-named, tilesets loaded, collision border + spawn point placed, and registers it with the game.</p>
</div>

<div class="card">
  <h2>Start from a pre-made design</h2>
  <div class="row">
    <select id="id-design"><option value="">loading designs…</option></select>
    <input id="id-id" placeholder="map-id (e.g. my-gym)" size="20">
    <input id="id-label" placeholder='label (blank = design name)' size="18">
    <button onclick="importDesign()">Import + open in Tiled</button>
  </div>
  <p class="hint">converts a LimeZu Home Design (16x16) into real editable tile layers — floor/props/overhead pre-painted, you add collision, spawn position, and portals in Tiled.</p>
</div>

<div class="card">
  <h2>Furniture catalog</h2>
  <div class="row">
    <button onclick="location.href='/catalog'">🛋 Open catalog tagger</button>
    <span id="cat-stats" class="hint" style="margin:0"></span>
  </div>
  <p class="hint">Tag the LimeZu furniture singles into named, priced shop items. Hand-name + set a price tier per sprite, mark Keep/Publish; "Seed catalog" packs the keepers into atlases and writes them to the game DB. Scan first if the list is empty.</p>
</div>

<div class="card">
  <h2>Actions</h2>
  <div class="row">
    <button class="ghost" onclick="act('open-tiled')">Open Tiled project</button>
    <button class="ghost" onclick="act('validate')">Validate maps</button>
    <button class="green" onclick="act('ship')">🚢 Ship maps (validate → push → sync)</button>
  </div>
  <p class="hint">Ship = export+validate, commit map files, rebase, typecheck, push, sync assets to S3. Portals/doors and NPC dialog are Claude's side — after shipping, tell Claude where new doors connect.</p>
</div>

<div class="card">
  <h2>Output</h2>
  <div id="log">ready.</div>
</div>

<script>
const log = document.getElementById("log");
let busy = false;

async function refreshMaps() {
  const r = await fetch("/api/maps");
  const { maps } = await r.json();
  document.querySelector("#maps tbody").innerHTML = maps.map(m =>
    '<tr><td><b>' + m.label + '</b></td><td>' + m.id + '</td>' +
    '<td><span class="tag ' + m.kind + '">' + m.kind + '</span>' +
    (m.dirty ? ' <span class="tag dirty">local changes</span>' : '') + '</td>' +
    '<td><button class="ghost" onclick="openMap(\\'' + m.id + '\\')">Open in Tiled</button></td></tr>'
  ).join("");
}

async function act(action, body) {
  if (busy) return;
  busy = true;
  document.querySelectorAll("button").forEach(b => b.disabled = true);
  log.textContent = "";
  try {
    const res = await fetch("/api/run", { method: "POST", headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ action, ...(body||{}) }) });
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      log.textContent += dec.decode(value);
      log.scrollTop = log.scrollHeight;
    }
  } catch (e) { log.textContent += "\\nstudio error: " + e.message; }
  busy = false;
  document.querySelectorAll("button").forEach(b => b.disabled = false);
  refreshMaps();
}

function openMap(id) { act("open-map", { id }); }
async function refreshDesigns() {
  const r = await fetch("/api/designs");
  const { designs } = await r.json();
  document.getElementById("id-design").innerHTML =
    '<option value="">— pick a design —</option>' +
    designs.map(d => '<option value="' + d.key + '">' + d.name + ' (' + d.folder.replace(/_/g, " ") + ')</option>').join("");
}
function importDesign() {
  act("import-design", {
    id: document.getElementById("id-id").value,
    design: document.getElementById("id-design").value,
    label: document.getElementById("id-label").value,
  });
}
function newMap() {
  act("new-map", {
    id: document.getElementById("nm-id").value,
    kind: document.getElementById("nm-kind").value,
    label: document.getElementById("nm-label").value,
    size: document.getElementById("nm-size").value,
  });
}
async function refreshCatStats() {
  try {
    const r = await fetch("/api/catalog/data");
    const d = await r.json();
    document.getElementById("cat-stats").textContent =
      d.count + " sprites · " + d.kept + " kept · " + d.published + " published";
  } catch {}
}
refreshMaps();
refreshDesigns();
refreshCatStats();
</script>
</body></html>`;

const CATALOG_PAGE = /* html */ `<!doctype html>
<html><head><meta charset="utf-8"><title>Furniture Catalog · World Studio</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: ui-monospace, Menlo, monospace; background:#f5f1e8; color:#1a1a1a; margin:0; }
  header { position: sticky; top: 0; z-index: 5; background:#fde047; border-bottom:3px solid #1a1a1a;
           padding:10px 16px; display:flex; gap:14px; align-items:center; }
  header h1 { font-size:15px; text-transform:uppercase; margin:0; }
  header .grow { flex:1; }
  a.back { font-weight:700; text-decoration:none; color:#1a1a1a; border:2px solid #1a1a1a;
           background:#fffdf7; padding:3px 8px; }
  #saved { font-size:11px; opacity:.6; }
  .wrap { display:flex; align-items:flex-start; }
  nav { width:230px; flex:none; border-right:3px solid #1a1a1a; min-height:100vh; padding:10px;
        position:sticky; top:49px; align-self:flex-start; max-height: calc(100vh - 49px); overflow:auto; }
  nav button { display:block; width:100%; text-align:left; border:2px solid #1a1a1a; background:#fffdf7;
               font:inherit; font-size:12px; padding:6px 8px; margin-bottom:6px; cursor:pointer; }
  nav button.active { background:#fde047; font-weight:700; }
  nav .ct { float:right; opacity:.55; font-size:11px; }
  main { flex:1; padding:14px 16px 80px; }
  .toolbar { display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-bottom:12px; }
  .toolbar h2 { font-size:14px; text-transform:uppercase; margin:0 8px 0 0; }
  .toolbar label { font-size:12px; display:flex; gap:4px; align-items:center; }
  button.b { border:2px solid #1a1a1a; background:#fde047; box-shadow:2px 2px 0 #1a1a1a; font:inherit;
             font-weight:700; padding:4px 9px; cursor:pointer; font-size:12px; }
  button.b.ghost { background:#fffdf7; }
  select, input { border:2px solid #1a1a1a; background:#fff; font:inherit; font-size:12px; padding:3px 5px; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(210px,1fr)); gap:12px; }
  .card { border:3px solid #1a1a1a; background:#fffdf7; padding:8px; box-shadow:3px 3px 0 #1a1a1a; }
  .card.keep { background:#ecfdf5; box-shadow:3px 3px 0 #15803d; border-color:#15803d; }
  .card.pub { outline:3px solid #2563eb; outline-offset:2px; }
  .sprite { display:flex; align-items:center; justify-content:center; height:84px; background:#dfd8c8;
            border:2px solid #1a1a1a; margin-bottom:6px; position:relative; }
  .sprite img { image-rendering:pixelated; max-width:90%; max-height:90%; }
  .fp { position:absolute; right:3px; bottom:2px; font-size:10px; background:#1a1a1a; color:#fde047;
        padding:0 3px; font-weight:700; }
  .card input.name { width:100%; margin-bottom:5px; }
  .tiers { display:flex; gap:3px; margin-bottom:5px; }
  .tiers button { flex:1; border:2px solid #1a1a1a; background:#fff; font:inherit; font-size:10px;
                  padding:2px 0; cursor:pointer; }
  .tiers button.on { background:#1a1a1a; color:#fde047; font-weight:700; }
  .cardrow { display:flex; gap:5px; align-items:center; margin-bottom:5px; }
  .cardrow input.price { width:64px; } .cardrow select { flex:1; }
  .toggles { display:flex; gap:10px; font-size:12px; }
  .toggles label { display:flex; gap:4px; align-items:center; cursor:pointer; }
  .empty { opacity:.5; padding:40px; text-align:center; }
</style></head><body>
<header>
  <a class="back" href="/">← Studio</a>
  <h1>🛋 Furniture Catalog</h1>
  <span id="totals"></span>
  <span class="grow"></span>
  <span id="saved"></span>
</header>
<div class="wrap">
  <nav id="themes"></nav>
  <main>
    <div class="toolbar" id="toolbar"></div>
    <div class="grid" id="grid"><div class="empty">pick a theme →</div></div>
  </main>
</div>
<script>
let DATA = null, CUR = null, ITEMS = [];
const saved = document.getElementById("saved");
function flash(t){ saved.textContent = t; }

async function boot(){
  DATA = await (await fetch("/api/catalog/data")).json();
  document.getElementById("totals").textContent =
    DATA.count + " sprites · " + DATA.kept + " kept · " + DATA.published + " published";
  renderThemes();
  if (DATA.themes.length === 0)
    document.getElementById("grid").innerHTML =
      '<div class="empty">No sprites scanned yet. Go back and click "Scan" first.</div>';
}
function renderThemes(){
  document.getElementById("themes").innerHTML = DATA.themes.map(function(t){
    return '<button data-t="'+t.theme+'" class="'+(t.theme===CUR?'active':'')+'" onclick="pick(\\''+t.theme+'\\')">'+
      t.label+'<span class="ct">'+t.kept+'/'+t.count+'</span></button>';
  }).join("");
}
let filterUnnamed=false, filterKept=false;
async function pick(theme){
  CUR = theme; renderThemes();
  const r = await (await fetch("/api/catalog/items?theme="+encodeURIComponent(theme))).json();
  ITEMS = r.items;
  renderToolbar(); renderGrid();
}
function renderToolbar(){
  const t = DATA.themes.find(function(x){return x.theme===CUR;});
  const tierOpts = DATA.tiers.map(function(z){return '<option value="'+z.key+'">'+z.label+'</option>';}).join("");
  document.getElementById("toolbar").innerHTML =
    '<h2>'+t.label+'</h2>'+
    '<label><input type="checkbox" '+(filterUnnamed?'checked':'')+' onchange="filterUnnamed=this.checked;renderGrid()"> unnamed only</label>'+
    '<label><input type="checkbox" '+(filterKept?'checked':'')+' onchange="filterKept=this.checked;renderGrid()"> kept only</label>'+
    '<span style="flex:1"></span>'+
    'default tier <select id="bulktier">'+tierOpts+'</select>'+
    '<button class="b" onclick="bulkKeep()">Keep all + tier</button>'+
    '<button class="b ghost" onclick="bulkUnkeep()">Unkeep all</button>';
}
function tierPrice(k){ const z=DATA.tiers.find(function(x){return x.key===k;}); return z?z.price:0; }
function renderGrid(){
  let rows = ITEMS;
  if (filterUnnamed) rows = rows.filter(function(it){return !(it.seed.name||"").trim();});
  if (filterKept) rows = rows.filter(function(it){return it.seed.keep;});
  if (rows.length===0){ document.getElementById("grid").innerHTML='<div class="empty">nothing matches the filter</div>'; return; }
  document.getElementById("grid").innerHTML = rows.map(card).join("");
}
function card(it){
  const s = it.seed||{};
  const tiers = DATA.tiers.map(function(z){
    return '<button class="'+(s.tier===z.key?'on':'')+'" title="'+z.blurb+'" onclick="setTier(\\''+it.key+'\\',\\''+z.key+'\\')">'+z.label+'</button>';
  }).join("");
  const surf = DATA.surfaces.map(function(u){
    return '<option value="'+u+'" '+(s.surface===u?'selected':'')+'>'+u+'</option>';
  }).join("");
  const pricePh = s.tier?('tier: '+tierPrice(s.tier)):'price';
  return '<div class="card '+(s.keep?'keep':'')+' '+(s.publish?'pub':'')+'" id="c-'+it.key+'">'+
    '<div class="sprite"><img loading="lazy" src="/furniture-img?key='+it.key+'"><span class="fp">'+it.tileW+'×'+it.tileH+'</span></div>'+
    '<input class="name" placeholder="name this item" value="'+esc(s.name||"")+'" '+
      'onkeydown="nameKey(event)" oninput="setField(\\''+it.key+'\\',{name:this.value})">'+
    '<div class="tiers">'+tiers+'</div>'+
    '<div class="cardrow">'+
      '<input class="price" type="number" min="0" placeholder="'+pricePh+'" value="'+(s.price!=null?s.price:"")+'" '+
        'oninput="setField(\\''+it.key+'\\',{price:this.value===\\'\\'?null:Number(this.value)})">'+
      '<select onchange="setField(\\''+it.key+'\\',{surface:this.value})">'+surf+'</select>'+
    '</div>'+
    '<div class="toggles">'+
      '<label><input type="checkbox" '+(s.keep?'checked':'')+' onchange="setField(\\''+it.key+'\\',{keep:this.checked},true)"> keep</label>'+
      '<label><input type="checkbox" '+(s.publish?'checked':'')+' onchange="setField(\\''+it.key+'\\',{publish:this.checked},true)"> publish</label>'+
    '</div></div>';
}
function esc(s){ return String(s).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;"); }
function local(key){ return ITEMS.find(function(it){return it.key===key;}); }

const timers = {};
function setField(key, patch, immediate){
  const it = local(key); if(!it) return;
  it.seed = Object.assign({}, it.seed, patch);
  // keeping implies tier default if none set yet, so price is never 0-by-accident
  if (patch.keep && !it.seed.tier){ it.seed.tier = "decor"; patch.tier = "decor"; }
  if (immediate){ flush(key, it.seed); reflectCard(it); }
  else { clearTimeout(timers[key]); timers[key]=setTimeout(function(){flush(key,it.seed);}, 400); }
}
function setTier(key, tier){
  const it = local(key); if(!it) return;
  it.seed = Object.assign({}, it.seed, {tier:tier});
  flush(key, it.seed); reflectCard(it);
}
function reflectCard(it){
  // re-render just this card to update tier highlight / keep+pub styling
  const el = document.getElementById("c-"+it.key);
  if (el) el.outerHTML = card(it);
}
async function flush(key, seed){
  flash("saving…");
  await fetch("/api/catalog/save",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({key:key,patch:seed})});
  flash("saved ✓"); refreshCounts();
}
async function refreshCounts(){
  const d = await (await fetch("/api/catalog/data")).json();
  DATA.themes = d.themes; DATA.kept = d.kept; DATA.published = d.published; DATA.count = d.count;
  document.getElementById("totals").textContent = d.count+" sprites · "+d.kept+" kept · "+d.published+" published";
  renderThemes();
}
function nameKey(e){
  if (e.key==="Enter"){ e.preventDefault();
    const names = Array.prototype.slice.call(document.querySelectorAll("input.name"));
    const i = names.indexOf(e.target);
    if (i>=0 && i+1<names.length) names[i+1].focus();
  }
}
async function bulkKeep(){
  const tier = document.getElementById("bulktier").value;
  await fetch("/api/catalog/bulk",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({theme:CUR,patch:{keep:true,tier:tier},onlyUnset:true})});
  pick(CUR); refreshCounts();
}
async function bulkUnkeep(){
  await fetch("/api/catalog/bulk",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({theme:CUR,patch:{keep:false}})});
  pick(CUR); refreshCounts();
}
boot();
</script>
</body></html>`;

// ── server ──────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(PAGE);
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/maps") {
    const dirty = await gitDirty();
    const maps = parseRegistry().map((m) => ({
      ...m,
      dirty: dirty.includes(m.tmx.split("/").pop()!),
    }));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ maps }));
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/designs") {
    const designs = await listDesigns();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ designs }));
    return;
  }
  if (req.method === "GET" && url.pathname === "/catalog") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(CATALOG_PAGE);
    return;
  }
  // Catalog summary: per-theme counts merged with seed state.
  if (req.method === "GET" && url.pathname === "/api/catalog/data") {
    const { items } = loadDraft();
    const seed = loadSeed();
    const themes = new Map<string, { theme: string; label: string; count: number; kept: number; named: number }>();
    let kept = 0, published = 0;
    for (const it of items) {
      const t = themes.get(it.theme) ?? { theme: it.theme, label: it.themeLabel, count: 0, kept: 0, named: 0 };
      t.count++;
      const e = seed.items[it.key];
      if (e?.keep) { t.kept++; kept++; }
      if (e?.name?.trim()) t.named++;
      if (e?.publish) published++;
      themes.set(it.theme, t);
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      count: items.length, kept, published,
      themes: [...themes.values()].sort((a, b) => a.label.localeCompare(b.label)),
      tiers: TIERS, surfaces: SURFACES,
    }));
    return;
  }
  // Items for one theme, each merged with its seed entry.
  if (req.method === "GET" && url.pathname === "/api/catalog/items") {
    const { items } = loadDraft();
    const seed = loadSeed();
    const theme = url.searchParams.get("theme");
    const rows = items
      .filter((it) => it.theme === theme)
      .map((it) => ({ ...it, seed: seed.items[it.key] ?? {} }));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ items: rows }));
    return;
  }
  // Serve a sprite PNG straight off disk by stable key.
  if (req.method === "GET" && url.pathname === "/furniture-img") {
    const { byKey } = loadDraft();
    const it = byKey.get(url.searchParams.get("key") ?? "");
    if (!it || !fs.existsSync(it.file)) { res.writeHead(404).end(); return; }
    res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "max-age=3600" });
    res.end(fs.readFileSync(it.file));
    return;
  }
  // Autosave a single item's tagging (merge patch into the seed).
  if (req.method === "POST" && url.pathname === "/api/catalog/save") {
    const body = await readBody(req);
    const key = body.key;
    if (!key) { res.writeHead(400).end('{"error":"no key"}'); return; }
    const seed = loadSeed();
    const patch = (body as Record<string, unknown>).patch as SeedEntry | undefined;
    seed.items[key] = { ...(seed.items[key] ?? {}), ...(patch ?? {}) };
    saveSeed(seed);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end('{"ok":true}');
    return;
  }
  // Bulk apply a patch to every sprite in a theme (e.g. keep-all, set tier).
  if (req.method === "POST" && url.pathname === "/api/catalog/bulk") {
    const body = await readBody(req);
    const theme = (body as Record<string, unknown>).theme as string;
    const patch = (body as Record<string, unknown>).patch as SeedEntry;
    const onlyUnset = (body as Record<string, unknown>).onlyUnset as boolean | undefined;
    const { items } = loadDraft();
    const seed = loadSeed();
    let n = 0;
    for (const it of items) {
      if (it.theme !== theme) continue;
      const cur = seed.items[it.key] ?? {};
      if (onlyUnset && cur.keep) continue;
      seed.items[it.key] = { ...cur, ...patch };
      n++;
    }
    saveSeed(seed);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, n }));
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/run") {
    const body = await readBody(req);
    const action = ACTIONS[body.action];
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "X-Accel-Buffering": "no" });
    if (!action) {
      res.end(`✖ unknown action ${body.action}\n`);
      return;
    }
    const code = await action(res, body);
    res.end(code === 0 ? "\n[done]\n" : `\n[failed — exit ${code}]\n`);
    return;
  }
  res.writeHead(404).end();
});

server.listen(PORT, "127.0.0.1", () => {
  const url = `http://127.0.0.1:${PORT}`;
  console.log(`World Studio → ${url}`);
  spawn("open", [url]); // pop the browser (macOS)
});
