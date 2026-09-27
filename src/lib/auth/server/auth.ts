import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Nodemailer from "next-auth/providers/nodemailer";
import { MongoDBAdapter } from "@auth/mongodb-adapter";
import { cookies } from "next/headers";
import {
  PRIVACY_VERSION,
  TERMS_VERSION,
} from "@/lib/common/legal";
import { CANONICAL_SITE_URL } from "@/lib/common/site";
import { getClientPromise, resolveRothDbName } from "@/lib/db/connection";
import { notifyNewRegistration, sendVerificationRequest } from "./mail";
import {
  markSignupAttemptCompleted,
  noteMagicLinkSignupAttempt,
} from "./signupAttempts";
import {
  getImpersonationTargetId,
  getUserForImpersonation,
  isSuperAdminUser,
  sessionTokenCookieName,
} from "./impersonate";
import { AUTH_ERROR_PATH } from "../shared/constants";
import {
  AUTH_TOOL_COOKIE,
  acceptLegal,
  recordToolLogin,
  type RothUserFields,
} from "./users";
import { ensureAccessOnSignIn } from "./invites";
import type {} from "./next-auth";

/**
 * Auth.js `baseUrl` follows AUTH_URL. Preview/production Vercel projects often
 * set that to *.vercel.app even when users hit the custom domain, which turns
 * relative callbackUrls (e.g. signOut → `/`) into the wrong host.
 */
function resolveAuthBaseUrl(baseUrl: string): string {
  if (process.env.NODE_ENV === "development") return baseUrl;
  try {
    if (new URL(baseUrl).hostname.endsWith(".vercel.app")) {
      return CANONICAL_SITE_URL;
    }
  } catch {
    // fall through
  }
  return baseUrl;
}

function allowedRedirectOrigins(baseOrigin: string): Set<string> {
  const allowed = new Set<string>([baseOrigin, CANONICAL_SITE_URL]);
  for (const origin of (process.env.AUTH_ALLOWED_ORIGINS ?? "").split(",")) {
    const trimmed = origin.trim();
    if (trimmed) allowed.add(trimmed);
  }
  return allowed;
}

type SessionUser = {
  id?: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  superAdmin?: boolean;
} & RothUserFields;

/** Tool id from the pre-sign-in cookie; defaults to roth. */
async function resolveSignInToolId(): Promise<string> {
  try {
    const jar = await cookies();
    return jar.get(AUTH_TOOL_COOKIE)?.value || "roth";
  } catch {
    // cookies() unavailable outside a request context
    return "roth";
  }
}

/**
 * Shared Auth.js config for Roth RR.
 *
 * Mount `handlers` on the Roth app (`/api/auth/[...nextauth]`).
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: MongoDBAdapter(() => getClientPromise(), {
    databaseName: resolveRothDbName(),
  }),
  session: { strategy: "database" },
  pages: {
    error: AUTH_ERROR_PATH,
  },
  cookies: {
    sessionToken: {
      name: sessionTokenCookieName(),
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
  providers: [
    // Same verified email = same user either direction:
    // - Magic link first, then Google: needs this opt-in (OAuth would otherwise
    //   throw OAuthAccountNotLinked).
    // - Google first, then magic link: Auth.js email flow already resolves the
    //   existing user by email; Nodemailer has no linking flag to set.
    Google({
      allowDangerousEmailAccountLinking: true,
    }),
    Nodemailer({
      // Auth.js requires `server`; sending uses Mailgun HTTP via sendVerificationRequest.
      server: { host: "localhost", port: 587, auth: { user: "", pass: "" } },
      from: process.env.EMAIL_FROM,
      sendVerificationRequest: async (params) => {
        await sendVerificationRequest(params);
        await noteMagicLinkSignupAttempt(params.identifier);
      },
    }),
  ],
  callbacks: {
    async session({ session, user }) {
      if (!session.user) return session;

      const sessionUser = session.user as SessionUser;
      const fields = user as typeof user & RothUserFields;
      const admin = isSuperAdminUser(fields);

      // Impersonation lives in a signed cookie bound to this session token.
      if (admin) {
        const targetId = await getImpersonationTargetId(user.id);
        if (targetId) {
          const target = await getUserForImpersonation(targetId);
          if (target) {
            sessionUser.id = target.id;
            sessionUser.email = target.email;
            sessionUser.name = target.name;
            sessionUser.image = target.image;
            sessionUser.legal = target.legal;
            sessionUser.tools = target.tools;
            sessionUser.superAdmin = false;
            session.impersonation = {
              active: true,
              realUserId: user.id,
              realEmail: user.email ?? null,
              realName: user.name ?? null,
            };
            return session;
          }
        }
      }

      sessionUser.id = user.id;
      sessionUser.legal = fields.legal;
      sessionUser.tools = fields.tools;
      sessionUser.superAdmin = admin;
      session.impersonation = null;
      return session;
    },
    async redirect({ url, baseUrl }) {
      const resolvedBase = resolveAuthBaseUrl(baseUrl);
      if (url.startsWith("/")) return `${resolvedBase}${url}`;
      try {
        const target = new URL(url);
        const allowed = allowedRedirectOrigins(new URL(resolvedBase).origin);
        if (allowed.has(target.origin)) return url;
      } catch {
        // fall through
      }
      return resolvedBase;
    },
  },
  events: {
    async createUser({ user }) {
      if (user.id) {
        try {
          await ensureAccessOnSignIn({
            userId: user.id,
            email: user.email,
            isNewUser: true,
          });
        } catch (err) {
          console.error("Failed to claim access on createUser:", err);
        }
      }
      const toolId = await resolveSignInToolId();
      await markSignupAttemptCompleted(user.email);
      await notifyNewRegistration({
        name: user.name,
        email: user.email,
        toolId,
      });
    },
    async signIn({ user, isNewUser }) {
      const distinctId = user.id != null ? String(user.id) : "";
      if (!distinctId) return;
      // createUser already ran ensureAccess for brand-new accounts.
      if (!isNewUser) {
        await ensureAccessOnSignIn({
          userId: distinctId,
          email: user.email,
          isNewUser: false,
        });
      }
      await acceptLegal(distinctId, TERMS_VERSION, PRIVACY_VERSION);
      const toolId = await resolveSignInToolId();
      await recordToolLogin(distinctId, toolId);
    },
  },
});
