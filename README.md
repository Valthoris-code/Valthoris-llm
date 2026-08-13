

# VALTHORIS

<div align="center">

<img src="documentos/valthoris-desktop-scene.png" alt="Valthoris" width="850">

<br>

## AI CYBERSECURITY & FRAUD PREVENTION

### Intelligence · Prevention · Protection

</div>

---
Valthoris

AI Cybersecurity & Fraud Prevention Platform

Valthoris is a cybersecurity and fraud-prevention platform designed to combine artificial intelligence, decentralized infrastructure, identity intelligence, threat intelligence, community intelligence and security-oriented user protection.

Valthoris is being developed around the principles of:

- Security by Design
- Privacy by Design
- Zero Trust
- Data minimisation
- Strong authentication
- Least-privilege access
- Auditable security operations
- Resilient infrastructure
- Responsible AI
- Regulatory awareness

The platform currently uses the Internet Computer Protocol (ICP) as its decentralized application and backend infrastructure, with a React/TypeScript web application delivered as an ICP asset canister and multiple Motoko canisters providing independent backend services.

Valthoris also contains an integration layer for operational services including Supabase and external AI providers. These integrations are documented separately from the decentralized ICP infrastructure because their production status and end-to-end synchronization require independent validation.

---

Important Documentation Statement

This README describes the current state of the Valthoris repository and implementation.

It intentionally distinguishes between:

- functionality that is implemented and verified;
- functionality implemented but still undergoing validation;
- functionality under development;
- planned functionality;
- research and future capabilities.

A feature appearing in the user interface, architecture documentation or roadmap is not automatically considered operational.

Valthoris follows the following documentation rule:

«Documentation must describe the system that exists today, not the system we intend to build tomorrow.»

This principle is particularly important when Valthoris is presented to:

- cybersecurity professionals;
- public institutions;
- law-enforcement organisations;
- financial institutions;
- regulators;
- technical auditors;
- researchers;
- investors;
- strategic partners.

---

Project Status

Valthoris is a substantial working software project with a deployed ICP frontend, multiple backend canisters, authentication infrastructure, security-oriented modules and an expanding service architecture.

However, several areas still require systematic end-to-end production validation, particularly:

- persistent user data;
- profile synchronization;
- Community persistence;
- Safe Location persistence and multi-user workflows;
- Identity workflows;
- Threat Intelligence workflows;
- AI request/response pipelines;
- Supabase synchronization;
- production integration between individual services.

Therefore, Valthoris should not be described as a completely finished cybersecurity platform.

It is a working platform under controlled validation and continued development.

---

Official Implementation Status Model

Valthoris uses five official implementation states.

Status| Meaning
🟢 Operational| Implemented, deployed and verified in the relevant production workflow
🟡 Implemented / Validation| Code and/or deployment exists, but complete end-to-end validation is still required
🟠 In Development| Partial implementation is present and development continues
🔵 Planned| Defined roadmap functionality that is not currently operational
⚪ Research| Research, experimentation or future investigation

These classifications are deliberately conservative.

When production evidence is insufficient, Valthoris does not claim that a capability is operational.

---

Current Platform Status

Component| Status
Valthoris Web Application| 🟢 Operational
ICP Frontend| 🟢 Operational
React / TypeScript / Vite frontend| 🟢 Operational
Internet Identity authentication| 🟢 Implemented
ICP Backend| 🟡 Implemented / Validation
Identity| 🟡 Implemented / Validation
Community| 🟡 Implemented / Validation
Safe Location| 🟡 Implemented / Validation
Threat Intelligence| 🟡 Implemented / Validation
Profile persistence| 🟡 Validation
Supabase integration| 🟡 Implemented / Validation
Supabase synchronization| 🟠 In Development / Validation
AI architecture| 🟡 Implemented / Validation
AI end-to-end production pipeline| 🟡 Validation
AutoShield| 🟠 In Development
Audio Intelligence| 🔵 Planned
Visual Intelligence| 🔵 Planned
Malware Intelligence| 🔵 Planned
Enterprise SIEM/SOAR| 🔵 Planned
Banking integrations| 🔵 Planned
Institutional integrations| 🔵 Planned
Advanced blockchain intelligence| 🔵 Planned / Research

---

Architecture

Valthoris is currently implemented as a modular application built around the Internet Computer Protocol (ICP).

The current implementation consists of:

1. a React/TypeScript frontend;
2. Internet Identity authentication;
3. multiple independent Motoko canisters;
4. ICP actor communication;
5. persistent decentralized state in selected canisters;
6. Supabase integration for operational services;
7. AI/service abstraction components;
8. security-oriented application modules.

The architecture below represents the current implementation, not the future target architecture.

                         ┌──────────────────────────┐
                         │          USERS           │
                         │                          │
                         │     Web / PWA / Mobile   │
                         └────────────┬─────────────┘
                                      │
                                      ▼
                         ┌──────────────────────────┐
                         │    VALTHORIS FRONTEND    │
                         │                          │
                         │ React + TypeScript + Vite │
                         │          PWA             │
                         └────────────┬─────────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    │                 │                 │
                    ▼                 ▼                 ▼
             Internet Identity   ICP Actors        Supabase
                    │                 │                 │
                    │        ┌────────┼────────┐        │
                    │        │        │        │        │
                    │        ▼        ▼        ▼        │
                    │     Backend  Community Identity   │
                    │        │        │        │         │
                    │        │        │        │         │
                    │        ▼        ▼        ▼         │
                    │   Threat Intel. Safe Location     │
                    │                                  │
                    └────────────────┬─────────────────┘
                                     │
                                     ▼
                           Operational Services

