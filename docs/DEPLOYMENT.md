# Deployment — required configuration and commands

This file lists the exact configuration and commands needed to deploy the
current state of the repository. No secret values are stored here; only the
names of the variables that must be provided by the deployment environment.

## 1. Frontend environment (public configuration only)

Provided at build time by Vite (`.env` in `src/frontend/`, or the CI
environment). These are public values — never place a service-role key or an
LLM API key here.

Start from the tracked template:

```bash
cd src/frontend
cp .env.example .env
```

> **Build-time, not run-time.** Vite inlines every `VITE_*` variable into the
> generated bundle during `npm run build`. Exporting or rotating them on the
> host that serves `dist/` has **no effect** — the frontend must be rebuilt
> after any change. A bundle built without `VITE_SUPABASE_URL` /
> `VITE_SUPABASE_ANON_KEY` starts normally but every Supabase-backed feature
> (AI Assistant, waiting list, profiles) fails; the app logs a warning at
> startup explaining exactly this.

| Variable | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL. Also used to reach the `ai-chat` Edge Function. |
| `VITE_SUPABASE_ANON_KEY` | Supabase public anon key. |

### Required GitHub Actions secrets

The Pages deployment (`.github/workflows/deploy.yml`) builds the bundle in CI, so
the Supabase values must also be reachable as **repository** secrets under
*Settings → Secrets and variables → Actions*:

| Repository secret | Used by | Effect when missing |
| --- | --- | --- |
| `VITE_SUPABASE_ANON_KEY` (or `SUPABASE_ANON_KEY`) | `deploy.yml` build, and the `deploy-edge-functions.yml` post-deploy canary | Deployment fails; without the guard the site would publish with a dead backend. The canary is also skipped. |
| `SUPABASE_ACCESS_TOKEN` | `deploy-edge-functions.yml` | Edge Functions cannot be deployed. |
| `SUPABASE_PROJECT_REF` | `deploy-edge-functions.yml`, and `deploy.yml` to derive the project URL | Edge Functions cannot be deployed; the Pages build cannot derive `VITE_SUPABASE_URL`. |
| `VITE_SUPABASE_URL` | `deploy.yml` build | Optional. When absent the build derives `https://<SUPABASE_PROJECT_REF>.supabase.co`; only set it for a project on a custom Supabase domain. |

`deploy.yml` refuses to publish when the Supabase values are absent, and also
verifies that the project URL is actually present inside `dist/assets`. This is
deliberate: a bundle without Supabase configuration boots and looks healthy
while the AI Assistant and the Safe Rooms silently do nothing, which is harder
to diagnose than a failed deployment.

Canister IDs are read from `canister_ids.json` / the dfx-generated `.env`
(`src/frontend/src/services/canisterIds.ts`).

## 2. Supabase Edge Function secrets — `ai-chat`

The AI Assistant calls `supabase/functions/ai-chat`. **Gemini is the only
provider: the function has no OpenAI/Anthropic code path and no failover to
another vendor.** The LLM credentials live only in the function's secret
store and never reach the browser — there is deliberately no `VITE_GEMINI_*`
variable, and the built bundle contains no provider endpoint or key.

| Secret | Required | Default |
| --- | --- | --- |
| `GEMINI_API_KEY` | yes — this is the only key the function reads | — |
| `GEMINI_MODEL` | no (e.g. `gemini-2.5-pro`, `gemini-2.5-flash-lite`) | `gemini-2.5-flash` |

The model name is normalised before the endpoint is built: surrounding
whitespace and the fully-qualified `models/<name>` form are accepted, and a
blank or malformed value falls back to the default. Google retires model names
(`gemini-1.5-flash`, the previous default, is no longer served on `v1beta`),
which surfaced as **"Gemini request failed with HTTP 404"**; when the configured
model answers 404 the function retries on a model that is still served, and if
none is reachable the error names `GEMINI_MODEL` so the secret can be fixed.

If the key is not configured the function returns HTTP 502 with a real error
message naming `GEMINI_API_KEY`, and the assistant displays it instead of an
answer. It never returns a simulated answer. When Google rejects the key the
function answers with that same HTTP status (401/403) and returns Google's own
`error.message`, so an invalid or restricted key is diagnosable from the UI.

### JWT verification

