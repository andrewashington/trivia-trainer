import { NextResponse } from "next/server";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { withOutbox } from "@/lib/outbox";
import { requireUser } from "@/lib/session";
import { computeArchetype } from "@/modules/thekey/archetypes";
import { buildKeyCode } from "@/modules/thekey/keycode";
import { keyInput, type KeyAnswers } from "@/modules/thekey/schema";

export const GET = apiHandler(async () => {
  const user = await requireUser();
  const mine = await db.keySubmission.findUnique({ where: { userId: user.id } });
  return NextResponse.json({ submission: mine });
});

export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  // parseBody's generic flattens zod's input/output split, so re-assert
  // the post-default output type.
  const data = (await parseBody(req, keyInput)) as KeyAnswers;

  const previous = await db.keySubmission.findUnique({ where: { userId: user.id } });

  // The payoff is computed here — never accepted from the client.
  const archetype = computeArchetype(data);

  const fields = {
    unitPreference: "imperial",
    lengthMm: data.lengthMm ?? null,
    girthMm: data.girthMm ?? null,
    glansShape: data.glansShape ?? null,
    shaftProfile: data.shaftProfile ?? null,
    foreskinStatus: data.foreskinStatus ?? null,
    pubicHair: data.pubicHair ?? null,
    veinVisibility: data.veinVisibility ?? null,
    curveVertical: data.curveVertical ?? null,
    curveLateral: data.curveLateral ?? null,
    curveIntensity: data.curveIntensity ?? null,
    // Raw answers never leave your row. `visibility` only governs the
    // encoded key string on your profile — "group" shows it, "concealed"
    // hides even that.
    visibility: data.visibility,
    archetypeId: archetype.id,
    archetypeLabel: archetype.label,
    archetypeBlurb: archetype.blurb,
  };

  if (previous) {
    // Edits are silent: no event, no coins, no trace anywhere.
    await db.keySubmission.update({ where: { userId: user.id }, data: fields });
  } else {
    // First filing emits exactly one trait-free event — it never reaches
    // the activity feed or Discord (neither maps key.*); it exists only
    // so the coin rule can pay the one-time bounty.
    await withOutbox(
      (tx) => tx.keySubmission.create({ data: { userId: user.id, ...fields } }),
      () => ({ type: "key.submitted", payload: { userId: user.id } })
    );
  }

  return NextResponse.json(
    {
      archetype: { label: archetype.label, blurb: archetype.blurb },
      keyCode: buildKeyCode(fields),
      bounty: previous ? 0 : 500,
    },
    { status: previous ? 200 : 201 }
  );
});

export const DELETE = apiHandler(async () => {
  const user = await requireUser();
  await db.keySubmission.deleteMany({ where: { userId: user.id } });
  return NextResponse.json({ ok: true });
});