The existence of these components does not mean that every component is currently connected into one fully verified end-to-end production pipeline.

That distinction is intentional.

---

Internet Computer Infrastructure

The current "dfx.json" defines the following ICP canisters:

Canister| Technology| Role| Status
"frontend"| React / TypeScript / Vite / ICP Assets| Web application| 🟢
"backend"| Motoko| Core backend services| 🟡
"community"| Motoko| Community functionality| 🟡
"identity"| Motoko| Identity and reputation functionality| 🟡
"threat_intelligence"| Motoko| Threat intelligence functionality| 🟡
"safe_location"| Motoko| Location sharing and geofencing| 🟡

These are actual project components defined in the repository and deployed to the ICP network.

---

Mainnet Canister Identifiers

The current deployed frontend canister is:

frontend
v63rh-lqaaa-aaaaa-qewvq-cai

The backend canister currently deployed is:

backend
c6sjf-tqaaa-aaaap-qsiea-cai

The Community canister is:

community
7w5qg-6aaaa-aaaab-ael4a-cai

The Identity canister is:

identity
ezroe-caaaa-aaaac-bcdeq-cai

The Safe Location canister is:

safe_location
sodv3-uiaaa-aaaak-qxubq-cai

The Threat Intelligence canister is:

threat_intelligence
e2m3q-yqaaa-aaaas-qekva-cai

These identifiers are documented because they represent the currently observed deployment state.

They should always be rechecked against the repository and live ICP deployment before being used for a formal release or audit.

---

Frontend

The Valthoris frontend is a real React/TypeScript application built with Vite.

The application is deployed as an ICP asset canister.

The frontend contains application areas including:

- authentication;
- profile;
- assistant;
- scanner;
- global radar;
- Safe Location;
- community-related functionality;
- threat intelligence;
- security navigation;
- legal pages;
- informational pages.

The frontend is not a static HTML mock-up.

However, a functioning interface does not automatically prove that every action is permanently persisted.

Therefore every important workflow must be independently tested.

---

Frontend Technology

The current frontend uses:

- React;
- TypeScript;
- Vite;
- PWA functionality;
- ICP actor communication;
- Internet Identity authentication;
- browser-side application state;
- integration services;
- security-oriented UI components.

The production build currently succeeds through:

npm --prefix src/frontend run build

The build process performs TypeScript validation followed by the Vite production build.

---

Build Verification

The current production build has been successfully executed.

The build performs:

TypeScript validation
        ↓
Vite production build
        ↓
Static asset generation
        ↓
ICP asset deployment

The current build generates the frontend distribution under:

src/frontend/dist

The generated distribution contains:

index.html
404.html
manifest.webmanifest
sitemap.xml
assets/
legal/
.well-known/

---

ICP Custom Domain Verification

Valthoris contains the ICP custom-domain verification file:

src/frontend/public/.well-known/ic-domains

Its current content is:

valthoris.com

After the production build, the file is also present at:

src/frontend/dist/.well-known/ic-domains

The deployed ICP frontend successfully returns the verification resource:

https://v63rh-lqaaa-aaaaa-qewvq-cai.icp0.io/.well-known/ic-domains

The observed response is HTTP "200".

This proves that the ICP canister is serving the required verification resource.

The custom-domain process is therefore partially configured and verified at the ICP application layer.

The final DNS routing must still be treated as a separate infrastructure step.

---

Production Frontend

The current ICP frontend can be accessed through:

https://v63rh-lqaaa-aaaaa-qewvq-cai.icp0.io/

The application also exposes application routes such as:

/assistant

The ICP gateway must recognise the requested hostname before a custom domain can serve the application correctly.

An "Unknown Domain" response from the ICP HTTP gateway does not necessarily indicate that the canister itself is broken.

It can indicate that the requested hostname has not yet been correctly associated with the ICP custom-domain configuration.

---

Internet Identity

Valthoris uses Internet Identity for authentication.

The frontend contains an authentication context and authentication service based on the Internet Computer authentication model.

The authentication flow is conceptually:

User
  │
  ▼
Internet Identity
  │
  ▼
Authenticated Principal
  │
  ▼
Valthoris Frontend
  │
  ├── ICP Canisters
  │
  └── Operational Services

Authentication status

🟢 Implemented

Persistence status

🟡 Validation required

Authentication success does not automatically prove that all user profile data or application records are correctly stored and recovered.

Those workflows require independent persistence testing.

---

Identity

The Identity canister is a real Motoko canister.

The implementation contains functionality associated with identifiers and reputation information including:

- phone lookup;
- email lookup;
- domain lookup;
- IBAN lookup;
- wallet address lookup;
- reputation records;
- trust scores;
- risk scores;
- report counts;
- known-scammer state;
- verified-business state;
- suspicious identifier registration;
- batch lookup.

The canister uses persistent actor state and reconstructs runtime indexes after upgrades.

Identity status

Layer| Status
Source code| 🟢
Motoko implementation| 🟢
Canister definition| 🟢
Mainnet deployment| 🟢
Frontend integration| 🟡
End-to-end persistence| 🟡
Production validation| 🟡

The correct statement is:

«Identity functionality is implemented and deployed, while complete production workflow validation remains in progress.»

---

Safe Location

Safe Location is one of the more substantial implemented Valthoris modules.

The current implementation includes persistent state associated with:

- location shares;
- current locations;
- geofence zones;
- share counters;
- geofence counters.

The canister includes functionality for:

