# API integration matrix — Valthoris intelligence orchestration

**Scope:** what the platform actually queries today, from the secrets that are
already configured on the Supabase project. Nothing in this table is
aspirational: an entry marked `ACTIVE` has a real code path in
`supabase/functions/ai-chat/intel.ts`.

**Secrets are never exposed.** Only secret *names* appear here. Keys are read
inside the Edge Function, are never sent to the browser, never logged, and
never included in a source report or in the evidence block handed to the model.

## Orchestration flow

```
Valthoris frontend (src/frontend/src/pages/AIAssistant.tsx)
  → aiChatService.sendChat()
    → Supabase Edge Function `ai-chat` (supabase/functions/ai-chat/index.ts)
      → artefact detection (artifacts.ts)
      → intelligence orchestration (intel.ts) — providers run in parallel
      → evidence block + Gemini (grounded answer, unchanged provider)
      → fraud pipeline record (pipeline.ts)
    ← { content, provider, model, analysis?, sources[] }
  ← verdict + evidence + sources rendered in the assistant
```

## Matrix

| API | Secret | Edge Function | Valthoris module | Lookup performed | Data returned | Source shown to the user | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Google Gemini | `GEMINI_API_KEY` (`GEMINI_MODEL`) | `ai-chat` | AI Assistant | `generateContent` | assistant answer, structured verdict | — (the assistant itself; falls back to DeepSeek on any error) | ACTIVE |
| DeepSeek | `DEEPSEEK_API_KEY` (`DEEPSEEK_MODEL`) | `ai-chat` | AI Assistant (first attempt, and Gemini's fallback) | `chat/completions` | assistant answer | — (falls back to Gemini on any error) | OPTIONAL |
| AbuseIPDB | `ABUSEIPDB_API_KEY` | `ai-chat` → `intel.ts` | IP / Threat Intelligence | `api/v2/check` | abuse confidence, reports, ISP, country, usage type | AbuseIPDB | ACTIVE |
| IPinfo | `IPINFO_API_KEY` | `ai-chat` → `intel.ts` | IP Intelligence | `ipinfo.io/{ip}/json` | city, region, country, org, ASN, privacy flags | IPinfo | ACTIVE |
| Abstract IP | `ABSTRACT_IP_API_KEY` | `ai-chat` → `intel.ts` | IP Intelligence | `ipgeolocation/v1` | country, city, connection type, VPN flag | Abstract | ACTIVE |
| VirusTotal | `VIRUSTOTAL_API_KEY` | `ai-chat` → `intel.ts` | URL / domain / IP intelligence | `api/v3/{urls,domains,ip_addresses}` | analysis stats, reputation, categories | VirusTotal | ACTIVE |
| URLScan | `URLSCAN_API_KEY` | `ai-chat` → `intel.ts` | URL scanner | `api/v1/search` | scan count, malicious verdicts, recent scans | URLScan | ACTIVE |
| GoPlus | `GOPLUS_API_URL` + `GOPLUS_APP_KEY` + `GOPLUS_APP_SECRET` | `ai-chat` → `intel.ts` | URL + crypto security | `api/v1/token` (SHA-1 signed, cached 55 min) then `phishing_site`, `address_security` with `Authorization: Bearer` | phishing flag, malicious address flags | GoPlus | ACTIVE |
| Abstract Email | `ABSTRACT_EMAIL_API_KEY` | `ai-chat` → `intel.ts` | Email lookup | `emailvalidation/v1` | deliverability, quality score, disposable, MX/SMTP | Abstract | ACTIVE |
| NumVerify | `NUMVERIFY_API_KEY` | `ai-chat` → `intel.ts` | Phone lookup | `apilayer.net/api/validate` | validity, country, carrier, line type | NumVerify | ACTIVE |
| Abstract Phone | `ABSTRACT_PHONE_API_KEY` | `ai-chat` → `intel.ts` | Phone lookup | `phonevalidation/v1` | validity, type, carrier, country | Abstract | ACTIVE |
| FTC Do Not Call | `DATA_GOV_API_KEY` | `ai-chat` → `intel.ts` | Phone lookup (**US only**) | `v0/dnc-complaints?area_code=…` | complaints in the area, robocall count, common subjects | FTC (api.ftc.gov) | ACTIVE |
| Nominatim (OpenStreetMap) | none (keyless) | `ai-chat` → `intel.ts` | Public place / business lookup | `search?q=…&format=jsonv2` | name, address, category, coordinates, OSM link | OpenStreetMap | ACTIVE |
| OpenIBAN | `OPENIBAN_API_URL` | `ai-chat` → `intel.ts` | IBAN | `/validate/{iban}` | validity, bank name, BIC, check results | OpenIBAN | ACTIVE |
| Abstract IBAN | `ABSTRACT_IBAN_API_KEY` | `ai-chat` → `intel.ts` | IBAN | `ibanvalidation/v1` | validity, country, bank, BIC | Abstract | ACTIVE |
| Abstract VAT | `ABSTRACT_VAT_API_KEY` | `ai-chat` → `intel.ts` | VAT / business intelligence | `vat/v1/validate` | validity, company name and address | Abstract | ACTIVE |
| Etherscan | `ETHERSCAN_API_KEY` | `ai-chat` → `intel.ts` | Crypto Intelligence | API **V2** `v2/api?chainid=1` — `account/balance`, `account/txlist` | balance, recent activity, first/last seen | Etherscan | ACTIVE |
| CryptoScamDB | `CRYPTOSCAMDB_API_URL` | `ai-chat` → `intel.ts` | Crypto Intelligence | `/v1/check/{entity}` | scam status, entry type, blocked flag | CryptoScamDB | ACTIVE |
| CoinGecko | `COINGECKO_API_KEY` | `ai-chat` → `intel.ts` | Crypto Intelligence | `coins/ethereum/contract/{address}` | listed token, symbol, market cap rank, price | CoinGecko | ACTIVE |
| NewsData | `NEWSDATA_API_KEY` | `ai-chat` → `intel.ts` | Threat Intelligence (current) | `api/1/news` | headlines, sources, publication dates | NewsData | ACTIVE |

`ACTIVE` here means *implemented and wired*. At runtime each lookup reports its
own state to the user:

| Runtime state | Meaning |
| --- | --- |
| `success` | the provider answered and its data is in the report |
| `failed` | the provider was queried and did not answer (quota, HTTP error, timeout) — the analysis continues with the other providers and the limitation is stated |
| `not_configured` | the secret is absent on this deployment — the provider is never presented as consulted |

## Provider selection per entity

| Entity detected in the turn | Providers queried |
| --- | --- |
| IP address | AbuseIPDB + IPinfo + VirusTotal + Abstract IP |
| URL | VirusTotal + URLScan + GoPlus + CryptoScamDB |
| Domain | VirusTotal + URLScan + CryptoScamDB |
| E-mail | Abstract Email |
| Phone | NumVerify + Abstract Phone + FTC Do Not Call (US numbers only) |
| IBAN | OpenIBAN + Abstract IBAN |
| VAT number | Abstract VAT |
| Ethereum address | Etherscan + CryptoScamDB + GoPlus + CoinGecko |
| Bitcoin address | CryptoScamDB |
| Public place / business question | Nominatim (only when the turn names a place **and** asks for a factual detail) |
| Current-threat question | NewsData (only on an explicit news intent) |

## Guarantees

* **No fabrication.** The model only sees what the providers returned; it is
  instructed never to list a source that did not answer.
* **Partial outage tolerated.** Providers run in parallel and independently,
  each with an 8 s timeout; one failure never fails the answer.
* **No SSRF.** Every entity is validated against a strict pattern and
  percent-encoded before it is interpolated into a provider URL; URLs pointing
  at localhost, link-local or private ranges are rejected outright. Secrets
  holding a base URL must be absolute `https://` origins.
* **No key leakage.** Upstream error bodies are never echoed: only the HTTP
  status is reported, because some providers carry the key in the query string.
