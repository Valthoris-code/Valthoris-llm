# Deployment — required configuration and commands

This file lists the exact configuration and commands needed to deploy the
current state of the repository. No secret values are stored here; only the
names of the variables that must be provided by the deployment environment.

## 1. Frontend environment (public configuration only)

Provided at build time by Vite (`.env` in `src/frontend/`, or the CI
environment). These are public values — never place a service-role key or an
LLM API key here.

| Variable | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL. Also used to reach the `ai-chat` Edge Function. |
| `VITE_SUPABASE_ANON_KEY` | Supabase public anon key. |

Canister IDs are read from `canister_ids.json` / the dfx-generated `.env`
(`src/frontend/src/services/canisterIds.ts`).

## 2. Supabase Edge Function secrets — `ai-chat`

The AI Assistant calls `supabase/functions/ai-chat`. The LLM credentials live
only in the function's secret store:

| Secret | Required | Default |
| --- | --- | --- |
| `AI_PROVIDER` | no | `openai` |
| `OPENAI_API_KEY` | when the provider resolves to OpenAI | — |
| `OPENAI_MODEL` | no | `gpt-4o-mini` |
| `ANTHROPIC_API_KEY` | when the provider resolves to Anthropic | — |
| `ANTHROPIC_MODEL` | no | `claude-3-5-haiku-20241022` |

At least one of `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` must be set, otherwise
the function returns HTTP 502 with a real error message and the assistant
displays it instead of an answer.

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected into every Edge
Function by Supabase itself. They are what allows `ai-chat` to record real
security analyses in the fraud pipeline (`fraud_events`,
`fraud_workflow_runs`, `fraud_decisions`,
`fraud_decision_justifications`). If they are unavailable, the assistant still
answers but the analysis is not recorded — and the reason is logged and
returned to the browser instead of being hidden.

```bash
supabase secrets set AI_PROVIDER=openai OPENAI_API_KEY=<key>
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
8. Sign out, sign in again from the same URL, and confirm the profile is still
   there — it is read back from `c6sjf-tqaaa-aaaap-qsiea-cai`, not from
   localStorage (clearing site data and reloading must still show it).