- location sharing;
- share expiration;
- share revocation;
- recipient restrictions;
- location updates;
- location retrieval;
- user-owned share listing;
- geofence creation;
- geofence listing;
- geofence deletion;
- coordinate validation;
- geographic distance calculation;
- geofence checking.

The implementation uses persistent actor state and rebuilds transient runtime structures after upgrades.

Safe Location status

Layer| Status
Motoko source| 🟢
Persistent state design| 🟢
ICP canister| 🟢
Frontend| 🟢
Map interface| 🟢
Location sharing workflow| 🟡
Persistence after reload| 🟡
Multi-user validation| 🟡

Therefore:

«Safe Location is implemented and deployed, while complete end-to-end persistence and multi-user production validation remain to be completed.»

---

Safe Rooms

Safe Rooms are the multi-participant side of Safe Location: a short-lived room,
shared by link, where every authorised participant publishes their own position
and sees the other participants of the same room on the same map, together with
a private chat scoped to that room.

Rules enforced by the backend (`supabase/functions/safe-room`) and by database
CHECK constraints:

- at most 30 participants per room;
- at most 24 hours of lifetime, with a visible countdown;
- safety radius chosen by the creator, at most 1000 metres;
- entry only through the share link and after accepting the terms;
- one marker per participant, updated live;
- leaving the room (EXIT) immediately removes that participant's location for
  everybody else, and the creator leaving closes the room;
- participants of other rooms are never visible.

State lives in `safe_rooms`, `safe_room_participants` and `safe_room_messages`.
RLS is enabled with no public policy: because Valthoris authenticates with
Internet Identity the browser has no Supabase session, so the Edge Function is
the single reader/writer, authorising each call with the room token plus a
per-participant secret whose SHA-256 hash is all that is stored.

---

Community

Community functionality exists as a dedicated Motoko canister.

The architecture therefore contains a decentralized component specifically intended for community-related operations.

Current status:

🟡 Implemented / Validation

The critical validation flow is:

User Action
    ↓
Frontend
    ↓
Community Actor
    ↓
Write
    ↓
Read
    ↓
Reload
    ↓
Read Again
    ↓
Data Still Exists

Until this complete cycle is verified, Community should not be described as fully operational.

---

Threat Intelligence

Valthoris contains a dedicated Threat Intelligence Motoko canister.

The canister is independently defined in the ICP deployment configuration.

Current status:

🟡 Implemented / Validation

The existence of a dedicated canister proves the implementation foundation.

It does not by itself prove that Valthoris currently operates a globally comprehensive threat-intelligence network.

Claims regarding coverage, freshness, external feeds, automated enrichment or global intelligence must therefore be tied to independently verified functionality.

---

Persistence Architecture

Valthoris currently contains more than one persistence mechanism.

This is an important architectural distinction.

The principal persistence layers are:

                    VALTHORIS
                         │
             ┌───────────┴───────────┐
             │                       │
             ▼                       ▼
       ICP Persistent State      Supabase
             │                       │
       Motoko Canisters        Operational Services
             │                       │
             ▼                       ▼
       Decentralized Data       Application Data

These layers should not be considered interchangeable.

---

ICP Persistence

Several Motoko canisters use persistent actor state.

For example, Identity uses stable state for its database and rebuilds runtime indexes after upgrades.

Safe Location similarly maintains persistent state for:

- shares;
- locations;
- geofences;
- associated counters.

This provides a genuine decentralized persistence mechanism.

However, the frontend must still be tested to prove that the user-facing workflows correctly write and retrieve this persistent state.

---

Supabase Integration

Supabase is present in the repository as an operational integration layer.

The frontend contains a Supabase client using:

VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY

These are build-time variables: Vite inlines them into the bundle during
`npm run build`, so they must be present when the frontend is built — defining
them afterwards on the host that serves the built assets has no effect. Copy
`src/frontend/.env.example` to `src/frontend/.env` for local development. When
they are missing, the application still starts and logs a warning at startup,
but every Supabase-backed feature remains unavailable.

The browser-side integration is designed around the public anonymous key rather than exposing a service-role key to the browser.

The repository also contains Supabase-related service abstractions associated with areas such as:

- PostgreSQL;
- PGMQ;
- Storage;
- Realtime;
- audit;
- notifications.

This confirms code-level integration.

It does not by itself prove complete production synchronization.

---

Supabase Security Boundary

The intended security boundary is:

Frontend
   │
   │ Public anon key
   ▼
Supabase client
   │
   ▼
RLS / database permissions
   │
   ▼
Supabase services

Sensitive service-role credentials must never be embedded into frontend source code.

Any privileged Supabase operation should remain on a trusted backend/server-side execution boundary.

This is a fundamental security requirement for the platform.

---

Profile Synchronization

The current application contains profile synchronization functionality.

The authentication context can invoke synchronization after authentication.

The profile service contains functionality associated with:

- reading local profile information;
- storing local profile information;
- upserting profile information;
- updating "last_seen";
- retrieving cloud profile information;
- merging profile data.

The integration references a Supabase "profiles" table.

However, the existence of the synchronization code does not prove that production synchronization is currently reliable.

The application contains fallback behaviour.

Therefore:

Code exists
     ↓
Integration exists
     ↓
Fallback exists
     ↓
Production synchronization
     ↓
Requires verification

Current status:

🟠 In Development / Validation

---

Persistence Verification Standard

Valthoris adopts a strict persistence verification procedure.

For every important data workflow:

CREATE
  ↓
WRITE
  ↓
READ
  ↓
RELOAD APPLICATION
  ↓
READ AGAIN
  ↓
DATA STILL EXISTS

