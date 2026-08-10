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

```bash
supabase secrets set AI_PROVIDER=openai OPENAI_API_KEY=<key>
supabase functions deploy ai-chat
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

## 6. Frontend asset canister

```bash
npm --prefix src/frontend ci
npm --prefix src/frontend run build     # runs tsc --noEmit then vite build
dfx deploy --network ic frontend
```

## 7. Post-deploy verification

1. Sign in with Internet Identity.
2. Save a profile, reload, confirm it is still there.
3. Save Safe Location trusted contacts / preferences, reload, confirm.
4. Create a share, copy the link, open it in a second browser profile signed in
   with the recipient principal.
5. Revoke the share and confirm the recipient now gets "Share has been revoked".
6. Open the AI Assistant and confirm the header shows "Backend connected" and a
   message produces a real answer (or a real error).
