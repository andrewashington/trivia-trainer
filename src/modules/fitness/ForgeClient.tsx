"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { Button, Field, Input, Textarea } from "@/components/ui";
import type { PlanDraft } from "@/modules/fitness/normalize";
import type { PlanDoc } from "@/modules/fitness/schema";

/**
 * The Forge: paste anything → AI-structured editable draft → save. Stolen
 * beat-for-beat from the home-plus recipe box: nothing persists until the
 * human approves, the whole draft is editable in place, and a dead AI
 * degrades to an honest rough parse instead of an error wall.
 */

const FLAVOR = [
  "Consulting the iron scripture…",
  "Counting someone else's reps…",
  "Translating bro-speak…",
  "Judging the rest intervals…",
  "Separating supersets from lies…",
];

const emptyExercise = () => ({ name: "", sets: null, reps: null, load: null, rest: null, notes: null });

export function ForgeClient() {
  const router = useRouter();
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [flavor, setFlavor] = useState(0);
  const [draft, setDraft] = useState<PlanDraft | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const looksUrl = /^https?:\/\/\S+$/i.test(raw.trim());

  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setFlavor((f) => (f + 1) % FLAVOR.length), 2200);
    return () => clearInterval(t);
  }, [busy]);

  async function forge() {
    setBusy(true);
    setError(null);
    try {
      const body = looksUrl ? { url: raw.trim() } : { text: raw };
      const { draft } = await api<{ draft: PlanDraft }>("/api/fitness/normalize", {
        method: "POST",
        body,
      });
      setDraft(draft);
      setNotice(
        draft.aiUsed
          ? "The Forge hammered it into shape — tweak anything, then post it."
          : "AI's off — this is a rough parse of your text. Straighten it out, then post."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "The Forge sputtered. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const { plan } = await api<{ plan: { id: string } }>("/api/fitness/plans", {
        method: "POST",
        body: draft,
      });
      router.push(`/pump/${plan.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed. The program survives in the box above.");
      setSaving(false);
    }
  }

  if (!draft) {
    return (
      <div className="brutal-card space-y-4 p-5">
        <Field label="The raw material">
          <Textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            rows={12}
            placeholder={
              "Paste a program, any shape it comes in — a note, a spreadsheet dump, a bro-text, a link.\n\nDay 1 — Push\nBench 3x8-12\nOHP 3x10\nA1 Lateral raise 3x15\nA2 Pushdowns 3x15 …"
            }
            className="brutal-input min-h-32 font-mono text-sm"
          />
        </Field>
        {error && (
          <p className="border-2 border-ink bg-accent-red px-3 py-2 text-sm font-bold text-white">{error}</p>
        )}
        <Button onClick={forge} disabled={busy || !raw.trim()} className="w-full !bg-accent-bronze !text-ink">
          {busy ? FLAVOR[flavor] : looksUrl ? "Read the link" : "Forge it"}
        </Button>
        <p className="text-center font-mono text-xs uppercase tracking-wide text-ink/50">
          Nothing is posted until you approve the draft
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {notice && (
        <p className="border-2 border-ink bg-accent-yellow px-3 py-2 font-mono text-xs font-bold uppercase tracking-wide">
          {notice}
        </p>
      )}
      <PlanDraftEditor draft={draft} onChange={setDraft} />
      {error && (
        <p className="border-2 border-ink bg-accent-red px-3 py-2 text-sm font-bold text-white">{error}</p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button onClick={save} disabled={saving} className="flex-1 !bg-accent-bronze !text-ink">
          {saving ? "Posting…" : "Post the program"}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            setDraft(null);
            setNotice(null);
          }}
        >
          Discard draft
        </Button>
      </div>
    </div>
  );
}

// ── The draft editor (also used by /pump/[id]/edit) ─────────────────────────

export function PlanDraftEditor({
  draft,
  onChange,
}: {
  draft: PlanDraft;
  onChange: (d: PlanDraft) => void;
}) {
  const set = (patch: Partial<PlanDraft>) => onChange({ ...draft, ...patch });
  const setDoc = (doc: PlanDoc) => onChange({ ...draft, doc });

  const updateDay = (di: number, patch: Partial<PlanDoc["days"][number]>) => {
    const days = draft.doc.days.map((d, i) => (i === di ? { ...d, ...patch } : d));
    setDoc({ days });
  };
  const updateExercise = (di: number, bi: number, ei: number, patch: Record<string, unknown>) => {
    const days = draft.doc.days.map((d, i) => {
      if (i !== di) return d;
      const blocks = d.blocks.map((b, j) => {
        if (j !== bi) return b;
        const exercises = b.exercises.map((ex, k) => (k === ei ? { ...ex, ...patch } : ex));
        return { ...b, exercises };
      });
      return { ...d, blocks };
    });
    setDoc({ days });
  };
  const removeExercise = (di: number, bi: number, ei: number) => {
    const days = draft.doc.days
      .map((d, i) => {
        if (i !== di) return d;
        const blocks = d.blocks
          .map((b, j) => (j === bi ? { ...b, exercises: b.exercises.filter((_, k) => k !== ei) } : b))
          .filter((b) => b.exercises.length > 0);
        return { ...d, blocks };
      })
      .filter((d) => d.blocks.length > 0);
    setDoc({ days: days.length ? days : draft.doc.days });
  };
  const addExercise = (di: number) => {
    const days = draft.doc.days.map((d, i) => {
      if (i !== di) return d;
      const blocks = [...d.blocks];
      const last = blocks[blocks.length - 1];
      blocks[blocks.length - 1] = { ...last, exercises: [...last.exercises, emptyExercise()] };
      return { ...d, blocks };
    });
    setDoc({ days });
  };
  const addDay = () => {
    if (draft.doc.days.length >= 14) return;
    setDoc({
      days: [
        ...draft.doc.days,
        { name: `Day ${draft.doc.days.length + 1}`, focus: null, blocks: [{ label: null, exercises: [emptyExercise()] }] },
      ],
    });
  };
  const removeDay = (di: number) => {
    if (draft.doc.days.length <= 1) return;
    setDoc({ days: draft.doc.days.filter((_, i) => i !== di) });
  };

  const cell = "brutal-input !px-2 !py-1 font-mono text-sm";

  return (
    <div className="space-y-4">
      <div className="brutal-card space-y-3 p-4">
        <Field label="Program name">
          <Input value={draft.title} onChange={(e) => set({ title: e.target.value })} required />
        </Field>
        <Field label="Blurb (one dry sentence)">
          <Input
            value={draft.blurb ?? ""}
            onChange={(e) => set({ blurb: e.target.value || null })}
            placeholder="What this program is and who it punishes"
          />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Goal">
            <Input
              value={draft.goal ?? ""}
              onChange={(e) => set({ goal: e.target.value || null })}
              placeholder="strength / hypertrophy"
            />
          </Field>
          <Field label="Days / week">
            <Input
              type="number"
              min={1}
              max={7}
              value={draft.daysPerWeek ?? ""}
              onChange={(e) => set({ daysPerWeek: e.target.value ? Number(e.target.value) : null })}
            />
          </Field>
          <Field label="Equipment">
            <Input
              value={draft.equipment ?? ""}
              onChange={(e) => set({ equipment: e.target.value || null })}
              placeholder="full gym / home"
            />
          </Field>
        </div>
      </div>

      {draft.doc.days.map((day, di) => (
        <div key={di} className="brutal-card space-y-3 p-4">
          <div className="flex items-end gap-2">
            <Field label={`Day ${di + 1}`}>
              <Input value={day.name} onChange={(e) => updateDay(di, { name: e.target.value })} />
            </Field>
            <Field label="Focus">
              <Input
                value={day.focus ?? ""}
                onChange={(e) => updateDay(di, { focus: e.target.value || null })}
                placeholder="push / pull / legs"
              />
            </Field>
            {draft.doc.days.length > 1 && (
              <Button type="button" variant="ghost" className="!px-3 !py-1 text-sm" onClick={() => removeDay(di)}>
                ✕
              </Button>
            )}
          </div>
          {day.blocks.map((block, bi) => (
            <div key={bi} className={block.label ? "border-l-3 border-ink/30 pl-3" : ""}>
              {block.label && (
                <p className="mb-1 font-mono text-xs font-bold uppercase tracking-wider text-ink/60">
                  ⛓ {block.label}
                </p>
              )}
              <div className="space-y-2">
                {block.exercises.map((ex, ei) => (
                  <div key={ei} className="grid grid-cols-12 gap-1.5">
                    <input
                      className={`${cell} col-span-11 sm:col-span-4 !font-body font-bold`}
                      value={ex.name}
                      placeholder="Lift"
                      onChange={(e) => updateExercise(di, bi, ei, { name: e.target.value })}
                    />
                    <button
                      type="button"
                      className="col-span-1 text-ink/40 hover:text-accent-red sm:order-last"
                      title="Remove exercise"
                      onClick={() => removeExercise(di, bi, ei)}
                    >
                      ✕
                    </button>
                    <input
                      className={`${cell} col-span-3 sm:col-span-1`}
                      value={ex.sets ?? ""}
                      placeholder="sets"
                      inputMode="numeric"
                      onChange={(e) =>
                        updateExercise(di, bi, ei, { sets: e.target.value ? Number(e.target.value) || null : null })
                      }
                    />
                    <input
                      className={`${cell} col-span-3 sm:col-span-2`}
                      value={ex.reps ?? ""}
                      placeholder="reps"
                      onChange={(e) => updateExercise(di, bi, ei, { reps: e.target.value || null })}
                    />
                    <input
                      className={`${cell} col-span-3 sm:col-span-2`}
                      value={ex.load ?? ""}
                      placeholder="load"
                      onChange={(e) => updateExercise(di, bi, ei, { load: e.target.value || null })}
                    />
                    <input
                      className={`${cell} col-span-3 sm:col-span-2`}
                      value={ex.rest ?? ""}
                      placeholder="rest"
                      onChange={(e) => updateExercise(di, bi, ei, { rest: e.target.value || null })}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
          <button
            type="button"
            className="font-mono text-xs font-bold uppercase tracking-wide text-ink/60 hover:text-ink"
            onClick={() => addExercise(di)}
          >
            + lift
          </button>
        </div>
      ))}
      <button
        type="button"
        className="font-mono text-xs font-bold uppercase tracking-wide text-ink/60 hover:text-ink"
        onClick={addDay}
      >
        + training day
      </button>
    </div>
  );
}
