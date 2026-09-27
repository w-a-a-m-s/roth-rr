import type { DefaultSession } from "next-auth";
import type { ToolRegistration, UserLegal } from "../server/users";

export type SessionImpersonation = {
  active: true;
  realUserId: string;
  realEmail: string | null;
  realName: string | null;
};

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      legal?: UserLegal;
      tools?: Record<string, ToolRegistration>;
      /** True only for the real signed-in user, never while impersonating. */
      superAdmin?: boolean;
    } & DefaultSession["user"];
    /** Present when a superAdmin is viewing the app as another user. */
    impersonation?: SessionImpersonation | null;
  }

  interface User {
    legal?: UserLegal;
    tools?: Record<string, ToolRegistration>;
    superAdmin?: boolean;
  }
}

export {};