`supabase/config.toml` sets `verify_jwt = false` for `ai-chat` and `safe-room`.
Valthoris authenticates with Internet Identity, so the browser never holds a
Supabase JWT; with the platform default the API gateway rejects the call with
**HTTP 401 before the function runs** — this was the cause of the
"AI backend returned HTTP 401" error. Both functions perform their own
validation (payload limits, room token plus per-participant secret).

## 2b. Supabase Edge Function secrets — `safe-room`

`supabase/functions/safe-room` is the only reader/writer of the Safe Room
tables. It needs no additional secret: `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` are injected by Supabase. Deploy it with:

```bash
supabase functions deploy safe-room
```

Check it from the Administration page (Service status → *Safe Rooms backend*) or
directly:

```bash
curl -s -X POST "https://<project-ref>.supabase.co/functions/v1/safe-room" \
  -H "apikey: <anon key>" -H 'Content-Type: application/json' \
  -d '{"action":"health"}'
```

## 2c. Other platform secrets

These belong to the backend/Edge Function secret store only. They are never
exposed to the browser and no page ever displays a value.

The table below states what the code in this repository actually reads today,
not what is planned. A secret that is configured in the project but that no code
path consumes is listed as such, because reporting it as "in use" would suggest
an integration that does not exist.

| Secret | Read by | Status |
| --- | --- | --- |
| `GEMINI_API_KEY` | `supabase/functions/ai-chat` | **in use** — the assistant and the fraud analysis both call Gemini with it |
| `ABUSEIPDB_API_KEY` | — | **configured, not yet read** — no IP-reputation enrichment is wired up |
| `COINGECKO_API_KEY` | — | **configured, not yet read** — no market/crypto enrichment is wired up |

Keeping the last two configured is harmless and they are ready for the
enrichment services described in `docs/architecture/apis.md`. Until a code path
reads them, no screen claims that AbuseIPDB or CoinGecko data is available, and
nothing fabricates a reputation or a price to stand in for them.

CryptoScamDB, Etherscan, EtherscamDB, OpenCNAM, Nomorobo and WhoCallsMe are
prepared in the threat-intelligence architecture but have **no credentials
configured**; no key is invented for them, and any feature that depends on one
reports the missing configuration instead of fabricating data.

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected into every Edge
Function by Supabase itself. They are what allows `ai-chat` to record real
security analyses in the fraud pipeline (`fraud_events`,
`fraud_workflow_runs`, `fraud_decisions`,
`fraud_decision_justifications`). If they are unavailable, the assistant still
answers but the analysis is not recorded — and the reason is logged and
returned to the browser instead of being hidden.

```bash
supabase secrets set GEMINI_API_KEY=<key>       # the only key ai-chat needs
supabase functions deploy ai-chat
```