For backend persistence:

CREATE
  ↓
CANISTER WRITE
  ↓
CANISTER READ
  ↓
APPLICATION RELOAD
  ↓
CANISTER READ
  ↓
DATA STILL EXISTS

For synchronization:

USER ACTION
     ↓
LOCAL / ICP WRITE
     ↓
SYNC
     ↓
SUPABASE WRITE
     ↓
SUPABASE READ
     ↓
APPLICATION RELOAD
     ↓
DATA STILL EXISTS

A database client being present is not sufficient evidence of persistence.

A write function existing in source code is not sufficient evidence of persistence.

The behaviour must be tested.

---

AI Architecture

Valthoris is designed around artificial intelligence and contains an AI/service architecture.

The intended analysis flow is:

User Input
    │
    ▼
Valthoris Frontend
    │
    ▼
Analysis / API Layer
    │
    ▼
AI Provider
    │
    ▼
Risk / Fraud Analysis
    │
    ▼
Security Result
    │
    ▼
User

The repository contains an abstraction for external AI providers.

This allows the platform to avoid permanently coupling the application to a single model provider.

Possible provider integrations must nevertheless be classified according to actual implementation and deployment status.

---

AI Provider Security

AI provider credentials must never be exposed to the browser.

The intended architecture is:

Browser
   │
   ▼
Trusted API / Backend
   │
   ▼
AI Provider

rather than:

Browser
   │
   └──────► AI Provider using secret API key

The second architecture would expose credentials and is not acceptable for a production security platform.

---

AI Status

Capability| Status
AI service abstraction| 🟡 Implemented / Validation
Provider abstraction| 🟡 Implemented / Validation
AI configuration| 🟡 Environment dependent
Complete production request pipeline| 🟡 Validation
Production AI result persistence| 🟡 Validation
Fully verified end-to-end fraud analysis| 🟡 Validation

Valthoris will not claim a complete operational AI pipeline until it has been verified from user input through to the final production response.

---

AutoShield

AutoShield represents the intended real-time protection layer of Valthoris.

Its long-term objective is to provide continuous protection and automated security analysis around user activity and potentially suspicious events.

Current status:

🟠 In Development

The repository contains AutoShield-related architecture and implementation components, but the complete real-time protection pipeline must be validated before it can be described as fully operational.

---

Security Architecture

Valthoris is designed around three principal security principles.

Security by Design

Security requirements are considered during architecture and implementation rather than being treated solely as a later security review.

Examples include:

- authentication boundaries;
- least-privilege access;
- separation of public and privileged credentials;
- decentralized backend components;
- persistent actor state;
- security-oriented data handling.

Privacy by Design

The platform is designed to consider:

- data minimisation;
- purpose limitation;
- access control;
- protection of personal data;
- separation of operational services;
- controlled data exposure;
- auditability.

Zero Trust

Valthoris follows a Zero Trust architectural direction in which:

- identities should be explicitly authenticated;
- requests should be authorised;
- internal location should not automatically imply trust;
- services should be independently validated;
- access should follow least-privilege principles.

These principles describe the architecture and security objectives.

They do not constitute a claim that every future security control has already been implemented.

---

NIS2 Security Alignment

Valthoris is being designed with the cybersecurity risk-management principles and organisational expectations associated with the EU NIS2 framework in mind.

The project therefore considers areas such as:

- cybersecurity risk management;
- incident handling;
- business continuity;
- disaster recovery;
- crisis management;
- supply-chain security;
- secure development;
- vulnerability management;
- access control;
- authentication;
- cryptographic protection where appropriate;
- logging and monitoring;
- security governance;
- incident reporting processes;
- business resilience;
- third-party risk.

However:

«Valthoris does not claim formal NIS2 compliance merely because these principles appear in the architecture.»

Formal compliance depends on the applicable legal scope, organisational role, sector, jurisdiction, technical controls, governance processes, evidence, risk assessments and potentially independent legal or security assessment.

The appropriate project description is therefore:

NIS2-aligned security architecture and development approach

rather than:

NIS2 Certified, NIS2 Compliant, or NIS2 Ready.

---

GDPR and Data Protection

Valthoris is designed with data-protection principles in mind, including:

- data minimisation;
- purpose limitation;
- access control;
- authentication;
- privacy by design;
- controlled processing;
- security of personal data;
- retention considerations;
- auditability.

The project does not use a generic claim of:

GDPR COMPLIANT

without a formal legal and organisational assessment.

Instead, Valthoris should be described as:

«Designed with GDPR and privacy-by-design principles in mind.»

Actual GDPR compliance depends on the complete processing activities, purposes, legal bases, data flows, retention policies, data-subject rights, processor/controller relationships, security measures and organisational procedures applicable to the deployed service.

---

Regulatory Documentation Principle

Valthoris will not use regulatory compliance badges merely as marketing claims.

The following claims require appropriate evidence before being used:

- GDPR Compliant;
- NIS2 Compliant;
- NIS2 Ready;
- ISO certified;
- SOC certified;
- PCI compliant;
- legally approved;
- government approved;
- law-enforcement approved.

Where formal certification or legal assessment has not occurred, the README will use accurate language such as:

- designed with;
- aligned with;
- informed by;
- security-oriented;
- privacy-oriented;
- intended to support;
- under assessment.

This approach protects both the credibility of the project and the integrity of its technical documentation.

---

Roadmap

The following capabilities are part of the Valthoris roadmap and should not currently be interpreted as fully operational production capabilities unless independently verified.

Audio Intelligence

🔵 Planned

Future functionality may include analysis of suspicious audio and voice-related fraud indicators.

