/**
 * Build the Discord Stats "insights" layer from the segment embeddings.
 *
 *   npm run discord:insights
 *
 * Reads discord_archive.segment_embeddings (built by discord-embed.mjs) and
 * produces the precomputed artifacts the Discord Stats hub's marquee features
 * read (all REBUILDABLE caches — safe to re-run):
 *   - segment_layout  : k-means cluster_id for every segment + a 2D UMAP
 *                       projection (x,y) for a sample → the Vibe Galaxy
 *   - topic_cluster   : LLM-labeled topic per cluster → galaxy labels + trends
 *   - author_vector   : per-author "thought centroid" (pgvector) → soulmates
 *   - author_dossier  : LLM personality dossier per author
 *   - lexicon_term    : LLM-authored group inside-joke glossary
 *
 * Triggered from the admin panel ("Rebuild insights") which spawns this as a
 * detached process, or run by hand. Maintains discord_archive.insights_meta.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";

const ROOT = join(process.cwd());
loadEnv();

const db = new PrismaClient();
const LLM_MODEL = process.env.OPENROUTER_MODEL || "anthropic/claude-haiku-4-5";
const K = Math.max(6, Math.min(24, Number(process.env.DISCORD_INSIGHTS_K || 16)));
const SAMPLE = Math.max(1000, Math.min(15000, Number(process.env.DISCORD_INSIGHTS_SAMPLE || 9000)));
const REDUCE_DIMS = 64; // random-project embeddings before k-means/UMAP (speed)
const DOSSIER_MIN_MSGS = 300; // only profile real regulars
const CHAT_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
// --dry: run the compute (load → cluster → project) and report, but write
// nothing and call no LLM. For validating the math before the tables exist.
const DRY = process.argv.includes("--dry");

async function main() {
  await setMeta("running", "loading embeddings");

  const [{ n }] = await db.$queryRaw`SELECT count(*)::int AS n FROM discord_archive.segment_embeddings`;
  if (!n) {
    await setMeta("error", "no embeddings — run discord:embed first");
    console.error("[insights] no segment embeddings found");
    return;
  }
  console.log(`[insights] ${n} embedded segments; K=${K}, sample=${SAMPLE}`);

  // ---- 1. Load a random sample (with text) for clustering + projection ----
  await setMeta("running", "loading sample");
  const sample = await db.$queryRaw`
    SELECT e.segment_id AS id, e.embedding::text AS vec, s.content AS content,
           extract(year FROM s.start_at)::int AS era
    FROM discord_archive.segment_embeddings e
    JOIN discord_archive.message_segments s ON s.id = e.segment_id
    ORDER BY random()
    LIMIT ${SAMPLE}
  `;
  const sampleVecs = sample.map((r) => parseVec(r.vec));
  const dim = sampleVecs[0].length;
  console.log(`[insights] sample=${sample.length}, dim=${dim}`);

  // ---- 2. Random projection → reduced space (Johnson–Lindenstrauss) ----
  const R = randomProjection(dim, REDUCE_DIMS);
  const sampleReduced = sampleVecs.map((v) => project(v, R));

  // ---- 3. K-means in reduced space ----
  await setMeta("running", "clustering");
  const { centroids, assignments } = kmeans(sampleReduced, K, 30);
  console.log("[insights] k-means done");

  // ---- 4. 2D projection (zero-dep): blend global PCA detail with per-cluster
  //         separation so the galaxy reads as distinct, colored islands. ----
  await setMeta("running", "projecting");
  const globalXY = normalizeXY(pca2(sampleReduced)); // local PCA texture, [-1,1]
  const clusterXY = normalizeXY(pca2(centroids)); // island anchors, [-1,1]
  const SEP = 6.5; // how far apart clusters sit
  const LOCAL = 1.4; // intra-cluster spread
  const xy = sampleReduced.map((_, i) => {
    const c = assignments[i];
    return [clusterXY[c][0] * SEP + globalXY[i][0] * LOCAL, clusterXY[c][1] * SEP + globalXY[i][1] * LOCAL];
  });
  console.log("[insights] projection done");
  const sampleXY = new Map();
  sample.forEach((r, i) => sampleXY.set(r.id, { x: xy[i][0], y: xy[i][1], c: assignments[i] }));

  // ---- 5. Full pass: cluster_id for EVERY segment + author centroids ----
  await setMeta("running", "assigning clusters");
  const authorSum = new Map(); // authorId -> { name, sum:Float64Array, count }
  const clusterSize = new Array(K).fill(0);
  const layoutRows = [];
  let last = "";
  for (;;) {
    const batch = await db.$queryRaw`
      SELECT e.segment_id AS id, e.embedding::text AS vec,
             extract(year FROM s.start_at)::int AS era,
             m.author_id AS author_id, m.author_name AS author_name
      FROM discord_archive.segment_embeddings e
      JOIN discord_archive.message_segments s ON s.id = e.segment_id
      LEFT JOIN discord_archive.messages m ON m.id = s.start_msg_id
      WHERE e.segment_id > ${last}
      ORDER BY e.segment_id
      LIMIT 2000
    `;
    if (!batch.length) break;
    for (const row of batch) {
      const v = parseVec(row.vec);
      const reduced = project(v, R);
      const c = nearest(reduced, centroids);
      clusterSize[c]++;
      layoutRows.push({ id: row.id, c, era: row.era ?? null, xy: sampleXY.get(row.id) ?? null });
      if (row.author_id) {
        let a = authorSum.get(row.author_id);
        if (!a) {
          a = { name: row.author_name || "?", sum: new Float64Array(v.length), count: 0 };
          authorSum.set(row.author_id, a);
        }
        for (let i = 0; i < v.length; i++) a.sum[i] += v[i];
        a.count++;
      }
    }
    last = batch[batch.length - 1].id;
    if (DRY && layoutRows.length >= 4000) break;
  }
  console.log(`[insights] assigned ${layoutRows.length} segments`);

  if (DRY) {
    const xs = [...sampleXY.values()].map((p) => p.x);
    const ys = [...sampleXY.values()].map((p) => p.y);
    const finite = xs.every(Number.isFinite) && ys.every(Number.isFinite);
    console.log("[insights:dry] xy finite:", finite);
    console.log("[insights:dry] x range:", Math.min(...xs).toFixed(2), "→", Math.max(...xs).toFixed(2));
    console.log("[insights:dry] y range:", Math.min(...ys).toFixed(2), "→", Math.max(...ys).toFixed(2));
    console.log("[insights:dry] cluster sizes (sample pass):", clusterSize.join(", "));
    console.log("[insights:dry] authors seen:", authorSum.size);
    console.log("[insights:dry] OK — no writes performed");
    return;
  }

  // ---- 6. Write segment_layout ----
  await setMeta("running", "writing layout");
  await db.$executeRaw`TRUNCATE discord_archive.segment_layout`;
  for (let i = 0; i < layoutRows.length; i += 1000) {
    const chunk = layoutRows.slice(i, i + 1000).map(
      (r) =>
        Prisma.sql`(${r.id}, ${r.c}, ${r.xy ? r.xy.x : null}, ${r.xy ? r.xy.y : null}, ${r.era})`,
    );
    await db.$executeRaw`
      INSERT INTO discord_archive.segment_layout (segment_id, cluster_id, x, y, era)
      VALUES ${Prisma.join(chunk)}
    `;
  }

  // ---- 7. Author vectors (centroids) ----
  await setMeta("running", "author vectors");
  await db.$executeRaw`TRUNCATE discord_archive.author_vector`;
  const avRows = [];
  for (const [authorId, a] of authorSum) {
    if (a.count < 30) continue; // need enough to be a real centroid
    const mean = Array.from(a.sum, (s) => s / a.count);
    avRows.push(Prisma.sql`(${authorId}, ${a.name}, ${a.count}, ${`[${mean.join(",")}]`}::vector)`);
  }
  for (let i = 0; i < avRows.length; i += 50) {
    await db.$executeRaw`
      INSERT INTO discord_archive.author_vector (author_id, author_name, segment_count, embedding)
      VALUES ${Prisma.join(avRows.slice(i, i + 50))}
    `;
  }
  console.log(`[insights] ${avRows.length} author vectors`);

  // ---- 8. Topic clusters: keywords + LLM labels ----
  await setMeta("running", "labeling topics");
  const byCluster = new Map();
  sample.forEach((r, i) => {
    const c = assignments[i];
    if (!byCluster.has(c)) byCluster.set(c, []);
    byCluster.get(c).push(r.content);
  });
  await db.$executeRaw`TRUNCATE discord_archive.topic_cluster`;
  for (let c = 0; c < K; c++) {
    const texts = (byCluster.get(c) ?? []).slice(0, 12);
    if (!texts.length) continue;
    const keywords = topKeywords(byCluster.get(c) ?? [], 6);
    let label = keywords.slice(0, 2).join(" / ") || `Topic ${c + 1}`;
    let summary = "";
    const got = await chatJSON(
      "You name topic clusters from a friend group's Discord chat. Output JSON {label, summary}. label: 2-4 punchy words (Title Case). summary: one wry sentence. No quotes around them.",
      `Conversation snippets from one cluster:\n\n${texts.map((t) => `- ${oneLine(t).slice(0, 200)}`).join("\n")}\n\nKeywords: ${keywords.join(", ")}`,
      120,
    ).catch(() => null);
    if (got && got.label) {
      label = String(got.label).slice(0, 60);
      summary = String(got.summary || "").slice(0, 200);
    }
    await db.$executeRaw`
      INSERT INTO discord_archive.topic_cluster (id, label, summary, size, keywords)
      VALUES (${c}, ${label}, ${summary}, ${clusterSize[c]}, ${keywords})
    `;
    console.log(`[insights] cluster ${c}: ${label} (${clusterSize[c]})`);
  }

  // ---- 9. Dossiers for the regulars ----
  await setMeta("running", "writing dossiers");
  await db.$executeRaw`TRUNCATE discord_archive.author_dossier`;
  const regulars = await db.$queryRaw`
    SELECT author_id, (array_agg(author_name ORDER BY sent_at DESC))[1] AS author_name, count(*)::int AS msgs
    FROM discord_archive.messages
    WHERE deleted_at IS NULL AND is_bot = false
    GROUP BY author_id HAVING count(*) >= ${DOSSIER_MIN_MSGS}
    ORDER BY msgs DESC
  `;
  for (const r of regulars) {
    const lines = await db.$queryRaw`
      (SELECT content FROM discord_archive.messages
        WHERE author_id = ${r.author_id} AND deleted_at IS NULL AND reaction_count > 0 AND length(content) > 8
        ORDER BY reaction_count DESC LIMIT 12)
      UNION ALL
      (SELECT content FROM discord_archive.messages
        WHERE author_id = ${r.author_id} AND deleted_at IS NULL AND length(content) BETWEEN 12 AND 220
        ORDER BY random() LIMIT 18)
    `;
    const corpus = lines.map((l) => `- ${oneLine(l.content).slice(0, 200)}`).join("\n").slice(0, 4000);
    const got = await chatJSON(
      `You write short, dry, affectionate "dossiers" on members of a private friend group, from their real messages. Output JSON {body}. body is MARKDOWN, under 130 words: a one-line **bio**, a short "the energy they bring" line, and a "catchphrases" bit if any are obvious. Irreverent and funny, never cruel. Use their actual quirks. No headers like "Dossier".`,
      `Member: ${r.author_name} (${r.msgs.toLocaleString()} messages)\n\nSample of their messages:\n${corpus}`,
      400,
    ).catch(() => null);
    if (got && got.body) {
      await db.$executeRaw`
        INSERT INTO discord_archive.author_dossier (author_id, author_name, body, model)
        VALUES (${r.author_id}, ${r.author_name}, ${String(got.body).slice(0, 4000)}, ${LLM_MODEL})
      `;
      console.log(`[insights] dossier: ${r.author_name}`);
    }
  }

  // ---- 10. Group lexicon ----
  await setMeta("running", "mining lexicon");
  await buildLexicon();

  await setMeta("idle", `built ${layoutRows.length} pts · ${avRows.length} people · ${K} topics`, {
    segments: layoutRows.length,
    clusters: K,
    authors: avRows.length,
    sample: sample.length,
  });
  console.log("[insights] done");
}

async function buildLexicon() {
  // Candidate tokens: frequent lexemes that aren't generic English chat-filler.
  const COMMON = new Set(
    ("like just yeah lol get got go going know think one good time guys really right now today day man" +
      " want need make made see say said come back people thing things lot way little bit feel kinda" +
      " gonna wanna gotta okay yes yep nope haha lmao actually pretty sure tho damn shit fuck dude bro" +
      " love hate cool nice work week year game play watch play")
      .split(/\s+/),
  );
  const rows = await db.$queryRaw`
    SELECT word, nentry::int AS nentry
    FROM ts_stat(${"SELECT content_tsv FROM discord_archive.messages WHERE deleted_at IS NULL AND is_bot = false"})
    WHERE nentry >= 80 AND length(word) >= 4
    ORDER BY nentry DESC LIMIT 200
  `;
  const candidates = rows
    .filter((r) => /^[a-z][a-z'-]+$/i.test(r.word) && !COMMON.has(r.word.toLowerCase()))
    .slice(0, 45);
  if (!candidates.length) return;

  // One example message per candidate (short + illustrative).
  const examples = {};
  for (const c of candidates) {
    const [ex] = await db.$queryRaw`
      SELECT content FROM discord_archive.messages
      WHERE content_tsv @@ plainto_tsquery('english', ${c.word})
        AND deleted_at IS NULL AND is_bot = false AND length(content) BETWEEN 12 AND 160
      ORDER BY reaction_count DESC LIMIT 1
    `;
    if (ex) examples[c.word] = oneLine(ex.content).slice(0, 160);
  }

  const list = candidates
    .map((c) => `${c.word} (${c.nentry}×)${examples[c.word] ? ` — e.g. "${examples[c.word]}"` : ""}`)
    .join("\n");
  const got = await chatJSON(
    `You compile a friend group's private dictionary from their Discord. From the candidate words, KEEP only genuine inside-jokes, group-specific slang, nicknames, recurring bits, or memes — drop ordinary English. Output JSON {terms:[{term, definition, example}]}, up to 18 entries. definition: one wry sentence. example: a short real usage (reuse the provided one or paraphrase). Title-case proper nouns.`,
    `Candidate words (with usage counts + an example):\n${list}`,
    1400,
  ).catch(() => null);
  if (!got || !Array.isArray(got.terms)) return;

  await db.$executeRaw`TRUNCATE discord_archive.lexicon_term`;
  for (const t of got.terms.slice(0, 24)) {
    if (!t || !t.term || !t.definition) continue;
    const term = String(t.term).slice(0, 60);
    const uses = candidates.find((c) => c.word.toLowerCase() === term.toLowerCase())?.nentry ?? 0;
    await db.$executeRaw`
      INSERT INTO discord_archive.lexicon_term (term, definition, example, uses)
      VALUES (${term}, ${String(t.definition).slice(0, 400)}, ${String(t.example || "").slice(0, 240)}, ${uses})
      ON CONFLICT (term) DO UPDATE SET definition = EXCLUDED.definition, example = EXCLUDED.example, uses = EXCLUDED.uses
    `;
  }
  console.log(`[insights] lexicon: ${got.terms.length} terms`);
}

// ---------- math helpers ----------

function parseVec(text) {
  const inner = text.slice(1, -1);
  const parts = inner.split(",");
  const out = new Float32Array(parts.length);
  for (let i = 0; i < parts.length; i++) out[i] = +parts[i];
  return out;
}

function randomProjection(from, to) {
  // Gaussian random matrix [to][from]; rows are the projection axes.
  const R = [];
  for (let i = 0; i < to; i++) {
    const row = new Float32Array(from);
    for (let j = 0; j < from; j++) row[j] = gauss();
    R.push(row);
  }
  return R;
}

function project(vec, R) {
  const out = new Float32Array(R.length);
  for (let i = 0; i < R.length; i++) {
    const row = R[i];
    let s = 0;
    for (let j = 0; j < vec.length; j++) s += vec[j] * row[j];
    out[i] = s;
  }
  return out;
}

// ---- PCA → 2D (top-2 principal components via power iteration) ----

function pca2(points) {
  const n = points.length;
  const d = points[0].length;
  const mean = new Float64Array(d);
  for (const p of points) for (let j = 0; j < d; j++) mean[j] += p[j];
  for (let j = 0; j < d; j++) mean[j] /= n;
  const cen = points.map((p) => {
    const c = new Float64Array(d);
    for (let j = 0; j < d; j++) c[j] = p[j] - mean[j];
    return c;
  });
  const pc1 = powerIter(cen, d, null);
  const pc2 = powerIter(cen, d, pc1);
  return cen.map((c) => [dotF(c, pc1), dotF(c, pc2)]);
}

// Dominant eigenvector of the covariance (Σ c·cᵀ) via power iteration; if `orth`
// is given, deflate against it each step to get the 2nd component.
function powerIter(cen, d, orth) {
  let v = new Float64Array(d);
  for (let j = 0; j < d; j++) v[j] = gauss();
  normalizeV(v);
  for (let it = 0; it < 60; it++) {
    const nv = new Float64Array(d);
    for (const c of cen) {
      let s = 0;
      for (let j = 0; j < d; j++) s += c[j] * v[j];
      for (let j = 0; j < d; j++) nv[j] += s * c[j];
    }
    if (orth) {
      let dp = 0;
      for (let j = 0; j < d; j++) dp += nv[j] * orth[j];
      for (let j = 0; j < d; j++) nv[j] -= dp * orth[j];
    }
    normalizeV(nv);
    v = nv;
  }
  return v;
}

function dotF(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function normalizeV(v) {
  let m = 0;
  for (let i = 0; i < v.length; i++) m += v[i] * v[i];
  m = Math.sqrt(m) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= m;
}

// Scale 2D coords to roughly [-1, 1] on each axis (robust to outliers via max-abs).
function normalizeXY(coords) {
  let mx = 0;
  let my = 0;
  for (const [x, y] of coords) {
    mx = Math.max(mx, Math.abs(x));
    my = Math.max(my, Math.abs(y));
  }
  mx = mx || 1;
  my = my || 1;
  return coords.map(([x, y]) => [x / mx, y / my]);
}

function dist2(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return s;
}

function nearest(v, centroids) {
  let best = 0;
  let bd = Infinity;
  for (let c = 0; c < centroids.length; c++) {
    const d = dist2(v, centroids[c]);
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return best;
}

function kmeans(points, k, iters) {
  const dim = points[0].length;
  // k-means++-lite init: first random, rest favor distant points.
  const centroids = [points[Math.floor(Math.random() * points.length)].slice()];
  while (centroids.length < k) {
    let bestPt = points[0];
    let bestD = -1;
    for (let t = 0; t < 64; t++) {
      const p = points[Math.floor(Math.random() * points.length)];
      const d = Math.min(...centroids.map((c) => dist2(p, c)));
      if (d > bestD) {
        bestD = d;
        bestPt = p;
      }
    }
    centroids.push(bestPt.slice());
  }
  const assign = new Array(points.length).fill(0);
  for (let it = 0; it < iters; it++) {
    let moved = 0;
    for (let i = 0; i < points.length; i++) {
      const c = nearest(points[i], centroids);
      if (c !== assign[i]) moved++;
      assign[i] = c;
    }
    const sums = Array.from({ length: k }, () => new Float64Array(dim));
    const counts = new Array(k).fill(0);
    for (let i = 0; i < points.length; i++) {
      const c = assign[i];
      counts[c]++;
      const p = points[i];
      for (let j = 0; j < dim; j++) sums[c][j] += p[j];
    }
    for (let c = 0; c < k; c++) {
      if (!counts[c]) continue;
      for (let j = 0; j < dim; j++) centroids[c][j] = sums[c][j] / counts[c];
    }
    if (it > 2 && moved < points.length * 0.001) break;
  }
  return { centroids, assignments: assign };
}

let spare = null;
function gauss() {
  if (spare !== null) {
    const v = spare;
    spare = null;
    return v;
  }
  let u = 0;
  let v = 0;
  let s = 0;
  do {
    u = Math.random() * 2 - 1;
    v = Math.random() * 2 - 1;
    s = u * u + v * v;
  } while (s >= 1 || s === 0);
  const m = Math.sqrt((-2 * Math.log(s)) / s);
  spare = v * m;
  return u * m;
}

const STOP = new Set(
  "the a an and or but is are was were be been to of in on for with at by from as it this that these those i you he she we they me him her them my your our their so if not no yes do did does have has had will would can could just like get got im its".split(
    /\s+/,
  ),
);

function topKeywords(texts, n) {
  const freq = new Map();
  for (const t of texts) {
    for (const raw of oneLine(t).toLowerCase().split(/[^a-z0-9']+/)) {
      const w = raw.replace(/^[^a-z]+|[^a-z]+$/g, "");
      if (w.length < 4 || STOP.has(w)) continue;
      freq.set(w, (freq.get(w) || 0) + 1);
    }
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([w]) => w);
}

function oneLine(s) {
  let t = String(s ?? "");
  if (t.toWellFormed) t = t.toWellFormed();
  // strip "author:" line prefixes so topic snippets read as content
  return t
    .replace(/\p{C}/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------- LLM (OpenRouter, JSON mode) ----------

async function chatJSON(system, user, maxTokens) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY not set");
  const referer = (process.env.AUTH_URL || "https://udm-plus.up.railway.app").replace(/\/$/, "");
  const call = async () => {
    const res = await fetch(CHAT_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": referer,
        "X-Title": "UDM+ Discord insights",
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        response_format: { type: "json_object" },
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = await res.json();
    const content = json.choices?.[0]?.message?.content ?? "";
    return JSON.parse(content.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim());
  };
  try {
    return await call();
  } catch {
    return await call();
  }
}

// ---------- bookkeeping ----------

async function setMeta(status, detail, stats) {
  try {
    await db.$executeRaw`
      UPDATE discord_archive.insights_meta
      SET status = ${status},
          detail = ${detail ?? ""},
          stats = ${stats ? JSON.stringify(stats) : null}::jsonb,
          last_built_at = CASE WHEN ${status} = 'idle' THEN now() ELSE last_built_at END
      WHERE id = 1
    `;
  } catch (e) {
    console.error("[insights] setMeta failed", e.message);
  }
}

function loadEnv() {
  const envPath = join(ROOT, ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"#]*)"?\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim();
  }
}

main()
  .catch(async (err) => {
    console.error(err);
    await setMeta("error", String(err?.message || err).slice(0, 280));
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
