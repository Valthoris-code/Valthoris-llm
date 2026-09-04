# Deployment — required configuration and commands

This file lists the exact configuration and commands needed to deploy the
current state of the repository. No secret values are stored here; only the
names of the variables that must be provided by the deployment environment.

## 0. One source of truth: this repository

Everything that runs on Supabase — Edge Functions and migrations — is deployed
from this repository. `.github/workflows/deploy-edge-functions.yml` redeploys
**every** function on each push to `main`, without a path filter, precisely so
that the deployed code cannot drift away from the code that is reviewed here.

A consequence to respect: a change made by hand in the Supabase Dashboard (an
edited function, a patched query) survives only until the next push, which
overwrites it. If a fix is applied there under pressure, it must be committed
here in the same session, otherwise it will silently disappear and the symptom
will come back — which is exactly how "sources that got better and then got
worse again" happens. Secrets are the one exception: they live only in the
Supabase secret store and are never committed.

To reconcile after an out-of-band change: pull the deployed source
(`supabase functions download <name> --project-ref <ref>`), diff it against
`supabase/functions/<name>/`, and commit whatever is genuinely newer with a
`sync:` commit message.

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

Google also answers **HTTP 503 `UNAVAILABLE` ("the model is overloaded")** when
its own capacity is short. That is not a fault of the request: the same body
succeeds seconds later. Each model of the chain is therefore attempted up to
three times (400 ms then 1200 ms apart) before the next name is tried, with a
45 s ceiling on the whole chain — the same treatment is given to `500`, `502`,
`504` and `529`. A quota rejection (`429`) is *not* retried: every model name
shares one quota, so retrying only spends more of the same budget.

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
| `GEMINI_API_KEY` | `supabase/functions/ai-chat` | **in use** — the assistant and the fraud analysis both call Gemini with it; when DeepSeek is also configured, either model covers for the other |
| `DEEPSEEK_API_KEY` (`DEEPSEEK_MODEL`) | `supabase/functions/ai-chat` | **optional but recommended** — tried before Gemini on an ordinary turn and used as the fallback whenever Gemini fails (HTTP 402, 429, timeout…); the failure never reaches the user, and only when *both* models fail does the assistant answer with a single generic message |
| `ABUSEIPDB_API_KEY` | `ai-chat/intel.ts` | **in use** — IP reputation |
| `IPINFO_API_KEY` | `ai-chat/intel.ts` | **in use** — IP geolocation / ASN |
| `ABSTRACT_IP_API_KEY` | `ai-chat/intel.ts` | **in use** — IP intelligence |
| `VIRUSTOTAL_API_KEY` | `ai-chat/intel.ts` | **in use** — URL / domain / IP reputation |
| `URLSCAN_API_KEY` | `ai-chat/intel.ts` | **in use** — URL / domain scan history |
| `GOPLUS_API_URL` + `GOPLUS_APP_KEY` + `GOPLUS_APP_SECRET` | `ai-chat/intel.ts` | **in use** — phishing site and address security; the three together obtain the access token (all required, otherwise the provider reports `not_configured`) |
| `ABSTRACT_EMAIL_API_KEY` | `ai-chat/intel.ts` | **in use** — e-mail intelligence |
| `NUMVERIFY_API_KEY` | `ai-chat/intel.ts` | **in use** — phone validation |
| `ABSTRACT_PHONE_API_KEY` | `ai-chat/intel.ts` | **in use** — phone intelligence |
| `OPENIBAN_API_URL` | `ai-chat/intel.ts` | **in use** — IBAN validation |
| `ABSTRACT_IBAN_API_KEY` | `ai-chat/intel.ts` | **in use** — IBAN intelligence |
| `ABSTRACT_VAT_API_KEY` | `ai-chat/intel.ts` | **in use** — VAT / business validation |
| `ETHERSCAN_API_KEY` | `ai-chat/intel.ts` | **in use** — Ethereum address activity |
| `CRYPTOSCAMDB_API_URL` | `ai-chat/intel.ts` | **disabled** — the CryptoScamDB public API answers HTTP 404 for every lookup (project discontinued). The source is switched off in code and reported as `disabled`, with the reason, instead of failing on every crypto/domain analysis. Its coverage is provided by VirusTotal, URLScan and GoPlus until a replacement (Chainabuse / ScamSniffer) is contracted |
| `COINGECKO_API_KEY` | `ai-chat/intel.ts` | **in use** — token market data |
| `NEWSDATA_API_KEY` | `ai-chat/intel.ts` | **in use** — current threat intelligence, only on an explicit news intent |
| `DATA_GOV_API_KEY` | `ai-chat/intel.ts` | **in use** — FTC Do Not Call complaints; **US (+1) numbers only**, no coverage for Portugal/Europe |
| `BRAVE_SEARCH_API_KEY` | `ai-chat/intel.ts` | **optional** — public web search; when present it is used in addition to the keyless engines, with fresher and cleaner results |
| `TAVILY_API_KEY` | `ai-chat/intel.ts` | **optional** — public web search built for AI answers |
| `SERPER_API_KEY` | `ai-chat/intel.ts` | **optional** — Google results (including the knowledge panel's phone, site and address) |
| `GEMINI_SEARCH_MODEL` | `ai-chat/intel.ts` | **optional** — the model used for the web search only; defaults to `GEMINI_MODEL` and then to `gemini-2.5-flash` |

### The web search runs on the Gemini key you already have

Every turn that is a real question — any subject, not only security — is
searched on the web **before** the model writes the answer, and the pages that
were read are listed as sources under it.

The primary engine is **Google Search through Gemini**: `ai-chat/intel.ts`
calls `generateContent` with the `google_search` tool as a *search source*, not
as an answer, keeps the pages from the grounding metadata and hands them to the
turn as evidence. That is what makes the search stable — it is a contracted API
served against `GEMINI_API_KEY`, so it does not depend on a public endpoint
tolerating requests from a datacentre address. If the configured model does not
serve the tool, the next model in the chain is tried (`GEMINI_SEARCH_MODEL` →
`GEMINI_MODEL` → `gemini-2.5-flash` → `gemini-2.5-flash-lite`).

A model name that this key does not serve answers **HTTP 404** ("endpoint not
found") for every search, which is why the search could fail permanently while
the key itself was perfectly valid. When the whole chain answers 404, `ai-chat`
now asks the key which models it actually has (`ListModels`), keeps the ones
that support `generateContent`, and retries with them; the discovered list is
reused for the rest of the instance's life. Setting `GEMINI_SEARCH_MODEL` to a
model the key serves skips the discovery entirely.

Two more engines need no credential at all and run alongside it, so the answer
never rests on a single provider:

* **DuckDuckGo**, through its no-JavaScript result page (with the Instant Answer
  API as the fallback when that page throttles the datacentre address);
* **Wikipedia**, searched in Portuguese and English — and only for a genuinely
  encyclopaedic question ("o que é…", "quem foi…", "história de…"). It is never
  consulted for a phone number, an e-mail, a URL, an IBAN, a place, a news or
  alert request, or ordinary conversation, where it can only return something
  unrelated that would then appear in the answer as a cited source.

The optional keys above are added on top: when they are configured, their
engines answer alongside the others and every source is listed individually, so
a throttled engine is visible instead of silently narrowing the answer.

When **no** engine returned a page, the answer call itself is made with
Google's search tool enabled, so the model searches instead of recalling; the
pages it grounded on are reported as the `Google Search (Gemini)` source with
the `web/grounding` endpoint. When a search source already answered, that second
search is skipped, so a question never spends the search quota twice.

### What is searched, and what is simply answered

`ai-chat/index.ts` decides *once per turn*, in `classifyTurn()`, what the turn
is, and everything else follows from that single decision:

| Intent | What runs |
| --- | --- |
| `social` | nothing at all — no provider is contacted and no source is listed |
| `artifact` | the threat-intelligence providers for the number, e-mail, URL, IBAN, IP or wallet |
| `news` | the news feeds and the web search, never the encyclopaedia |
| `place` | the gazetteers (Nominatim, Photon) and the web search |
| `encyclopaedic` | the web search **and** Wikipedia |
| `factual` | the web search |

A turn is conversation when it neither names a subject (a proper noun, a
number, an address, a handle) nor asks something a source could answer — which
is what keeps "preciso de ajuda" or "posso ser teu amigo" from being searched
literally and answered with whatever album or film happens to share the name.

### Continuity between turns

The browser sends the whole conversation, and `conversationSubject()` resolves
a follow-up that does not repeat the name of its subject ("e a morada?", "o
contacto?", "onde fica isso?") against the most recent earlier turn that named
one. The resolved reference is looked up *and* stated in the turn handed to the
model, so the assistant answers about the place discussed two messages earlier
instead of asking for its full name again.

The conversations themselves are kept in the browser, per account
(`src/frontend/src/services/chatHistory.ts`): at most 20 conversations, at most
40 messages each, reopenable from the sidebar and — on mobile — from the
"Conversas" entry of the bottom bar.

### The shape of an answer

An analysis answers twice: a **traffic light** in plain language plus one
sentence anybody understands, then the marker `[DETALHE]`, and only after it the
full technical detail. The interface folds everything after the marker behind
"Ver análise completa", so a user who is not technical is never met with
provider names, timestamps and coordinates.

The traffic light is not written by the language model. It is computed by
`ai-chat/verdict.ts` from the raw provider payloads, after every source has
answered and before the answer is shown, and it *replaces* any verdict line the
model happened to write — the model can be unavailable, and even when it is
available it must not be the only source of truth about risk.

| Light | Meaning |
| --- | --- |
| 🔴 PERIGO | at least one source confirms malice (VirusTotal detections, a high AbuseIPDB confidence, a confirmed Valthoris community report, a phishing/malicious flag from GoPlus or URLScan) |
| 🟠 CUIDADO | mixed signals, slightly negative reputation, or a single source pointing at risk with no cross-confirmation |
| 🟢 SEGURO | the risk sources answered and none of them carries a signal |
| ⚪ SEM INFORMAÇÃO SUFICIENTE | no risk source answered, or more sources failed than answered — **never** shown as green, because "nothing was checked" is not "nothing was found" |

Every signal is scored (`strong` 60, `moderate` 25, `weak` 10) and the total
decides the light: ≥ 60 is red, ≥ 10 is amber, 0 with real coverage is green.
Coverage is counted **only** over the reputation providers, so a search engine
or a gazetteer answering can never turn "nothing checked" into a green light.

The exact thresholds live in one exported constant, `VERDICT_THRESHOLDS` in
`ai-chat/verdict.ts` (VirusTotal detections and reputation, AbuseIPDB confidence
and report count, URLScan, GoPlus, community risk scores, and the score bands).
They are meant to be tuned there — changing a number changes the verdict, and no
other logic has to be touched. `verdict_test.ts` pins the behaviour of each
band, including the rule that missing data is grey and never green.

Only small talk (a greeting, a thank-you, "ok") skips the search entirely.

OpenStreetMap **Nominatim** needs no secret: public place/business lookups are
anonymous and identified only by the required `User-Agent`. The public service
enforces a hard usage policy and `ai-chat/intel.ts` implements it rather than
merely documenting it:

* every request is sent as
  `Valthoris-App/1.0 (https://valthoris.com; contacto@valthoris.com)` with a
  `Referer` of `https://valthoris.com` — a generic HTTP-client User-Agent is
  answered with HTTP 403;
* requests are serialised through a process-wide queue that guarantees at least
  **one second** between calls, so simultaneous users cannot produce a burst;
* an identical search is answered from an in-memory cache for **24 h**, so a
  repeated question costs no request at all.

Those three measures are what removes the intermittent "works, then fails, then
works again" behaviour: it was the OpenStreetMap block, not a missing key. If
the volume ever outgrows the public service, the next step is a self-hosted
Nominatim or a commercial geocoder — only `NOMINATIM_BASE_URL` in `intel.ts`
would change.

A place is looked up in **two** keyless gazetteers, Nominatim and **Photon**
(Komoot), and the candidates they return are ranked before one is chosen: a bus
stop, a road or an administrative boundary that merely shares a word never
outranks the hospital, shop or office the question is about. When a query finds
nothing it is reformulated ("Óptica Havaneza em Évora" → "Óptica Havaneza,
Évora" → "Havaneza, Évora") instead of being answered with "não encontrado".

The **phone number and the website** of a business are asked for explicitly:
Nominatim is queried with `extratags=1`, and a place found by Photon — which
never returns contact details — is completed with a `/lookup` on its OSM object
(the same throttle and the same 24 h cache, so it costs no extra quota in
practice). Whatever the OSM object carries (`phone`, `contact:phone`, `website`,
`contact:website`, `email`, `opening_hours`) is shown; whatever it does not
carry is reported as not confirmed. Nothing is ever invented, and nothing that
exists is hidden any more.

### The sidebar tools answer with the same verdict

Scanner, Phone, Email, IBAN, Crypto Wallet, URL, QR Code, Domain and Username
query the Internet Computer canisters for the Valthoris community evidence, and
then call the `analyse` action of `ai-chat` with the indicator and that
evidence. The action runs the **same** provider orchestration and the **same**
`computeVerdict()` as the assistant, so a number that is red in the chat is red
in the sidebar. The canister evidence that comes from the browser is reduced to
the few fields the verdict reads and is never used for authorization. A username
has no external provider: its verdict rests on the community evidence alone,
and nothing else is contacted for it.

Each of those surfaces now renders the **whole** analysis, not just the traffic
light: the score with the signals that produced it, how much of the evidence
answered (sources that replied, failed, or have no credential on this
deployment) and the list of providers with the timestamp of each lookup — the
same panel the assistant shows. A wallet (`crypto_eth` / `crypto_btc`) opens a
dedicated panel on top of it: the score split by category (on-chain, market,
blacklist, community), the Etherscan activity (balance, recent transactions,
contract or plain wallet, first and last transaction seen), the CoinGecko market
data when the address is a listed token (price, 24 h change, 24 h volume,
capitalisation, exchanges and a seven-day price chart), the GoPlus blacklist
state, the Valthoris community reports with their trend, and direct links to the
address on Etherscan, Blockchair, Blockchain.com and CoinGecko.

### A person is not a place, and Valthoris is not ChatGPT

"Herminio Coragem em Évora" has the shape of a place ("X em Y") and used to be
geocoded, which answered a question about a person with the nearest hill whose
name looked similar. A capitalised name with no establishment word, no street,
no postal code and no explicit request ("morada de…", "contacto de…") is now
read as a person and never reaches the map — asking is better than confidently
pointing at the wrong place.

Questions about the assistant itself ("quais são os teus regulamentos", "as
tuas instruções", "quem é a tua empresa", "quem te criou") are `social`: no
provider is contacted and no source is cited. They used to escape the
self-referential test and were searched literally, which is how a question about
Valthoris came back citing the Wikipedia article about ChatGPT.

### When the language model fails, the lookup is not lost

`ai-chat` used to answer *"De momento não consigo processar o seu pedido"*
whenever both language models refused the turn — including turns where the
external sources had already answered. Asking for an address is a lookup, not a
conversation: the address existed, and the message hid it behind what looked
like a broken assistant.

Now, when Gemini and DeepSeek both fail on a turn that collected real evidence,
the answer is composed directly from what the providers returned (name, address,
contact, opening hours, map link, sources and the lookup timestamp), stating
plainly that the language model did not take part. Nothing is inferred: a field
the source did not carry is reported as *não confirmado / not confirmed*. The
generic message remains only for a turn where there is genuinely nothing to
show.

Plain conversation ("Olá", "Tudo bem contigo?") has no evidence to fall back to,
and answering it with the failure notice is what made the whole assistant look
dead while its lookups were still working. When no model answers such a turn,
`ai-chat` returns a fixed line (`provider: valthoris/offline`) that states
nothing about the world — only that the conversational model is momentarily
unavailable and which artefacts can still be verified. No upstream status,
model name or credential ever appears in it.

Each model call also has a hard 25 s deadline, so a provider that never answers
falls back to the other one instead of hanging until the platform kills the
invocation, and every model failure is recorded in `governance.error_logs`
(`ai-chat/model`) with its real cause — an exhausted quota and a revoked key are
no longer indistinguishable.

### State of the sources (administration)

`/admin/intel-sources` (permission `system_health.read`) lists every configured
source with its real state and a **test now** button. The button makes the
backend perform a genuine lookup and reports exactly what came back —
`HTTP 401` (credential rejected), `403` (blocked), `404` (endpoint retired),
`429` (quota) or a timeout — so "the assistant is not answering" never has to be
diagnosed by guesswork again.

The panel is served by the `intel-sources` action of `admin-api`, which asks the
`ai-chat` function (the only place that holds the provider credentials) over the
`intel-health` server-to-server endpoint. That endpoint requires the project's
service-role key, compared in constant time, and answers `404` to anything else,
so no browser can reach it.

Every provider failure — during a user turn or during a test — is written to
`governance.error_logs` with the provider, the lookup, the HTTP status and the
timestamp. The user keeps seeing the single generic sentence (a UX decision),
but the operator now has the real cause. No credential, URL or request body is
ever recorded.

A failure that is a **configuration** problem says so instead of looking like a
transient outage. `HTTP 401`/`403` from a provider is recorded with the name of
the secret to fix, and for the Abstract API family with the reason it is almost
always rejected: **each Abstract product (IP, e-mail, phone, IBAN, VAT) issues
its own key**, so a key that works on one endpoint returns 401 on the others.
Those keys are held in Supabase Secrets and cannot be repaired from the
repository — the entry in `error_logs` names `ABSTRACT_IP_API_KEY` /
`ABSTRACT_PHONE_API_KEY` and what to replace it with.

A metered provider is protected instead of being burned: NumVerify answers are
cached for 6 h, an identical lookup spends no request at all, and once the plan
is exhausted (apilayer reports it as HTTP 200 with error code 104, which is
translated to a real 429) the source stops sending requests for 15 minutes and
reports the exhausted quota. That is what keeps one busy day from turning into
permanent 429s.

The full mapping (secret → provider → module → lookup → data returned) is in
`docs/architecture/api-integration-matrix.md`.

A secret that is absent on a deployment is not a failure: the corresponding
provider is reported to the user as *not consulted* and the analysis continues
with the remaining sources. No screen ever fabricates a reputation, a price or
a scan result to stand in for a provider that did not answer.

EtherscamDB, OpenCNAM, Nomorobo and WhoCallsMe are prepared in the
threat-intelligence architecture but have **no credentials configured**; no key
is invented for them, and any feature that depends on one reports the missing
configuration instead of fabricating data.

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected into every Edge
Function by Supabase itself. They are what allows `ai-chat` to record real
security analyses in the fraud pipeline (`fraud_events`,
`fraud_workflow_runs`, `fraud_decisions`,
`fraud_decision_justifications`). If they are unavailable, the assistant still
answers but the analysis is not recorded — and the reason is logged and
returned to the browser instead of being hidden.

```bash
supabase secrets set GEMINI_API_KEY=<key>       # the assistant itself
# Optional intelligence providers — each one that is set is queried for real,
# each one that is missing is reported to the user as not consulted:
# ABUSEIPDB_API_KEY IPINFO_API_KEY VIRUSTOTAL_API_KEY URLSCAN_API_KEY
# ABSTRACT_IP_API_KEY ABSTRACT_EMAIL_API_KEY ABSTRACT_PHONE_API_KEY
# ABSTRACT_IBAN_API_KEY ABSTRACT_VAT_API_KEY NUMVERIFY_API_KEY
# ETHERSCAN_API_KEY COINGECKO_API_KEY NEWSDATA_API_KEY DATA_GOV_API_KEY
# OPENIBAN_API_URL CRYPTOSCAMDB_API_URL
# GOPLUS_API_URL GOPLUS_APP_KEY GOPLUS_APP_SECRET
# DEEPSEEK_API_KEY (optional, silent two-way fallback with Gemini)
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