---

Visual Intelligence

🔵 Planned

Future functionality may include image and visual-content analysis for fraud and security signals.

---

Malware Intelligence

🔵 Planned

Future functionality may include deeper malware and malicious-file analysis.

---

Enterprise SIEM / SOAR

🔵 Planned

Future enterprise capabilities may include integrations with:

- SIEM platforms;
- SOAR platforms;
- security operations workflows;
- enterprise incident-response systems.

No claim is made that these integrations are currently operational.

---

Banking Integrations

🔵 Planned

Future integrations may target financial institutions and payment-security environments.

Any such integration would require:

- technical integration;
- security assessment;
- contractual agreements;
- regulatory assessment;
- appropriate data-processing arrangements.

---

Institutional Integrations

🔵 Planned

Future integrations may involve public-sector or institutional environments.

Such integrations would require independent technical, legal, security and procurement processes.

---

Advanced Blockchain Intelligence

🔵 Planned / Research

Future work may expand blockchain and crypto-security intelligence across multiple networks.

Specific network coverage, risk models, transaction analysis and automated detection capabilities must not be represented as operational until implemented and independently verified.

---

Target Architecture

The future Valthoris architecture may evolve toward a more complete security-analysis and decision platform.

                         ┌──────────────────────┐
                         │        USERS         │
                         └──────────┬───────────┘
                                    │
                                    ▼
                         ┌──────────────────────┐
                         │ Valthoris Experience │
                         │   Web / PWA / Mobile │
                         └──────────┬───────────┘
                                    │
                                    ▼
                         ┌──────────────────────┐
                         │   Security Gateway   │
                         └──────────┬───────────┘
                                    │
                 ┌──────────────────┼──────────────────┐
                 ▼                  ▼                  ▼
             Identity           AI Analysis       Threat Intel.
                 │                  │                  │
                 └──────────────────┼──────────────────┘
                                    ▼
                              Risk Engine
                                    │
                  ┌─────────────────┼─────────────────┐
                  ▼                 ▼                 ▼
              AutoShield        Reputation        Detection
                  │                 │                 │
                  └─────────────────┼─────────────────┘
                                    ▼
                              Decision Layer
                                    │
                         ┌──────────┴──────────┐
                         ▼                     ▼
                    User Alert             Protection
                                   
                         ┌──────────┴──────────┐
                         ▼                     ▼
                        ICP                Supabase
                  Decentralized          Operational
                     Layer                  Layer

This is target architecture.

It must not be interpreted as a description of the complete current production system.

---

Repository Structure

The repository should be understood according to the actual project structure rather than an aspirational directory diagram.

The principal areas currently include:

Valthoris-llm/
│
├── dfx.json
├── README.md
│
├── src/
│   └── frontend/
│       ├── public/
│       │   ├── .well-known/
│       │   │   └── ic-domains
│       │   ├── legal/
│       │   ├── manifest.webmanifest
│       │   ├── sitemap.xml
│       │   ├── valthoris-logo.png
│       │   └── valthoris-shield.png
│       │
│       ├── src/
│       │
│       ├── dist/
│       │
│       ├── package.json
│       ├── package-lock.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── index.html
│       └── 404.html
│
└── ...

The exact repository structure may evolve as development continues.

Documentation should therefore be updated whenever major architectural changes are introduced.

---

Build Requirements

The frontend currently requires a working Node.js/npm environment.

From the repository root:

npm --prefix src/frontend run build

The build performs:

tsc --noEmit
        ↓
vite build

A successful build is required before deployment.

---

ICP Deployment

The frontend is deployed through DFX.

The general deployment workflow is:

dfx deploy frontend --network ic

When using an insecure plaintext mainnet identity, DFX may block the operation.

The recommended long-term approach is to use a secure DFX identity.

For environments where the operator explicitly understands the security implications, the warning can be temporarily suppressed through the environment configuration required by DFX.

Mainnet operations should always be performed carefully because they can control real canisters and consume real cycles.

---

Deployment Principle

Valthoris follows this deployment sequence:

Source Code
    ↓
TypeScript Validation
    ↓
Production Build
    ↓
Artifact Verification
    ↓
DFX Deployment
    ↓
ICP Canister
    ↓
Live Production
    ↓
End-to-End Verification

A successful deployment command alone does not prove that every application workflow works correctly.

---

Production Verification

Production verification should include:

1. open the live frontend;
2. authenticate;
3. inspect the authenticated principal;
4. test profile operations;
5. test backend operations;
6. test Identity operations;
7. test Community operations;
8. test Safe Location;
9. test Threat Intelligence;
10. reload the application;
11. repeat reads;
12. verify persistence;
13. test multi-user access where applicable;
14. test error handling;
15. verify security boundaries.

Only after successful testing should a capability be upgraded from 🟡 to 🟢.

---

Persistence Audit

The Valthoris persistence audit follows a module-by-module approach.

Profile

Profile
   ↓
Frontend
   ↓
Backend / persistence layer
   ↓
Write
   ↓
Read
   ↓
Reload
   ↓
Read again

Community

Community action
   ↓
Community actor
   ↓
Write
   ↓
Read
   ↓
Reload
   ↓
Read again

Safe Location

Create share/geofence
   ↓
Safe Location canister
   ↓
Write
   ↓
Read
   ↓
Reload
   ↓
Read again

Identity

Create/update identity record
   ↓
Identity canister
   ↓
Write
   ↓
Lookup
   ↓
Reload
   ↓
Lookup again

Threat Intelligence

Threat record
   ↓
