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

### 1.1 Signing in with Internet Identity

Valthoris authenticates its users with Internet Identity, so the browser holds
no Supabase session: `auth.users` is empty, `auth.uid()` is NULL and every
administrative check that depends on it recognises nobody. `admin-icp-bridge`
is what turns an Internet Identity session into a real Supabase one:

```
/admin/login ──▶ POST /admin-icp-bridge/challenge      short-lived, HMAC-signed
             ──▶ sign it with the Internet Identity session key
             ──▶ POST /admin-icp-bridge/session        challenge + signature + delegation chain
                    │
                    ├─ delegation chain verified against the IC root key
                    │  (canister signature of the Internet Identity canister,
                    │   BLS certificate, subnet delegation, canister ranges)
                    ├─ principal *derived* from the verified chain
                    ├─ matched against governance.admins.icp_principal
                    └─ one-time token ──▶ supabase.auth.verifyOtp() ──▶ real session
             ──▶ TOTP (AAL2) exactly as before
```

What is never trusted is the principal in the request body: a principal is
public information, printed on screen by the application itself, so accepting
one as sent would be a username with no password. Only the chain proves
ownership, and the freshly signed challenge proves the browser still holds the
session key.

An administrator whose principal is not on file yet binds it themselves, once,
from an already-verified session (`/admin` → *Associar Internet Identity*,
`POST /admin-icp-bridge/claim`). An existing binding is never replaced silently
and both outcomes are audited (`ADMIN_ICP_SIGN_IN`, `ADMIN_ICP_CLAIM`).

The "Administração" entry appears in the ordinary application's sidebar only
once such a session exists **and** `admin-api` has confirmed it — never from a
principal or an e-mail compared inside the bundle.

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

The AI Assistant follows the same rule and now feeds the same table: when an
external intelligence source fails, the user still reads the single generic
sentence, while `governance.error_logs` receives one `ai-chat/intel` entry with
the provider, the lookup, the HTTP status (401 credential, 403 blocked, 404
retired endpoint, 429 quota, timeout) and the timestamp. `/admin/intel-sources`
reads that state and can re-test any source on demand. No credential, URL or
request body is ever recorded.

---

## 5. Provisioning the Supabase project

None of this is done by hand. `.github/workflows/provision-supabase.yml` runs on
every push to `main` (and on demand) and performs the whole set-up through the
Supabase CLI and the Management API. A security boundary that depends on
somebody remembering to click in a dashboard is not a security boundary.

| # | What the workflow does | How |
|---|---|---|
| 1 | Applies every migration, including the `governance` schema | `supabase db push --include-all`, or the Management API when `SUPABASE_DB_PASSWORD` is absent |
| 2 | Reads the database back and fails unless every migration file is recorded and every `public.governance_*` RPC exists | `SELECT` through the Management API |
| 3 | Enables TOTP MFA enrolment and verification | `PATCH /v1/projects/{ref}/config/auth` |
| 4 | Enables the *Customize Access Token* hook on `governance.custom_access_token_admin_hook` | same call |
| 5 | Removes `governance` from the exposed schemas if it is ever added | `GET`/`PATCH /v1/projects/{ref}/postgrest` |
| 6 | Invites the two ROOT accounts, if they do not exist yet | Auth Admin API `POST /auth/v1/invite` |
| 7 | Publishes `ADMIN_ALLOWED_ORIGINS` as a function secret | `supabase secrets set` |
| 8 | Proves an anonymous caller gets no administrative data, and that a bare principal does not open a session | four `curl` probes, the job fails otherwise |

Before any of that, the workflow checks that `SUPABASE_PROJECT_REF` is the
project this repository is linked to (`supabase/.temp/linked-project.json`) and
stops if it is not: the reference is a secret, so a run that provisioned the
wrong database would otherwise look exactly like a run that worked.

`admin-api` and `admin-icp-bridge` are deployed by
`.github/workflows/deploy-edge-functions.yml`, which runs their unit tests first.

`admin-icp-bridge` is the one administrative function with
`verify_jwt = false`: it is called *before* any Supabase session exists, because
creating that session is its purpose. It authorises by cryptography instead —
an Internet Identity delegation chain verified against the Internet Computer
root key — and answers everybody else with the same opaque `404`. Optional
function secrets: `ADMIN_ICP_BRIDGE_SECRET` (challenge signing key),
`II_CANISTER_ID` and `IC_ROOT_KEY_HEX` (only for a local replica).

### 5.1 Repository secrets the workflow needs

| Secret | Required | Used for |
|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | yes | CLI + Management API |
| `SUPABASE_PROJECT_REF` | yes | which project to act on |
| `SUPABASE_DB_PASSWORD` | no | pushing migrations with the CLI; without it the same files are applied through the Management API and recorded in `supabase_migrations.schema_migrations` |
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

### 5.5 A `governance` schema that came from somewhere else

