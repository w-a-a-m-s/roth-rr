import { handlers } from "@/lib/auth/server";

export const runtime = "nodejs";

// NextAuth handler types don't line up with the App Router route signature.
type AuthRoute = (
  req: Request,
  ctx: { params: Promise<{ nextauth: string[] }> },
) => Promise<Response>;

export const GET = handlers.GET as unknown as AuthRoute;
export const POST = handlers.POST as unknown as AuthRoute;