Threat Intelligence canister
   ↓
Write / update
   ↓
Lookup
   ↓
Reload
   ↓
Lookup again

---

Production Verification Matrix

The following matrix defines the evidence required for each component.

Component| Source| Build| Deploy| Production| Persistence| Current State
Frontend| ✅| ✅| ✅| ✅| N/A| 🟢
Internet Identity| ✅| ✅| ✅| ✅| 🟡| 🟢/🟡
Backend ICP| ✅| ✅| ✅| 🟡| 🟡| 🟡
Identity| ✅| ✅| ✅| 🟡| 🟡| 🟡
Community| ✅| ✅| ✅| 🟡| 🟡| 🟡
Safe Location| ✅| ✅| ✅| 🟡| 🟡| 🟡
Threat Intelligence| ✅| ✅| ✅| 🟡| 🟡| 🟡
Profile| ✅| ✅| ✅| 🟡| 🟡| 🟡
Supabase integration| ✅| ✅| Configuration-dependent| 🟡| 🟡| 🟡
Supabase synchronization| ✅| ✅| Configuration-dependent| 🟡| 🟡| 🟠
AI architecture| ✅| ✅| Configuration-dependent| 🟡| 🟡| 🟡
AI end-to-end pipeline| ✅| 🟡| 🟡| 🟡| 🟡| 🟡
AutoShield| ✅| 🟡| 🟡| 🟡| 🟡| 🟠
Custom domain verification| ✅| ✅| ✅| ✅| N/A| 🟢
Final custom-domain routing| ✅| N/A| DNS-dependent| 🟡| N/A| 🟡

---

What Valthoris Can Demonstrate Today

Based on the current repository and deployment evidence, Valthoris can demonstrate:

- a real React/TypeScript frontend;
- a production Vite build;
- deployment to the Internet Computer;
- a real ICP frontend canister;
- multiple Motoko backend canisters;
- Internet Identity integration;
- a dedicated Identity canister;
- a dedicated Community canister;
- a dedicated Threat Intelligence canister;
- a dedicated Safe Location canister;
- persistent state mechanisms in selected Motoko actors;
- a custom-domain verification resource;
- Supabase integration code;
- AI/service architecture;
- security-oriented application design;
- an explicit roadmap and implementation-status model.

---

What Still Requires Verification

The following areas require further end-to-end testing before being represented as fully operational:

- complete profile persistence;
- complete profile synchronisation;
- Community write/read persistence;
- Safe Location persistence after reload;
- Safe Location multi-user workflows;
- Identity frontend workflows;
- Threat Intelligence frontend workflows;
- complete AI request pipeline;
- production AI response handling;
- AI result persistence;
- Supabase production synchronization;
- complete integration between ICP and operational services;
- final custom-domain routing;
- broader security and compliance validation.

---

What Is Not Currently Claimed

Valthoris does not currently claim that the following are fully operational:

- global fraud prevention coverage;
- universal scam detection;
- fully autonomous fraud prevention;
- complete real-time AI protection;
- complete malware analysis;
- complete audio intelligence;
- complete visual intelligence;
- enterprise SIEM integration;
- enterprise SOAR integration;
- banking integrations;
- law-enforcement integrations;
- government integrations;
- universal blockchain intelligence;
- complete multi-chain risk coverage;
- formal GDPR compliance;
- formal NIS2 compliance;
- ISO certification;
- SOC certification;
- regulatory approval.

These may be future capabilities, integration objectives or areas under development.

---

Security Development Lifecycle

Valthoris development should follow a controlled lifecycle:

Requirement
    ↓
Threat Model
    ↓
Architecture
    ↓
Implementation
    ↓
Security Review
    ↓
Testing
    ↓
Deployment
    ↓
Production Verification
    ↓
Monitoring
    ↓
Incident Response
    ↓
Continuous Improvement

Security should not be treated as a final stage.

---

Secure Development Principles

Development should prioritise:

- secure defaults;
- input validation;
- output encoding;
- authentication;
- authorisation;
- least privilege;
- secrets management;
- dependency management;
- vulnerability remediation;
- logging;
- monitoring;
- auditability;
- error handling;
- secure configuration;
- protection of sensitive data.

---

Secrets Management

Sensitive credentials must not be committed to the repository.

Examples include:

AI provider API keys
Supabase service-role keys
private signing keys
administrative credentials
deployment credentials
database passwords
third-party secrets

Frontend environments may contain public configuration such as:

VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY

but public browser configuration must never be confused with privileged secrets.

---

Access Control

Valthoris follows a least-privilege approach.

Access should be granted according to:

Identity
   +
Authentication
   +
Authorisation
   +
Required Permission
   ↓
Allowed Operation

Authentication alone must not automatically imply unrestricted access.

---

Data Protection

Sensitive information must be handled according to:

- purpose limitation;
- data minimisation;
- access control;
- retention requirements;
- security requirements;
- appropriate legal basis;
- user rights;
- secure transmission;
- secure storage;
- controlled disclosure.

The exact legal and organisational obligations depend on the deployment context.

---

Incident Response

A mature Valthoris deployment should maintain procedures for:

1. detection;
2. triage;
3. containment;
4. investigation;
5. eradication;
6. recovery;
7. notification where legally required;
8. post-incident review;
9. corrective action.

These procedures are part of the security maturity roadmap and must be operationalised before claiming complete organisational compliance.

---

Supply Chain Security

Valthoris depends on software libraries and external services.

Future production hardening should include:

- dependency inventory;
- dependency updates;
- vulnerability scanning;
- lockfile management;
- software provenance;
- build reproducibility;
- controlled third-party integrations;
- secret management;
- dependency review.

