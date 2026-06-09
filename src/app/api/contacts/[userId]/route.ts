import { NextResponse } from "next/server";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { withOutbox } from "@/lib/outbox";
import { assertCanModify, HttpError, requireUser } from "@/lib/session";
import { contactCardInput } from "@/modules/contacts/schema";

type Ctx = { params: { userId: string } };

// Upsert a member's contact card (self or admin). Related parties are
// replaced wholesale — simplest correct semantics for a small list.
export const PUT = apiHandler(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  assertCanModify(user, params.userId);
  const target = await db.user.findUnique({ where: { id: params.userId } });
  if (!target) throw new HttpError(404, "Member not found.");

  const data = await parseBody(req, contactCardInput);
  const relatedParties = data.relatedParties ?? [];
  const fields = {
    phone: data.phone ?? null,
    email: data.email ?? null,
    birthday: data.birthday ? new Date(`${data.birthday}T00:00:00Z`) : null,
    address: data.address ?? null,
    notes: data.notes ?? null,
  };

  const card = await withOutbox(
    async (tx) => {
      const card = await tx.contactCard.upsert({
        where: { userId: target.id },
        create: { userId: target.id, ...fields },
        update: fields,
      });
      await tx.relatedParty.deleteMany({ where: { cardId: card.userId } });
      if (relatedParties.length > 0) {
        await tx.relatedParty.createMany({
          data: relatedParties.map((p) => ({
            cardId: card.userId,
            name: p.name,
            relation: p.relation ?? null,
            phone: p.phone ?? null,
            email: p.email ?? null,
          })),
        });
      }
      return card;
    },
    () => ({
      type: "contact.updated",
      payload: { userId: target.id, updatedBy: user.id },
    })
  );

  return NextResponse.json({ card });
});
