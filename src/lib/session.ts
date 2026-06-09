import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import type { User } from "@prisma/client";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

/** Resolve the signed-in domain user, or null. */
export async function currentUser(): Promise<User | null> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  return db.user.findUnique({ where: { id } });
}

/** For API routes: 401 if not signed in (and allowlisted). */
export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) throw new HttpError(401, "Sign in required.");
  return user;
}

/** For admin routes: 403 unless role is admin. */
export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "admin") throw new HttpError(403, "Admins only.");
  return user;
}

/** Ownership-or-admin: the server-side rule for every mutation. */
export function assertCanModify(user: User, ownerId: string) {
  if (user.id !== ownerId && user.role !== "admin") {
    throw new HttpError(403, "You can only modify your own content.");
  }
}
