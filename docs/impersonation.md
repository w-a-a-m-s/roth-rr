# SuperAdmin impersonation

## Request

Support staff need a way to inspect (and fix) another user's Roth calculator plans without granting a global "see all plans" capability.

### Decisions

| Topic | Choice |
| --- | --- |
| Model | Impersonate a single user (login-as), not list-all-plans |
| Granting access | Manual Mongo flag `superAdmin: true` on the auth user (no admin UI) |
| Mutating plans while impersonating | Fully editable: the admin acts exactly as the user |
| Ending impersonation | Full sign-out only (no Exit button); the cookie also self-expires |
| State storage | Signed httpOnly cookie, never the DB |
| Audit log | None |
| Why not "all plans" | Smaller blast radius; plan APIs stay membership-scoped; one user context at a time |

### Out of scope (for now)

- Nested impersonation or impersonating another superAdmin via UI
- Audit trail of who viewed whom

---

## Implementation

### Data model

The only persistent field is `superAdmin: boolean` on the auth user (manual grant):

```js
db.users.updateOne(
  { email: "you@example.com" },
  { $set: { superAdmin: true } },
);
```

Sign out and back in after setting the flag so the session reloads it.

Active impersonation is **not stored in the DB**. It lives in a signed,
short-lived httpOnly cookie (`wl.impersonate`, `__Secure-` prefixed in
production; `path=/`, 2h max age).

### Why a cookie, not Mongo

An earlier version stored `impersonatingUserId` on the admin's user document.
That put ephemeral, browser-scoped state in durable, account-scoped data:
impersonation leaked across the admin's devices, could get stuck until the
next sign-in, and needed cleanup hacks in the `signIn` event.

The cookie rides on the same mechanics as the Auth.js session cookie (same
domain, `path=/`). Auth.js and the calculator are the same app, so the
cookie is visible to both.

### Cookie token

`adminId.targetId.sessionHash.exp.sig`, HMAC-SHA256 signed with `AUTH_SECRET`
(`src/lib/auth/server/impersonate.ts`). Verification requires all of:

1. Valid signature and unexpired `exp`
2. `adminId` equals the signed-in user's id
3. `sessionHash` matches the **current Auth.js session token**, so a full
   sign-out invalidates the cookie even if it is never cleared (a new session
   gets a new token)
4. The admin's user doc still has `superAdmin: true` (checked in the session
   callback before the swap)

### Session shape

When not impersonating and the signed-in user is a superAdmin:

```ts
session.user.superAdmin === true
session.impersonation == null
```

When impersonating:

```ts
session.user        // target user (id, email, name, legal, tools, …)
session.user.superAdmin === false   // never inherited
session.impersonation = {
  active: true,
  realUserId,   // admin
  realEmail,
  realName,
}
```

Built in `src/lib/auth/server/auth.ts` session callback: if the session owner is a
superAdmin and a valid impersonation cookie is present, load the target and
swap `session.user`.

### APIs

Routes live on this app. They must stay same-origin with the browser so
Set-Cookie hits this host:

| Method | Path | Action |
| --- | --- | --- |
| `GET` | `/api/impersonate/users` | List users for the picker |
| `POST` | `/api/impersonate` | Body `{ userId }`: start (sets the cookie) |

There is no stop endpoint.

Every call re-loads the **real** user (`session.impersonation.realUserId` or
`session.user.id`) from Mongo and requires `superAdmin === true`; the session
flag alone is never trusted.

### UI (Roth calculator)

- **Account menu → "View as user…":** only if `session.user.superAdmin` and
  not already impersonating (`ImpersonateMenu.tsx`)
- **Banner:** "Viewing as … (signed in as …). Edits are live. Sign out to
  return to your own account." (`ImpersonationBanner.tsx`); no Exit button
- While impersonating the app is **fully editable** (create / edit / duplicate
  / delete, autosave, and everything acts as the target user). Still special:
  skip first-run and profile-name modals; do not claim pre-login drafts into
  the target account; skip legal re-accept sign-out for the target
  (`AuthSync.tsx`, `page.tsx`, `useScenario.ts` hydrate)

### Lifecycle

```
Admin (superAdmin) signs in
  → Account → View as user… → POST { userId } → Set-Cookie (signed, 2h)
  → session refetch: app acts as the target with full edit access
  → ends on: sign-out (session token changes, cookie no longer verifies)
              or cookie expiry (2h)
```

### Security notes

- `superAdmin` and start are always re-checked against the user record
- Target session never gets `superAdmin: true`
- Cookie is bound to the admin's session token: it cannot outlive the session,
  be replayed on another session, or be forged without `AUTH_SECRET`
- No new "list every plan" API; access is still "plans this userId can see"
- Writes while impersonating are **intentional and unrestricted** (support
  edits on behalf of the user); there is no read-only mode
- No audit log (by request)

### Key files

| Area | Path |
| --- | --- |
| Cookie sign/verify + session swap | `src/lib/auth/server/impersonate.ts`, `src/lib/auth/server/auth.ts` |
| Types | `src/lib/auth/server/next-auth.d.ts`, `src/lib/auth/server/users.ts` |
| Calculator API | `src/app/api/impersonate/` |
| Client fetch | `src/lib/impersonate.ts` |
| UI | `src/components/ImpersonateMenu.tsx`, `ImpersonationBanner.tsx` |
| Auth bridge | `src/components/AuthSync.tsx`, `src/store/useScenario.ts` |
