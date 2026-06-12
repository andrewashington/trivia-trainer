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

const PORT = 4499;
const REGISTRY = "src/modules/world/maps.ts";
const MAPS_DIR = "assets-src/runtime/world/maps";
const DEPLOY_BRANCH = "claude/serene-feynman-e4tdza";

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
refreshMaps();
refreshDesigns();
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
