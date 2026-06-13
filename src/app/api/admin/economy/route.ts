import { NextResponse } from "next/server";
import { apiHandler, parseBody } from "@/lib/api";
import { getConfig, setConfig } from "@/lib/appConfig";
import { requireAdmin } from "@/lib/session";
import { KNOB_REGISTRY } from "@/modules/admin/knobs";
import { knobsPut } from "@/modules/admin/schema";

type KnobTree = Record<string, Record<string, unknown>>;

/** GET /api/admin/economy — knob registry + current overrides. */
export const GET = apiHandler(async () => {
  await requireAdmin();
  const overrides = (await getConfig<KnobTree>("knobs")) ?? {};
  return NextResponse.json({ registry: KNOB_REGISTRY, overrides });
});

/** PUT /api/admin/economy — replace one game's overrides (stores only diffs). */
export const PUT = apiHandler(async (req: Request) => {
  await requireAdmin();
  const { game, values } = await parseBody(req, knobsPut);

  const group = KNOB_REGISTRY.find((g) => g.key === game);
  const tree = (await getConfig<KnobTree>("knobs")) ?? {};

  // Keep only values that differ from the code default — clearing back to the
  // default drops the key, so the override document stays minimal.
  const diffs: Record<string, number | boolean> = {};
  if (group) {
    for (const k of group.knobs) {
      const v = values[k.id];
      if ((typeof v === "number" || typeof v === "boolean") && v !== k.default) {
        diffs[k.id] = v;
      }
    }
  }
  if (Object.keys(diffs).length) tree[game] = diffs;
  else delete tree[game];

  await setConfig("knobs", tree);
  return NextResponse.json({ ok: true });
});
