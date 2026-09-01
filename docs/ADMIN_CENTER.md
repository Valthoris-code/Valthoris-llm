# Valthoris — Administration & Governance Center

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

## 5. Provisioning the Supabase project

None of this is done by hand. `.github/workflows/provision-supabase.yml` runs on
every push to `main` (and on demand) and performs the whole set-up through the
Supabase CLI and the Management API. A security boundary that depends on
somebody remembering to click in a dashboard is not a security boundary.

| # | What the workflow does | How |
|---|---|---|
| 1 | Applies every migration, including the `governance` schema | `supabase db push --include-all` |
| 2 | Enables TOTP MFA enrolment and verification | `PATCH /v1/projects/{ref}/config/auth` |
| 3 | Enables the *Customize Access Token* hook on `governance.custom_access_token_admin_hook` | same call |
| 4 | Removes `governance` from the exposed schemas if it is ever added | `GET`/`PATCH /v1/projects/{ref}/postgrest` |
| 5 | Invites the two ROOT accounts, if they do not exist yet | Auth Admin API `POST /auth/v1/invite` |
| 6 | Publishes `ADMIN_ALLOWED_ORIGINS` as a function secret | `supabase secrets set` |
| 7 | Proves an anonymous caller gets no administrative data | three `curl` probes, the job fails otherwise |

`admin-api` itself is deployed by `.github/workflows/deploy-edge-functions.yml`,
which also runs its unit tests first.

### 5.1 Repository secrets the workflow needs

| Secret | Required | Used for |
|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | yes | CLI + Management API |
| `SUPABASE_PROJECT_REF` | yes | which project to act on |
| `SUPABASE_DB_PASSWORD` | yes | pushing migrations |
| `SUPABASE_SERVICE_ROLE_KEY` | no | inviting the ROOT accounts |
| `ADMIN_ALLOWED_ORIGINS` | no | extra browser origins for `admin-api` |
| `SUPABASE_ANON_KEY` *or* `VITE_SUPABASE_ANON_KEY` | no | the anonymous-access probes |

When an optional secret is absent the workflow emits a warning and carries on;
when a required one is absent it fails loudly instead of pretending to have
provisioned anything.

### 5.2 The ROOT accounts

The rows in `governance.admins` are created by the migration and are permanent.
The Supabase Auth accounts are *invited*, never created with a password: no
administrator credential is ever generated by, stored in, or printed by CI.

The trigger installed by `20260901010000_governance_auth_binding.sql` binds
`auth.users.id` to the matching `governance.admins` row (by lowercased email)
the moment the account exists, and releases it if the address ever changes. An
account whose email is not already an administrator is ignored — signing up is
not a route into the administration.

### 5.3 MFA

TOTP is enabled by step 2. On the first sign-in each ROOT is shown a QR code,
scans it with an authenticator app and confirms with a 6-digit code; afterwards
the code is requested at every sign-in. Until a factor is enrolled the session
stays at AAL1, `governance.current_admin_id()` returns NULL and the
administration is empty — by design.

### 5.4 CORS

`admin-api` answers only to `https://valthoris.com` and
`https://www.valthoris.com`. Any additional origin (a preview deployment, a
local `vite preview`) must be listed in the `ADMIN_ALLOWED_ORIGINS` secret as a
comma-separated list, e.g. `http://localhost:4173`.

### 5.5 What still cannot be automated

Enrolling a TOTP factor requires the physical authenticator of each ROOT and is
therefore done by Hermínio and Tiago themselves, at their first sign-in on
`/admin/login`. Nothing else in this section requires human action.

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
