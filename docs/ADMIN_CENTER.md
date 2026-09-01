# Valthoris — Administration &amp; Governance Center

The administration is a **separate area** of Valthoris, served at `/admin`. It has
its own layout, its own authentication (Supabase Auth + TOTP MFA), its own
database schema (`governance`) and its own backend door (the `admin-api` Edge
Function). The ordinary application is untouched: it keeps authenticating with
Internet Identity, it renders none of the administration and it links to none of
it.

```
Visibility → Control → Evidence → Auditability
```

Every administrative request is recorded as WHO / WHEN / WHAT / TARGET /
PERMISSION / RESULT / EVIDENCE / REQUEST ID.

---

## 1. Who can enter

Exactly two permanent ROOT administrators:

| Name | E-mail | Role |
| --- | --- | --- |
| Hermínio Coragem | `coragem77@gmail.com` | ROOT |
| Tiago Ferro | `tiagoferroregistos@gmail.com` | ROOT |

Both require MFA. The database refuses — for the application *and* for the
service role — any attempt to change a ROOT e-mail, demote, suspend or delete a
ROOT, remove the ROOT role, or create a third ROOT. Those guards are triggers,
not UI rules (`governance.protect_root_admins`,
`governance.protect_root_admin_roles`).

Any other authenticated account sees no administration, cannot open `/admin/*`,
and receives an opaque `404 Not found` from every administrative endpoint. The
login page answers `Credenciais inválidas.` whether the password is wrong, the
address unknown, or the address simply not an administrator — the area never
confirms its own existence.

---

## 2. Two layers of protection

**Frontend** — `src/frontend/src/admin/`

* `AdminAuthContext` resolves: Supabase session → AAL2 (MFA) → `admin-api /session`.
* `AdminRouteGuard` renders `/admin/*` only for `stage === 'authorized'`.
* The sidebar is built from permissions returned by the backend; a section the
  administrator has no permission for is never rendered.

**Backend** — `supabase/functions/admin-api/` and the `governance` schema

```
Request → Authentication → Authorization → Admin identity → RBAC → RLS → Allow / Deny
```

* The gateway verifies the JWT (`verify_jwt = true` in `supabase/config.toml`).
* The function verifies the token again against `GET /auth/v1/user`.
* The session must be `aal2` when the administrator record requires MFA.
* The e-mail / user id is resolved against `governance.admins`.
* The action maps to a permission resolved from `governance.role_permissions`.
* The outcome is written to `governance.audit_logs`.

The `governance` schema is **not** exposed through PostgREST and `anon` holds no
privilege on it. The browser reaches it only through the Edge Function, which
uses `SECURITY DEFINER` wrappers in `public` that only `service_role` may
execute. Knowing the anon key — which is public by design — grants nothing.

---

## 3. RBAC

Roles seeded by the migration: `ROOT`, `SECURITY_ADMIN`, `DATA_ADMIN`,
`SUPPORT_ADMIN`, `BILLING_ADMIN`, `AUDITOR`.

`ROOT` is *implicit-all*: `governance.has_permission()` short-circuits for it, so
it never depends on an enumeration that could drift. Every other role resolves
its permissions from `governance.role_permissions`. Permissions are never
hardcoded in the frontend.

Only the two ROOT accounts exist today; the model is already in place so limited
administrators can be added later without a schema change.

---

## 4. Error handling

Technical failures never reach the browser. The UI shows

> O serviço encontra-se temporariamente indisponível. Tente novamente.

together with an opaque request id, and the real cause (message, stack, path) is
stored in `governance.error_logs`. Stack traces, SQL errors, API keys, tokens and
internal paths are never returned.

---

## 5. Manual steps in the Supabase Dashboard

The migration and the Edge Function cover everything that can be automated. The
following **must be done by hand** — they cannot be performed from this
repository, and nothing here pretends they were:

### 5.1 Apply the migration

`supabase/migrations/20260901000000_create_governance_admin_center.sql`
(`supabase db push`, or the SQL editor). It is idempotent and can be replayed.

### 5.2 Create the two Auth accounts

**Authentication → Users → Add user**, for `coragem77@gmail.com` and
`tiagoferroregistos@gmail.com`, each with a strong password. Their
`governance.admins` rows already exist; the Auth user is bound to the row
automatically on the first successful sign-in.

> Until this is done, `/admin/login` correctly refuses both of them.

### 5.3 Enable MFA (TOTP)

**Authentication → Providers / MFA** → enable **TOTP**. Without it, the first
sign-in cannot enrol a factor, the session never reaches AAL2 and the backend
refuses access — by design.

On the first sign-in each ROOT is shown a QR code, scans it with an authenticator
app and confirms with a 6-digit code. Afterwards the code is requested at every
sign-in.

### 5.4 Enable the Auth Hook (optional but recommended)

**Authentication → Hooks → Customize Access Token** → select
`governance.custom_access_token_admin_hook`.

It adds `is_admin` and `admin_id` claims (no secrets) to the administrative JWT.

**This cannot be enabled from code and has not been enabled.** The
administration works without it — authorization never depends on the claim; the
Edge Function always re-resolves the administrator against the database.

### 5.5 Deploy the Edge Function

Automatic on every push to `main`
(`.github/workflows/deploy-edge-functions.yml`), or manually:

```
supabase functions deploy admin-api --project-ref <ref>
```

### 5.6 Do **not** expose the `governance` schema

**Settings → API → Exposed schemas** must keep listing only `public` (and
whatever was already there). Exposing `governance` would put the administrative
tables behind the anon key, where only RLS would stand between them and the
internet.

---

## 6. What Phase 1 delivers

| Route | Content |
| --- | --- |
| `/admin/login` | Password + TOTP enrolment / verification |
| `/admin` | Dashboard: users, administration, audit, errors |
| `/admin/administrators` | Administrator register, roles, MFA, last access |
| `/admin/roles` | RBAC model read from the database |
| `/admin/audit` | Paginated, searchable, filterable audit trail |
| other `/admin/*` | Route, permission and navigation already in place; data connected in the phase shown on the page |

The legacy Internet Identity operations console moved from `/admin` to
`/operations` (`/operations/users`), unchanged in behaviour, because `/admin` now
belongs to an area with a different identity model.

---

## 7. Build order for the next phases

`USERS → PLANS → USAGE → BILLING → THREAT INTELLIGENCE → DATA INGESTION →
INTELLIGENCE MODULES → AUTOSHIELD ADMIN → MULTIMEDIA / CONVERSATION / API CENTER
→ COMPLIANCE, AUTHORITY VIEW, REPORTS, SYSTEM HEALTH, SUPPORT, FEATURE FLAGS,
VERSIONING, BUSINESS`

Each phase replaces one placeholder page, adds its tables to the appropriate
domain and keeps the application compiling and functional.
