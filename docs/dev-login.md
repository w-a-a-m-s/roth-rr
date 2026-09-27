# Local IDE login

The Cursor browser is a separate cookie jar from Chrome. It cannot finish
Google OAuth or click a magic-link email, and CDP cookie injection is
blocked. This URL mints a real Auth.js session so the IDE can open signed-in
UI.

## How to use it

The Roth app must be running (`npm run dev`, `http://localhost:3000`).

```
http://localhost:3000/api/dev/login?email=you@example.com
http://localhost:3000/api/dev/login?email=you@example.com&next=/
```

`email` is required and must match `DEV_LOGIN_EMAIL` in `.env`.
Then you land in the calculator as that user. Open `/{planId}` if you have
an id. If that account is a superAdmin, **View as user…** is the second hop
for someone else's plan.

Writes are live, same as a normal sign-in. Do not invent another login path.

## Gates (all fail as 404)

The route does not advertise itself. Any miss returns an empty 404.

1. `NODE_ENV === "development"` (`next start` and Vercel never serve it)
2. Request hostname is `localhost` or `127.0.0.1`
3. `email` query is present and equals `DEV_LOGIN_EMAIL` (trim, case-insensitive)
4. That user already exists in the `users` collection

Cookie: `authjs.session-token`, `httpOnly`, `sameSite=lax`, `path=/`.

`next` must resolve onto an allowed origin (`AUTH_URL`,
`AUTH_ALLOWED_ORIGINS`, this app). Anything else falls back to
`http://localhost:3000` in development, or the canonical site in production.

## Key files

| Area | Path |
| ---- | ---- |
| Gates (no I/O) | `src/lib/auth/server/devLoginGates.ts` |
| Session insert + cookie | `src/lib/auth/server/devLogin.ts` |
| Route | `src/app/api/dev/login/route.ts` |