The "package-lock.json" file is maintained as part of the frontend dependency structure.

---

Auditability

A security platform must be capable of explaining important security events.

The long-term audit architecture should provide evidence for:

Who
 ↓
Did what
 ↓
When
 ↓
Using which identity
 ↓
Against which resource
 ↓
With which result

Where legally and technically appropriate, security-relevant actions should be logged in a controlled and tamper-resistant manner.

---

Responsible AI

AI capabilities within Valthoris should follow principles including:

- explainability where practical;
- controlled use of automated decisions;
- human oversight where appropriate;
- protection of sensitive information;
- prevention of unnecessary data exposure;
- model-output validation;
- abuse prevention;
- secure provider integration;
- auditability;
- clear separation between automated analysis and confirmed facts.

AI output should not automatically be treated as proof of criminal activity or malicious intent.

Risk scores and AI assessments should be treated as security signals requiring appropriate interpretation.

---

Risk Scoring

Where Valthoris produces risk scores, the score should represent an analytical security signal rather than an unquestionable conclusion.

A conceptual model is:

Observed Signals
       │
       ├── Identity signals
       ├── Reputation signals
       ├── Threat intelligence
       ├── Behavioural signals
       ├── Historical reports
       └── Context
              │
              ▼
        Risk Analysis
              │
              ▼
         Risk Score
              │
              ▼
      Security Decision

The exact scoring methodology must be documented and validated before being represented as a formally calibrated risk model.

---

Privacy and False Positives

Fraud prevention systems must account for false positives.

A suspicious indicator does not automatically mean that a person, organisation, account or identifier is malicious.

Valthoris should therefore distinguish between:

- observed indicator;
- reported information;
- automated assessment;
- verified information;
- confirmed malicious activity.

This distinction is essential for responsible security intelligence.

---

Legal and Ethical Principles

Valthoris is intended to support fraud prevention and cybersecurity.

It is not intended to:

- unlawfully identify individuals;
- facilitate harassment;
- enable unlawful surveillance;
- expose private information without a lawful basis;
- make unsupported criminal allegations;
- bypass access controls;
- facilitate cyber abuse.

Security intelligence must be handled according to applicable law and legitimate security purposes.

---

Production Readiness

Production readiness is not defined solely by:

Build successful

or:

Canister deployed

A production-ready component should satisfy:

Source Code
     ↓
Build
     ↓
Deployment
     ↓
Authentication
     ↓
Authorisation
     ↓
Write
     ↓
Read
     ↓
Reload
     ↓
Persistence
     ↓
Error Handling
     ↓
Security Validation
     ↓
Production Verification

---

Release Criteria

Before a feature is classified as 🟢 Operational, Valthoris should verify:

- source code exists;
- build succeeds;
- deployment succeeds;
- frontend integration works;
- authentication works;
- authorisation works;
- write operation works;
- read operation works;
- data survives reload;
- data survives relevant upgrades;
- invalid input is handled;
- unauthorised access is rejected;
- security-sensitive operations are logged where appropriate;
- production behaviour is verified.

---

Development Roadmap

Phase 1 — Production Baseline

Focus:

- repository integrity;
- production deployment;
- frontend stability;
- canister verification;
- authentication;
- domain configuration.

Status:

🟢 / 🟡

---

Phase 2 — Persistence

Priority:

1. Profile
2. Community
3. Safe Location
4. Identity
5. Threat Intelligence
6. Backend services

Every workflow follows the persistence verification standard.

Status:

🟡

---

Phase 3 — AI

Validate:

Frontend
   ↓
Trusted API
   ↓
AI Provider
   ↓
Analysis
   ↓
Result
   ↓
Frontend
   ↓
Persistence

Status:

🟡

---

Phase 4 — Operational Services

Validate:

- Supabase;
- PostgreSQL;
- Realtime;
- Storage;
- queues;
- notifications;
- audit services;
- synchronization.

Status:

🟠 / 🟡

---

Phase 5 — AutoShield

Build and validate:

- real-time detection;
- security event processing;
- risk evaluation;
- user alerts;
- protection actions;
- audit trails.

Status:

🟠

---

Phase 6 — Advanced Intelligence

Future work:

- audio intelligence;
- visual intelligence;
- malware intelligence;
- advanced blockchain intelligence;
- broader threat intelligence;
- enterprise integrations.

Status:

🔵 / ⚪

---

Custom Domain

The intended public domain is:

valthoris.com

The ICP frontend currently has the domain verification resource:

/.well-known/ic-domains

with:

valthoris.com

The ICP canister successfully serves this resource.

The final DNS configuration must be maintained independently from the application source code.

DNS changes should be performed carefully and only after confirming the required ICP custom-domain configuration.

Existing unrelated DNS records should not be modified unnecessarily.

---

Current DNS Principle

The Valthoris domain should use the minimum DNS changes required to establish the intended production routing.

Unrelated records should remain untouched unless there is a specific technical reason to change them.

This reduces the risk of:

- email disruption;
- verification failures;
- unrelated service outages;
- accidental DNS takeover;
- configuration drift.

---

Testing Strategy

Testing should occur at several levels.

Unit Testing

Individual functions and modules.

Integration Testing

Frontend-to-canister and service-to-service communication.

Persistence Testing

Write/read/reload/upgrade verification.

Security Testing

Authentication, authorisation, input validation and access-control testing.

Production Testing

Verification against the actual deployed environment.

Regression Testing

Ensuring fixes do not break previously verified functionality.

---

Audit Methodology

