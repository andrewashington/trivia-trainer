import NextAuth from "next-auth";
import type { Adapter, AdapterUser } from "next-auth/adapters";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { User as DbUser } from "@prisma/client";
import { db } from "@/lib/db";
import { sendMagicLink } from "@/lib/email";

/**
 * Auth.js expects `name`/`image` on users; our domain model (per the
 * build brief) uses `displayName`/`avatarUrl`. This adapter wraps the
 * stock Prisma adapter and translates user records at the boundary so
 * the rest of the app only ever sees the domain shape.
 */
function toAdapterUser(user: DbUser): AdapterUser {
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerified,
    name: user.displayName,
    image: user.avatarUrl,
  };
}

function domainAdapter(): Adapter {
  const base = PrismaAdapter(db) as Adapter;
  return {
    ...base,
    // Membership is allowlist-only: sign-in must never create a user.
    // The signIn callback blocks unknown emails before this is reached,
    // but fail closed here too.
    async createUser() {
      throw new Error("Sign-ups are closed. Members are added by an admin.");
    },
    async getUser(id) {
      const user = await db.user.findUnique({ where: { id } });
      return user ? toAdapterUser(user) : null;
    },
    async getUserByEmail(email) {
      const user = await db.user.findUnique({ where: { email } });
      return user ? toAdapterUser(user) : null;
    },
    async getUserByAccount(providerAccountId) {
      const account = await db.account.findUnique({
        where: { provider_providerAccountId: providerAccountId },
        include: { user: true },
      });
      return account ? toAdapterUser(account.user) : null;
    },
    async updateUser({ id, emailVerified }) {
      const user = await db.user.update({
        where: { id },
        data: { emailVerified },
      });
      return toAdapterUser(user);
    },
    async getSessionAndUser(sessionToken) {
      const result = await db.session.findUnique({
        where: { sessionToken },
        include: { user: true },
      });
      if (!result) return null;
      const { user, ...session } = result;
      return { session, user: toAdapterUser(user) };
    },
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: domainAdapter(),
  session: { strategy: "database" },
  trustHost: true,
  pages: {
    signIn: "/signin",
    verifyRequest: "/signin/sent",
    error: "/signin/error",
  },
  providers: [
    {
      id: "email",
      type: "email",
      name: "Email",
      from: process.env.EMAIL_FROM ?? "UDM+ <login@localhost>",
      server: {},
      maxAge: 60 * 15,
      options: {},
      async sendVerificationRequest({ identifier, url }) {
        await sendMagicLink(identifier, url);
      },
    },
  ],
  callbacks: {
    // THE allowlist gate. Runs both when a link is requested and when it
    // is consumed; unknown emails get no email and no session.
    async signIn({ user }) {
      if (!user.email) return false;
      const existing = await db.user.findUnique({
        where: { email: user.email },
      });
      return existing !== null;
    },
    async session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
});