`20260901000000_create_governance_admin_center.sql` starts by checking whether
the project already carries a *different* `governance` schema — one whose
`audit_logs` has no `occurred_at` column. That happened once in production: a
draft of the administration had been applied out of band, so every
`CREATE TABLE IF NOT EXISTS` in the migration did nothing, the first index on a
column only this design has failed, and the migration never reached
`supabase_migrations.schema_migrations` — taking the two migrations after it,
and therefore `admin-icp-bridge`, down with it.

When that is detected the foreign schema is renamed to
`governance_archived_<UTC timestamp>` (no row is deleted, and no API role can
reach it), the `public.governance_*` wrappers compiled against it are dropped,
and the administration is rebuilt from this repository. The repository is the
single source of truth for the schema; the check is inert on a database that
already carries this design.

### 5.6 A refused Internet Identity sign-in

`admin-icp-bridge` answers **every** refusal with `404 Not found`: telling the
browser *why* a delegation was rejected would tell an attacker how to fix it.
The reason is written server-side instead, to `governance.audit_logs.reason` of
the `ADMIN_ICP_SIGN_IN` / `ADMIN_ICP_CLAIM` row:

```sql
select occurred_at, action, result, reason
from governance.audit_logs
where action in ('ADMIN_ICP_SIGN_IN', 'ADMIN_ICP_CLAIM') and result = 'DENIED'
order by occurred_at desc
limit 20;
```

The reason names the step that gave up, for example
`A delegation signature is not valid. Link 1 of 2, signed by a canister-signature
key: the chain was issued by canister <x>, not by rdmx6-jaaaa-aaaaa-aaadq-cai.`
That particular one means the browser signed in against a *different* Internet
Identity — a local replica, or an `II_CANISTER_ID` secret that does not match the
`VITE_INTERNET_IDENTITY_CANISTER_ID` the frontend was built with. Others name a
certificate the IC root key rejects (`IC_ROOT_KEY_HEX` wrong or truncated), a key
algorithm the bridge does not support, or a session key that did not sign the
challenge.

### 5.7 What still cannot be automated

Enrolling a TOTP factor requires the physical authenticator of each ROOT and is
therefore done by Hermínio and Tiago themselves, at their first sign-in on
`/admin/login`. Nothing else in this section requires human action.

---

## 6. What Phase 1 delivers

| Route | Content |
| --- | --- |
| `/admin/login` | Internet Identity **or** password, then TOTP enrolment / verification |
| `/admin` | Dashboard: users, administration, audit, errors |
| `/admin/administrators` | Administrator register, roles, MFA, last access |
| `/admin/roles` | RBAC model read from the database |
| `/admin/audit` | Paginated, searchable, filterable audit trail |
| `/admin/intel-sources` | State of every external intelligence source (✅ operational / ⚠️ degraded / ➖ not configured / ⊘ disabled), last error with its HTTP status, and a **test now** button that performs a real lookup. Requires `system_health.read` |
| `/admin/statistics` | Statistics: live counts read from the tables that exist, and nothing else. Requires `dashboard.read` |
| `/admin/fraud-reports` | Fraud reports: submission form (`reports.write`) and a filterable, paginated list (`reports.read`) |
| `/admin/fraud-map` | Map of the reports that carry coordinates; the ones without a location are counted apart. Requires `reports.read` |
| `/admin/blacklist` | Blacklist by category (IP / phone / e-mail / crypto / IBAN / domain / other), with an add form and CSV / JSON bulk import. Requires `blacklist.read`, `blacklist.write` to write |
| `/admin/users` | Administrators and platform accounts side by side. Requires `users.read` |
| `/admin/reputation` | Reputation of an entity: current score and its history. Requires `reputation.read`, `reputation.write` to score |
| `/admin/threat-intelligence` | Indicators aggregated by type (phone scam, phishing, fraudulent URL, malicious IP, suspicious domain, crypto fraud, suspicious IBAN, romance scam). Requires `threat_intel.read` |
| `/admin/monitoring` | Global monitoring: recent audit and error events, with the last 24 hours counted. Requires `audit.read` |
| other `/admin/*` | Route, permission and navigation already in place; data connected in the phase shown on the page |

Every section above reads only from this project's Supabase, through
`public.governance_*` and the `admin-api` Edge Function. A section with no rows
yet shows an empty state — never an invented number.

The legacy Internet Identity operations console moved from `/admin` to
`/operations` (`/operations/users`), unchanged in behaviour, because `/admin` now
belongs to an area with a different identity model.

---

## 7. Build order for the next phases

Statistics, fraud reports, the report map, the blacklist, users, reputation,
threat intelligence and global monitoring are done (section 6). What remains:

`PLANS → USAGE → BILLING → DATA INGESTION → INTELLIGENCE MODULES →
AUTOSHIELD ADMIN → MULTIMEDIA / CONVERSATION / API CENTER → COMPLIANCE,
AUTHORITY VIEW, REPORTS, SYSTEM HEALTH, SUPPORT, FEATURE FLAGS, VERSIONING,
BUSINESS`

Each phase replaces one placeholder page, adds its tables to the appropriate
domain and keeps the application compiling and functional.