Every major Valthoris component should eventually have an evidence record containing:

Component
Source file
Function
Canister
Canister ID
Frontend integration
Build result
Deployment result
Production URL
Write test
Read test
Reload test
Upgrade test
Security test
Final status

This makes the project auditable rather than dependent on assumptions.

---

Evidence-Based Documentation

Valthoris documentation follows an evidence hierarchy.

Strong evidence:

1. live production test;
2. successful end-to-end workflow;
3. deployed canister behaviour;
4. integration test;
5. build result;
6. source code.

Weaker evidence:

- UI presence;
- documentation;
- architecture diagrams;
- roadmap specifications.

A feature should not be classified as operational based solely on weaker evidence.

---

What "Implemented" Means

Implemented means that meaningful source code exists for the capability.

It does not necessarily mean:

- production validated;
- fully integrated;
- persistent;
- secure under all conditions;
- complete;
- compliant;
- commercially ready.

---

What "Operational" Means

Operational means:

«The feature has been implemented, deployed and verified through the relevant production workflow.»

This is the highest standard used by this README.

---

What "Planned" Means

Planned means:

«The capability is part of the Valthoris roadmap but is not currently being represented as an operational production feature.»

Planned capabilities remain part of the product vision.

---

What "Research" Means

Research means:

«The concept is being investigated or evaluated and may become a future implementation.»

Research items must not be presented as product capabilities.

---

Project Philosophy

Valthoris is being built around a simple principle:

«Build first. Verify second. Claim third.»

The project should never reverse that order.

The objective is not to create the appearance of a complete cybersecurity platform.

The objective is to build a platform that can withstand technical scrutiny.

---

Transparency

Valthoris intentionally documents incomplete areas.

This is not considered a weakness.

A cybersecurity platform is more credible when it clearly distinguishes:

What exists
      ↓
What works
      ↓
What has been verified
      ↓
What is being developed
      ↓
What is planned

This approach is particularly important for institutional and professional environments.

---

Institutional Readiness Direction

Future institutional deployments may require additional work in areas such as:

- formal risk assessments;
- documented security policies;
- incident-response procedures;
- business continuity;
- disaster recovery;
- vulnerability management;
- security monitoring;
- access governance;
- supplier risk management;
- privacy assessments;
- data-processing agreements;
- retention policies;
- audit procedures;
- formal compliance assessments.

These requirements should be addressed according to the specific organisation, sector and jurisdiction.

---

Security and Compliance Position

Valthoris is being developed with security and regulatory requirements in mind.

The project specifically aims to support an architecture compatible with:

- Security by Design;
- Privacy by Design;
- Zero Trust principles;
- GDPR-oriented data protection practices;
- NIS2-oriented cybersecurity risk management;
- secure software development;
- operational resilience.

Formal compliance must be determined through the appropriate legal, organisational and technical assessment.

---

Disclaimer

Valthoris is a cybersecurity and fraud-prevention technology project.

Nothing in this README constitutes:

- legal advice;
- regulatory certification;
- formal compliance certification;
- a guarantee of security;
- a guarantee of fraud detection;
- a guarantee of risk-score accuracy;
- a government endorsement;
- law-enforcement endorsement;
- financial advice.

Regulatory and legal claims must be independently assessed against the actual deployment, organisation, jurisdiction and applicable legislation.

---

Current Development Priority

The immediate technical priority is not to add more features simply because they exist in the roadmap.

The immediate priority is:

Production
    ↓
Persistence
    ↓
Integration
    ↓
AI validation
    ↓
Security validation
    ↓
Documentation
    ↓
Expansion

The project should first prove that existing functionality works reliably.

Only then should additional complexity be introduced.

---

Valthoris Development Rule

Every new feature should follow:

Specification
      ↓
Implementation
      ↓
Build
      ↓
Integration
      ↓
Security Review
      ↓
Production Deployment
      ↓
End-to-End Verification
      ↓
Documentation

No feature should be documented as operational before the verification stage.

---

Conclusion

Valthoris is a real software platform with:

- a React/TypeScript frontend;
- PWA capabilities;
- Internet Identity authentication;
- an Internet Computer deployment;
- multiple Motoko backend canisters;
- decentralized persistence mechanisms;
- Identity functionality;
- Community functionality;
- Safe Location functionality;
- Threat Intelligence infrastructure;
- Supabase integration;
- AI/service architecture;
- an expanding cybersecurity roadmap.

The platform is substantial, but it is still undergoing validation and development.

The project deliberately avoids presenting future capabilities as completed functionality.

Its development direction is based on:

«Security by Design.»

«Privacy by Design.»

«Zero Trust.»

«Evidence-based engineering.»

«Transparent implementation status.»

«NIS2-oriented cybersecurity practices.»

«Responsible handling of personal and security-sensitive information.»

The long-term objective is to evolve Valthoris into a robust cybersecurity and fraud-prevention platform capable of supporting individuals, organisations and institutional environments while maintaining a clear distinction between implemented technology, verified production capabilities and future research.

---

Valthoris

AI Cybersecurity & Fraud Prevention

Build.
Verify.
Secure.
Protect.

Project: Valthoris
Repository: Valthoris-llm
Infrastructure: Internet Computer Protocol
Frontend: React + TypeScript + Vite
Backend: Motoko Canisters
Authentication: Internet Identity
Operational Data Layer: Supabase integration
Architecture: Security by Design · Privacy by Design · Zero Trust

---

Documentation Integrity Statement

«If a capability cannot be demonstrated, it will not be described as operational.»

This is a permanent principle of the Valthoris project.