The GitHub Actions workflow `.github/workflows/deploy-edge-functions.yml` does
the same automatically on every push that touches `supabase/functions/**`
(secrets: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`). It runs the
function's own test suite first and verifies the deployed endpoint afterwards,
so production can no longer drift away from this repository.

Run the tests locally with:

```bash
deno test --allow-net --allow-env supabase/functions/ai-chat
deno test --allow-net --allow-env supabase/functions/safe-room
```

## 3. Backend services (`src/services`)

Unchanged by this work; see `src/services/src/config/index.ts`. Requires
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and the AI / PGMQ / ICP variables
documented there. The service-role key must never reach the browser.

## 4. Database migrations

The migrations under `supabase/migrations/` are additive. Apply pending ones
with:

```bash
supabase db push
```

`20260812000000_create_safe_rooms.sql` adds `safe_rooms`,
`safe_room_participants` and `safe_room_messages`. RLS is enabled with no
public policy: only the service role (i.e. the `safe-room` Edge Function) can
read or write them, and the ≤30 participants / ≤24 h / ≤1000 m rules are also
enforced by CHECK constraints.

If this migration has not been applied, every Safe Room call fails because the
tables do not exist. The function now reports that case explicitly ("Safe Rooms
storage is not initialised…", HTTP 503) instead of the opaque **"Safe Rooms
storage rejected the operation."**, and a refused service-role key is reported
as a credential failure naming `SUPABASE_SERVICE_ROLE_KEY`.

`safe_rooms` also constrains `expires_at <= created_at + 24 hours`. The function
writes `created_at` explicitly so a 24 h room — the maximum the UI offers — no
longer depends on the database and the function clock agreeing, which could make
the insert violate that constraint.

No migration in this change set drops or truncates anything.

## 5. Canisters

`safe_location` gained `getMySettings` / `setMySettings` and a new
`settingsEntries` stable variable. The canister uses enhanced orthogonal
persistence (`dfx.json` → `--enhanced-orthogonal-persistence`) together with
explicit `preupgrade` / `postupgrade` handlers, so an **upgrade** (not a
reinstall) preserves all existing shares, locations and geofences.

```bash
# verify first
dfx build --network ic safe_location

# upgrade in place — never use --mode reinstall on a production canister
dfx deploy --network ic safe_location --mode upgrade
```

The other four canisters are unchanged and do not need to be redeployed.

Until that upgrade is applied, the deployed canister rejects `getMySettings` /
`setMySettings` with "method not found". The Safe Location page detects that
rejection, falls back to the browser-local settings cache and shows an amber
notice explaining that a `dfx deploy` is still pending, instead of failing the
whole page. The notice disappears as soon as the upgraded canister answers.

Upgrades can also be triggered from GitHub Actions with
`.github/workflows/upgrade-icp-canisters.yml` (manual dispatch, one canister per
run). That workflow always passes `--mode upgrade` for Motoko canisters, so a
state-destroying reinstall cannot happen by accident, and it makes a real call
against the canister afterwards to prove the upgrade worked. Required secrets:
`DFX_IDENTITY_PEM` (a controller identity) and `ADMIN_PRINCIPAL`.

## 6. Frontend asset canister

```bash
npm --prefix src/frontend ci
npm --prefix src/frontend run build     # runs tsc --noEmit then vite build
dfx deploy --network ic frontend
```

## 7. Internet Identity derivation origin

The bundle is reachable from more than one origin (the custom domain, the
GitHub Pages URL and the asset canister). Internet Identity derives a
**different principal per origin**, and the profile is stored in the canisters
under that principal — so without a fixed derivation origin the same person can
sign in and find an empty profile.

`https://valthoris.com` is therefore pinned as the derivation origin
(`II_DERIVATION_ORIGIN` in `src/frontend/src/services/canisterIds.ts`), and the
alternative origins are published in
`src/frontend/public/.well-known/ii-alternative-origins`. Any new origin the
app is served from must be added to that file, otherwise Internet Identity
rejects the sign-in from it.

Principals already created on `https://valthoris.com` are unaffected: for that
origin the derivation origin is the origin itself.

## 8. Post-deploy verification

1. Sign in with Internet Identity.
2. Save a profile, reload, confirm it is still there.
3. Save Safe Location trusted contacts / preferences, reload, confirm.
4. Create a share, copy the link, open it in a second browser profile signed in
   with the recipient principal.
5. Revoke the share and confirm the recipient now gets "Share has been revoked".
6. Open the AI Assistant and confirm the header shows "Backend connected" and a
   message produces a real answer (or a real error).
7. Ask the assistant to analyse a concrete artefact (for example
   `Analyze this URL for threats: https://example.com`) and then confirm in
   Supabase that the analysis was really recorded:

   ```sql
   select event_type, status, verdict, confidence_score, error_message
   from public.v_fraud_soc_timeline
   order by event_created_at desc
   limit 10;
   ```

   A completed run must carry a verdict; a failed run must carry the real
   error message and no decision. Asking the same question twice must not
   create a second `fraud_events` row.
8. Open **Safe Rooms** (`/rooms`), create a room, copy the link and open it in a
   second browser (or a phone). Both participants must accept the terms, appear
   as separate markers on the same map, see each other move, and exchange
   messages in the room chat. Pressing **EXIT** must remove that participant's
   marker for everybody else.
9. On an Android phone, open the AI Assistant and focus the composer: the input
   and the send button must stay visible above the keyboard, the conversation
   must stay scrollable, no footer may cover the chat and there must be no
   horizontal scrolling.
10. Sign out, sign in again from the same URL, and confirm the profile is still
   there — it is read back from `c6sjf-tqaaa-aaaap-qsiea-cai`, not from
   localStorage (clearing site data and reloading must still show it).
