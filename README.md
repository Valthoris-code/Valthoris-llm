

# VALTHORIS

<div align="center">

<img src="documentos/valthoris-desktop-scene.png" alt="Valthoris" width="850">

<br>

## AI CYBERSECURITY & FRAUD PREVENTION

### Intelligence · Prevention · Protection

</div>

---
VALTHORIS

""Project" 

AI CYBERSECURITY & FRAUD PREVENTION

Intelligence · Prevention · Protection

Valthoris is an AI-oriented cybersecurity and fraud-prevention platform designed to help users identify suspicious digital activity, analyse security indicators and receive contextual security guidance.

The platform combines:

- Artificial intelligence
- Threat intelligence
- Identity intelligence
- Fraud analysis
- Security-oriented scanning
- Community intelligence
- Decentralized infrastructure
- Operational cloud services
- Real-time protection concepts
- Privacy and security controls

Valthoris is being developed with a simple objective:

«Build first. Verify second. Claim third.»

The project deliberately distinguishes between technology that exists in the repository, functionality that has been deployed, functionality that has been production-tested, functionality still under validation, and future capabilities.

---

1. Project Vision

The long-term objective of Valthoris is to evolve into a comprehensive cybersecurity and fraud-prevention platform capable of assisting individuals, organisations and, where appropriate, institutional environments.

The platform is intended to provide a security layer capable of analysing multiple classes of digital indicators, including:

- Telephone numbers
- Email addresses
- URLs
- Domains
- IP addresses
- IBANs
- Cryptocurrency addresses
- Messages
- QR codes
- Files
- Suspicious communications
- Places and organisations
- Potential phishing indicators
- Fraud-related evidence
- Security events

The system is designed to combine multiple signals rather than relying on a single provider or a single database.

A security result should therefore be understood as an analytical assessment based on available evidence, not automatically as proof of criminal activity.

---

2. Core Principles

Valthoris is being developed around the following principles.

Security by Design

Security requirements are considered during architecture, implementation, integration and deployment rather than being treated exclusively as a final review stage.

Privacy by Design

The platform aims to minimise unnecessary collection and exposure of personal information.

Zero Trust

Authentication does not automatically imply authorisation.

Every security-sensitive operation should be explicitly authenticated, authorised and limited according to the required permissions.

Least Privilege

Credentials, services, users and backend operations should receive only the permissions required for their specific purpose.

Data Minimisation

Only information necessary for the relevant security function should be processed.

Responsible AI

AI-generated assessments are treated as security signals and analytical assistance.

They should not automatically be interpreted as confirmed facts, criminal accusations or definitive identity determinations.

Evidence-Based Engineering

A feature is not considered operational merely because:

- it exists in the interface;
- source code exists;
- an API is configured;
- a database table exists;
- a deployment succeeded.

Production status requires appropriate verification.

---

3. Documentation Integrity

This README follows a strict documentation principle:

«Documentation must describe the system that exists today, not the system we intend to build tomorrow.»

Therefore Valthoris uses explicit implementation states.

Status| Meaning
🟢 Operational| Implemented, deployed and verified in the relevant production workflow
🟡 Implemented / Validation| Implementation exists, but complete production validation is still required
🟠 In Development| Partial implementation exists and active development continues
🔵 Planned| Defined roadmap functionality not currently represented as operational
⚪ Research| Experimental or future investigation

A feature must not be upgraded to 🟢 merely because it is visible in the UI.

---

4. Current Project Status

Valthoris is a real working software project with a deployed ICP frontend, multiple Motoko canisters, authentication infrastructure, security-oriented modules and operational service integrations.

However, the platform remains under active development and systematic validation.

Component| Current Status
Valthoris Web Application| 🟢 Operational
React / TypeScript / Vite frontend| 🟢 Operational
ICP frontend deployment| 🟢 Operational
Internet Identity| 🟢 Implemented
ICP backend| 🟡 Validation
Identity Intelligence| 🟡 Validation
Community| 🟡 Validation
Safe Location| 🟡 Validation
Safe Rooms| 🟡 Validation
Threat Intelligence| 🟡 Validation
Profile persistence| 🟡 Validation
Supabase integration| 🟡 Validation
Supabase synchronization| 🟠 Development / Validation
AI architecture| 🟡 Validation
AI request/response pipeline| 🟡 Validation
AI result persistence| 🟡 Validation
Universal Scanner| 🟡 Validation
Place Intelligence| 🟡 Validation
AutoShield| 🟠 In Development
Audio Intelligence| 🔵 Planned
Visual Intelligence| 🔵 Planned
Malware Intelligence| 🔵 Planned
Enterprise SIEM / SOAR| 🔵 Planned
Banking integrations| 🔵 Planned
Institutional integrations| 🔵 Planned
Advanced blockchain intelligence| 🔵 Planned / Research

---

5. Architecture

Valthoris currently uses a modular architecture combining decentralized ICP infrastructure with operational services.

                         ┌──────────────────────────┐
                         │          USERS           │
                         │                          │
                         │ Web / PWA / Mobile       │
                         └────────────┬─────────────┘
                                      │
                                      ▼
                         ┌──────────────────────────┐
                         │    VALTHORIS FRONTEND    │
                         │                          │
                         │ React + TypeScript + Vite │
                         │ PWA / Security UI        │
                         └────────────┬─────────────┘
                                      │
                 ┌────────────────────┼────────────────────┐
                 │                    │                    │
                 ▼                    ▼                    ▼
        Internet Identity           ICP               Supabase
                 │                    │                    │
                 │          ┌─────────┼─────────┐          │
                 │          │         │         │          │
                 │          ▼         ▼         ▼          │
                 │       Backend  Identity  Community      │
                 │          │         │         │          │
                 │          ▼         ▼         ▼          │
                 │      Threat     Safe      Other         │
                 │      Intel.    Location   Services      │
                 │                                             │
                 └───────────────────┬─────────────────────────┘
                                     │
                                     ▼
                              AI / Security Layer
                                     │
                                     ▼
                              Risk / Analysis
                                     │
                                     ▼
                              User Protection

The architecture is modular by design.

The existence of a component does not automatically mean that every component is connected through a fully verified production pipeline.

---

6. Internet Computer Infrastructure

Valthoris uses the Internet Computer Protocol (ICP) as its decentralized application and backend infrastructure.

The repository defines multiple Motoko canisters.

Canister| Technology| Role| Status
"frontend"| ICP Assets / React| Web application| 🟢
"backend"| Motoko| Core backend| 🟡
"community"| Motoko| Community functionality| 🟡
"identity"| Motoko| Identity intelligence| 🟡
"threat_intelligence"| Motoko| Threat intelligence| 🟡
"safe_location"| Motoko| Location / geofencing| 🟡

The exact deployment identifiers should always be verified against the current repository and live deployment before formal release or audit documentation.

---

7. Frontend

The Valthoris frontend is a real React/TypeScript application built with Vite.

The frontend contains application areas including:

- Authentication
- Profile
- AI Assistant
- Universal Scanner
- Threat Intelligence
- Identity Intelligence
- Global Radar
- Safe Location
- Safe Rooms
- Community
- Security navigation
- Legal and privacy information
- Operational security interfaces

The frontend is not intended to be a static mock-up.

Nevertheless, a functional interface alone does not prove that every underlying workflow is production-ready.

---

8. Authentication

Valthoris uses Internet Identity for authentication.

The conceptual authentication flow is:

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

Authentication status:

🟢 Implemented

Complete persistence and cross-service authorisation remain subject to production validation.

---

9. AI Architecture

Artificial intelligence is a central component of Valthoris.

The intended security-analysis flow is:

User Input
    │
    ▼
Valthoris Frontend
    │
    ▼
AI / Analysis Gateway
    │
    ├── Threat Intelligence
    ├── Identity Intelligence
    ├── External Security Providers
    ├── Contextual Intelligence
    └── Risk Analysis
    │
    ▼
AI / Security Reasoning
    │
    ▼
Validated Security Result
    │
    ▼
Valthoris User Interface

AI provider credentials must never be exposed to the browser.

The intended architecture is:

Browser
   │
   ▼
Trusted Backend
   │
   ▼
AI Provider

and not:

Browser
   │
   └──────► AI Provider using privileged API key

---

10. AI Chat

The Valthoris AI assistant is implemented around the "ai-chat" service architecture.

The AI layer is intended to support both security analysis and useful contextual assistance.

Examples include:

- Analysing suspicious URLs
- Analysing phone numbers
- Analysing email addresses
- Analysing IBANs
- Analysing cryptocurrency addresses
- Analysing suspicious messages
- Providing security recommendations
- Interpreting intelligence returned by external providers
- Providing contextual security information
- Handling factual place/entity requests where the place-intelligence pipeline is available

The AI response pipeline must remain resilient.

A temporary failure of one external provider should not unnecessarily cause the entire request to fail.

Provider failures should be represented as unavailable evidence rather than fabricated evidence.

---

11. Intelligence Orchestration

Valthoris uses an intelligence-orchestration approach in which different providers may contribute evidence.

Examples include:

- IP reputation
- Domain reputation
- URL analysis
- Malware intelligence
- Phone validation
- Email intelligence
- IBAN validation
- Cryptocurrency intelligence
- Threat databases
- Public information sources

The system should distinguish between:

Provider available
Provider unavailable
Provider returned no evidence
Provider returned suspicious evidence
Provider returned conflicting evidence

An unavailable provider must not be interpreted as evidence of maliciousness.

---

12. Universal Scanner

The Valthoris scanner is designed as a unified analysis entry point.

Potential input types include:

- URLs
- Domains
- IP addresses
- Phone numbers
- Email addresses
- IBANs
- Cryptocurrency addresses
- QR codes
- Messages
- Files
- Other security indicators

The scanner should route the input to the appropriate intelligence pipeline.

The objective is to avoid forcing the user to understand which security provider or technical database is required.

The user provides the indicator.

Valthoris determines the appropriate analysis path.

---

13. Phone Intelligence

Telephone-number analysis may include:

- Number validation
- Country identification
- Geographic information
- Line type
- Provider information where available
- Reputation intelligence
- Spam/fraud indicators
- Public complaint data where applicable
- Cross-provider evidence
- Confidence assessment

The system must clearly distinguish:

valid number

from:

trusted number

and:

confirmed legitimate contact

These are not equivalent concepts.

A technically valid number may still be used for fraud.

---

14. IBAN Intelligence

IBAN analysis may include:

- Structural validation
- Check-digit validation
- Country validation
- Bank-code validation where supported
- Provider intelligence
- Reputation evidence where available

A valid IBAN does not prove:

- ownership;
- beneficiary identity;
- legitimacy of the transaction;
- absence of fraud.

Valthoris should therefore treat IBAN validation as one component of the overall security assessment.

---

15. URL and Domain Intelligence

URL and domain analysis can incorporate external security intelligence such as:

- VirusTotal
- URLScan
- Domain reputation
- Threat intelligence
- Historical observations
- Security classifications
- Suspicious indicators

The result should distinguish between:

- malicious;
- suspicious;
- inconclusive;
- legitimate / no evidence of risk.

Absence of a malicious detection is not equivalent to a universal guarantee of safety.

---

16. Place Intelligence

Valthoris also supports a factual-information path for real-world places and organisations.

Examples include requests such as:

- "Preciso do contacto da PSP de Évora."
- "Qual é o telefone do hospital?"
- "Onde fica determinada instituição?"
- "Qual é a morada de uma empresa?"
- "Qual é o site oficial deste serviço?"

The intended architecture is:

User place request
       │
       ▼
Place detection
       │
       ▼
Nominatim / OpenStreetMap
       │
       ├── Name
       ├── Address
       ├── Location
       └── Geographic evidence
       │
       ▼
Missing information?
       │
       ├── No ─────────────► Build result
       │
       └── Yes
             │
             ▼
        Web fallback
             │
             ├── Telephone
             ├── Official website
             ├── Additional address information
             └── Supporting sources
             │
             ▼
       Structured response

The target result should provide, where available:

- Official or commonly recognised name
- Address
- Telephone
- Website
- Map location
- Supporting sources
- Relevant contextual information
- Timestamp of retrieval

The system should not invent contact details when sources do not provide them.

---

17. Threat Intelligence

Valthoris contains a dedicated Threat Intelligence architecture.

The long-term objective is to correlate information from multiple sources into a broader security picture.

Potential intelligence categories include:

- Malicious IPs
- Malicious domains
- Phishing URLs
- Malware indicators
- Fraud indicators
- Cryptocurrency addresses
- Reported identifiers
- Security events
- Community reports
- External threat feeds

Threat intelligence coverage must always be described according to the sources actually available and operational.

Valthoris does not claim universal global threat coverage merely because a threat-intelligence module exists.

---

18. Identity Intelligence

The Identity canister provides an infrastructure layer for identity-related security intelligence.

The implementation includes functionality associated with:

- Phone identifiers
- Email identifiers
- Domain identifiers
- IBAN identifiers
- Cryptocurrency wallet identifiers
- Reputation records
- Trust scores
- Risk scores
- Report counts
- Known-scammer indicators
- Verified-business indicators
- Suspicious identifier registration
- Batch lookup

Identity intelligence is intended to support security analysis.

It must not be interpreted as a mechanism for unlawful identification, surveillance or unsupported accusations.

Current status:

🟡 Implemented / Validation

---

19. Community Intelligence

Valthoris contains a dedicated Community canister.

The purpose is to provide a decentralised infrastructure layer for community-related security information and reports.

The intended workflow is:

User Action
    │
    ▼
Frontend
    │
    ▼
Community Canister
    │
    ▼
Write
    │
    ▼
Read
    │
    ▼
Application Reload
    │
    ▼
Read Again
    │
    ▼
Persistent Data

Until the complete cycle is verified in production, Community remains classified as:

🟡 Implemented / Validation

---

20. Safe Location

Safe Location provides location-sharing and geofencing functionality.

The implementation includes concepts such as:

- Location sharing
- Share expiration
- Share revocation
- Recipient restrictions
- Location updates
- Location retrieval
- User-owned shares
- Geofence creation
- Geofence listing
- Geofence deletion
- Coordinate validation
- Geographic distance calculation
- Geofence checking

The system is intended to provide a security-oriented location layer without requiring all location functionality to be permanently public.

Current status:

🟡 Implemented / Validation

---

21. Safe Rooms

Safe Rooms are a multi-user safety feature built around temporary shared rooms.

A Safe Room allows authorised participants to share their position on a common map and communicate through a private room-scoped chat.

Current design

A Safe Room supports:

- Up to 30 participants
- Maximum lifetime of 24 hours
- Configurable safety radius
- Maximum safety radius of 1000 metres
- Shareable room link
- Participant-specific access
- Live location updates
- One location marker per participant
- Private room chat
- Participant exit
- Automatic removal of the participant's visible location when leaving
- Room closure when the creator leaves
- Isolation between different rooms

Security model

Participants should only see members of their own Safe Room.

Participants from other rooms must never become visible through the room interface.

The intended backend model uses:

- "safe_rooms"
- "safe_room_participants"
- "safe_room_messages"

The security boundary is enforced through the backend rather than relying exclusively on browser-side controls.

The browser does not receive a privileged Supabase service-role credential.

The Edge Function acts as the controlled operational boundary for Safe Room operations.

Participant limits

The maximum supported configuration is:

Maximum participants: 30
Maximum lifetime: 24 hours
Maximum safety radius: 1000 metres

Location privacy

When a participant exits the room:

EXIT
 │
 ▼
Participant removed
 │
 ▼
Location removed from active room visibility

If the creator exits:

Creator EXIT
 │
 ▼
Safe Room closes
 │
 ▼
Participants can no longer use the room

Current status:

🟡 Implemented / Validation

The core feature is substantially implemented, while remaining UI refinements and complete production validation continue.

---

22. Supabase

Supabase is used as an operational service layer within Valthoris.
Potential services include:
PostgreSQL
Realtime
Storage
Queues
Audit infrastructure
Notifications
Operational synchronization
The Supabase integration is deliberately separated from the decentralized ICP infrastructure.
ICP and Supabase should not be treated as interchangeable persistence mechanisms.
23. Supabase Security Boundary
The intended security boundary is:
Frontend
   │
   │ Public anonymous configuration
   ▼
Supabase Client
   │
   ▼
RLS / Database Permissions
   │
   ▼
Supabase Services
Privileged credentials must remain server-side.
The following must never be embedded into browser code:
Supabase service-role keys
Database passwords
AI provider secrets
Private signing keys
Administrative credentials
Third-party privileged API keys
Public browser configuration such as:
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
must not be confused with privileged credentials.
24. Persistence Architecture
Valthoris contains multiple persistence layers.
VALTHORIS
                     │
          ┌──────────┴──────────┐
          │                     │
          ▼                     ▼
   ICP Persistent State     Supabase
          │                     │
          ▼                     ▼
   Motoko Canisters       Operational Data
          │                     │
          ▼                     ▼
 Decentralized State      Cloud Services
These layers have different purposes.
A successful write to one layer does not automatically prove that synchronization to another layer succeeded.
25. Persistence Verification Standard
Valthoris follows a strict persistence test:
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
For synchronization:
USER ACTION
  ↓
LOCAL / ICP WRITE
  ↓
SYNCHRONIZATION
  ↓
SUPABASE WRITE
  ↓
SUPABASE READ
  ↓
APPLICATION RELOAD
  ↓
DATA STILL EXISTS
A database client existing in source code is not sufficient evidence of persistence.
A write function existing in source code is not sufficient evidence of persistence.
Production behaviour must be tested.

26. Profile Synchronization
The application contains profile synchronization functionality.
The profile architecture includes functionality associated with:
Local profile data
Cloud profile data
Upsert operations
Last-seen information
Profile merging
Authentication-triggered synchronization
The production reliability of this synchronization requires independent validation.
Current status:
🟡 / 🟠 Validation
27. AutoShield
AutoShield is the long-term real-time protection layer of Valthoris.
Its objective is to provide continuous protection against suspicious communications and digital fraud.
The planned security model includes analysis of:
Calls
SMS
WhatsApp messages
Emails
URLs
QR codes
IBANs
MB WAY-related requests
Identity signals
Suspicious payment requests
Potential phishing
Social-engineering indicators
Malicious links
Fraud patterns
The architecture is intended to combine:
Incoming Event
      │
      ▼
Local / Secure Analysis
      │
      ▼
Threat Intelligence
      │
      ▼
Risk Engine
      │
      ▼
Decision
      │
 ┌────┴────┐
 ▼         ▼
Alert    Protection
AutoShield remains under active development.
Current status:
🟠 In Development
The existence of AutoShield architecture must not be interpreted as a claim of complete real-time protection.
28. Risk Engine
Valthoris uses the concept of multi-signal risk analysis.
Potential signals include:
Identity intelligence
Reputation
Threat intelligence
Provider results
Historical reports
Behavioural indicators
Context
Security events
User-provided evidence
Conceptually:
Observed Signals
       │
       ├── Identity
       ├── Reputation
       ├── Threat Intelligence
       ├── Behaviour
       ├── History
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
Risk scores are analytical signals.
They should not automatically be interpreted as definitive proof of malicious activity.
29. Verdict Model
Security results should distinguish between different levels of certainty.
Possible outcomes include:
LEGITIMATE
LOW_RISK
UNKNOWN
SUSPICIOUS
MALICIOUS
The exact verdict should depend on the available evidence and validated risk logic.
Important distinction:
No evidence found
        ≠
Proven safe
and:
Suspicious indicator
        ≠
Confirmed criminal activity

30. Provider Failures
External intelligence providers can become:
unavailable;
rate-limited;
incorrectly configured;
temporarily offline;
unsupported for a particular country;
unsupported for a particular indicator;
unauthorised;
incomplete.
Valthoris should represent such conditions explicitly.
For example:
Provider: unavailable
Reason: HTTP 401
should not be silently transformed into:
Provider: no threat found
The distinction is important for security accuracy.
31. Error Handling
A security platform must degrade gracefully.
An unavailable provider should not unnecessarily transform a valid user request into a generic:
"Try again later."
when useful evidence can still be returned.
The preferred model is:
Primary provider
      │
      ├── Success ───────► Use evidence
      │
      └── Failure
             │
             ▼
       Alternative source
             │
             ├── Success ─► Continue
             │
             └── Failure ─► Return partial result
The system should never invent missing evidence merely to make a response appear complete.
32. Responsible AI
Valthoris AI output should:
distinguish evidence from inference;
identify unavailable sources;
avoid unsupported accusations;
explain uncertainty;
provide useful recommendations;
protect sensitive information;
avoid unnecessary data exposure;
validate model output where appropriate;
maintain appropriate human oversight.
AI-generated results are not automatically authoritative evidence.
33. False Positives
Fraud-prevention systems must account for false positives.
Valthoris therefore distinguishes between:
Category
Meaning
Observed indicator
Something detected by the system
Reported information
Information supplied by a source or user
Automated assessment
Analytical interpretation
Verified information
Information independently supported
Confirmed malicious activity
Activity supported by sufficiently strong evidence
This distinction is essential for responsible security intelligence.
34. Legal and Ethical Boundaries
Valthoris is intended for legitimate cybersecurity and fraud-prevention purposes.
The platform is not intended to:
unlawfully identify individuals;
facilitate harassment;
enable unlawful surveillance;
expose private information without lawful basis;
make unsupported criminal allegations;
bypass authentication;
bypass access controls;
facilitate cyber abuse;
expose privileged credentials.
Security intelligence must be processed according to applicable law and legitimate security purposes.
35. GDPR and Privacy
Valthoris is designed with privacy-oriented principles including:
Data minimisation
Purpose limitation
Access control
Authentication
Privacy by Design
Controlled processing
Security of personal data
Retention considerations
Auditability
Valthoris does not claim formal GDPR compliance merely because these principles exist in the architecture.
Formal compliance depends on:
actual processing activities;
legal bases;
purposes;
data flows;
retention;
data-subject rights;
controller/processor relationships;
organisational measures;
technical safeguards.
The appropriate project description is:
Designed with GDPR and Privacy by Design principles in mind.
36. NIS2 Security Alignment
Valthoris is being developed with cybersecurity risk-management principles associated with the EU NIS2 framework in mind.
Relevant areas include:
Cybersecurity risk management
Incident handling
Business continuity
Disaster recovery
Crisis management
Supply-chain security
Secure development
Vulnerability management
Access control
Authentication
Cryptographic protection where appropriate
Logging
Monitoring
Security governance
Incident reporting
Operational resilience
Third-party risk
Valthoris does not claim formal NIS2 compliance or certification.
The appropriate description is:
NIS2-aligned security architecture and development approach.
Formal applicability and compliance require independent legal, organisational and technical assessment.

37. Secrets Management 
Sensitive credentials must never be committed to the repository.
Examples include:
AI provider API keys
Supabase service-role keys
Database passwords
Private signing keys
Administrative credentials
Deployment credentials
Third-party secrets
Public frontend configuration may include:
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
These are not equivalent to privileged secrets.
38. Build
The frontend production build is performed through:
npm --prefix src/frontend run build
The expected process is:
TypeScript validation
        ↓
Vite production build
        ↓
Static asset generation
        ↓
Deployment
The build output is generated under:
src/frontend/dist
A successful build should be considered a prerequisite for production deployment.
39. Deployment Principle
Valthoris follows a controlled deployment sequence:
Source Code
    ↓
TypeScript Validation
    ↓
Production Build
    ↓
Artifact Verification
    ↓
Deployment
    ↓
Live Environment
    ↓
End-to-End Verification
A successful deployment command does not prove that the entire platform is operational.
40. Production Verification
Production verification should include:
Open the live application.
Authenticate.
Verify the authenticated principal.
Test profile operations.
Test backend operations.
Test Identity operations.
Test Community operations.
Test Safe Location.
Test Safe Rooms.
Test Threat Intelligence.
Test AI requests.
Test scanner workflows.
Test error handling.
Reload the application.
Verify persistence.
Test relevant multi-user workflows.
Verify security boundaries.
Verify external provider failure behaviour.
Only after successful verification should a capability be promoted to:
🟢 Operational
41. Security Development Lifecycle
Valthoris development follows the intended lifecycle:
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
Security is not treated as a final-stage activity.
42. Supply Chain Security
Valthoris depends on software libraries and external services.
Production hardening should include:
Dependency inventory
Dependency updates
Vulnerability scanning
Lockfile management
Software provenance
Reproducible builds
Third-party integration review
Secret management
Dependency auditing
The repository maintains dependency lockfiles as part of the project structure.

43. Auditability
A mature Valthoris deployment should be able to answer:
WHO
 ↓
DID WHAT
 ↓
WHEN
 ↓
USING WHICH IDENTITY
 ↓
AGAINST WHICH RESOURCE
 ↓
WITH WHICH RESULT
Security-sensitive operations should be logged in an appropriately controlled and auditable manner.
44. Production Readiness
Production readiness is not defined solely by:
Build successful
or:
Deployment successful
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
45. Release Criteria
Before a feature becomes 🟢 Operational, Valthoris should verify:
Source code exists.
Build succeeds.
Deployment succeeds.
Frontend integration works.
Authentication works.
Authorisation works.
Write operations work.
Read operations work.
Data survives reload.
Relevant data survives upgrades.
Invalid input is handled.
Unauthorised access is rejected.
Security-sensitive operations are appropriately logged.
External failures are handled.
Production behaviour is verified.
46. Roadmap
Phase 1 — Production Baseline
Focus:
Repository integrity
Frontend stability
ICP deployment
Authentication
Domain configuration
Production baseline
Status:
🟢 / 🟡
Phase 2 — Persistence
Priority:
Profile
Community
Safe Location
Safe Rooms
Identity
Threat Intelligence
Backend services
Status:
🟡
Phase 3 — AI
Validate:
Frontend
   ↓
Trusted API
   ↓
AI Provider
   ↓
Security Analysis
   ↓
Result
   ↓
Frontend
   ↓
Persistence
Status:
🟡
Phase 4 — Operational Services
Validate:
Supabase
PostgreSQL
Realtime
Storage
Queues
Notifications
Audit services
Synchronization
Provider resilience
Status:
🟠 / 🟡
Phase 5 — AutoShield
Build and validate:
Real-time detection
Call protection
Message analysis
Security event processing
Risk evaluation
User alerts
Protection actions
Audit trails
Privacy-preserving analysis
Status:
🟠
Phase 6 — Advanced Intelligence
Future capabilities may include:
Audio intelligence
Voice-fraud analysis
Visual intelligence
Malware intelligence
Advanced blockchain intelligence
Expanded threat intelligence
Enterprise SIEM
Enterprise SOAR
Banking integrations
Institutional integrations
Status:
🔵 / ⚪
47. Future Intelligence Expansion
The long-term Valthoris architecture may expand into:
Identity
    │
Threat Intelligence
    │
AI Analysis
    │
Behaviour
    │
Community Intelligence
    │
External Intelligence
    │
Crypto Intelligence
    │
Place Intelligence
    │
        ▼
    Risk Engine
        │
        ▼
    Decision Layer
        │
   ┌────┴────┐
   ▼         ▼
 Alert    Protection
This is a target architecture and must not be interpreted as a claim that every component is currently operational.
48. What Valthoris Can Demonstrate
Based on the project architecture and current implementation, Valthoris can demonstrate:
A real React/TypeScript frontend
Vite production builds
ICP deployment
Multiple Motoko canisters
Internet Identity integration
Decentralized persistence mechanisms
Identity infrastructure
Community infrastructure
Safe Location infrastructure
Safe Room functionality
Threat Intelligence infrastructure
Supabase integration
AI/service architecture
Security-oriented scanning
External intelligence integrations
A structured implementation-status model
A defined security and privacy architecture
A documented production-verification methodology
49. What Still Requires Verification
The following areas require continued end-to-end validation:
Complete profile persistence
Profile synchronisation
Community persistence
Safe Location persistence after reload
Safe Room complete multi-user production validation
Identity frontend workflows
Threat Intelligence frontend workflows
Complete AI request pipeline
Production AI response handling
AI result persistence
Supabase production synchronisation
Complete ICP/Supabase integration
Provider resilience
Place Intelligence complete fallback behaviour
Wider security testing
Institutional security validation
Compliance assessment

50. What Valthoris Does Not Currently Claim
Valthoris does not currently claim:
Universal fraud detection
Universal scam detection
Guaranteed fraud prevention
Fully autonomous fraud prevention
Complete real-time protection
Complete malware analysis
Complete audio intelligence
Complete visual intelligence
Universal threat-intelligence coverage
Complete global fraud coverage
Complete blockchain intelligence
Complete multi-chain risk coverage
Enterprise SIEM integration
Enterprise SOAR integration
Banking integration
Government integration
Law-enforcement integration
Formal GDPR compliance
Formal NIS2 compliance
ISO certification
SOC certification
Government approval
Law-enforcement endorsement
Regulatory certification
Future capabilities remain clearly classified as development, planned or research work until independently verified.
51. Repository Philosophy
Valthoris follows:
Build first. Verify second. Claim third.
The project intentionally documents incomplete functionality.
This is not considered a weakness.
For a cybersecurity platform, transparency regarding limitations is itself an important part of technical credibility.
52. Evidence Hierarchy
Valthoris uses the following evidence hierarchy.
Strongest evidence
Live production test
Successful end-to-end workflow
Verified deployed behaviour
Integration test
Successful build
Source code
Weaker evidence
UI presence
Architecture diagrams
Documentation
Roadmap specifications
Planned functionality
A feature should not be classified as operational based solely on weaker evidence.
53. What "Implemented" Means
Implemented means that meaningful source code exists for the capability.
It does not necessarily mean:
production validated;
fully integrated;
persistent;
secure under every condition;
complete;
commercially ready;
compliant.
54. What "Operational" Means
Operational means:
The feature has been implemented, deployed and verified through the relevant production workflow.
This is the highest implementation status used by Valthoris.
55. What "Planned" Means
Planned means:
The capability is part of the Valthoris roadmap but is not currently represented as an operational production capability.
56. What "Research" Means
Research means:
The concept is being investigated or evaluated and may become a future implementation.
Research items must not be presented as operational capabilities.
57. Institutional Readiness
Future institutional deployments may require additional work in:
Formal risk assessments
Security policies
Incident-response procedures
Business continuity
Disaster recovery
Vulnerability management
Security monitoring
Access governance
Supplier-risk management
Privacy assessments
Data-processing agreements
Retention policies
Audit procedures
Compliance assessments
Independent security assessments
These requirements depend on the target organisation, sector, jurisdiction and deployment model.
58. Testing Strategy
Valthoris uses several testing levels.
Unit Testing
Individual functions and modules.
Integration Testing
Frontend-to-canister and service-to-service communication.
Persistence Testing
Write/read/reload/upgrade verification.
Security Testing
Authentication, authorisation, input validation and access-control verification.
Production Testing
Testing against the actual deployed environment.
Regression Testing
Ensuring that fixes do not break previously verified functionality.
59. Audit Methodology
Every major Valthoris component should eventually have an evidence record containing:
Field
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
This turns the project from an assumption-based system into an evidence-based engineering project.
60. Repository Structure
The repository should be understood according to the actual source tree.
The principal areas include:
Valthoris-llm/
│
├── dfx.json
├── README.md
├── src/
│
├── frontend/
│
├── documentos/
│
└── ...
The exact structure may evolve during development.
The README should therefore be updated whenever major architectural changes are introduced.
61. Build Requirements
A working Node.js/npm environment is required for frontend development.
Production build:
npm --prefix src/frontend run build
The project should be built and validated before production deployment.
62. ICP Deployment
The general frontend deployment workflow is:
dfx deploy frontend --network ic
Mainnet deployments must be performed carefully.
Deployment credentials and identities should be protected using secure DFX practices.
A production deployment can affect real canisters and consume real cycles.
63. Custom Domain
The intended public domain is:
valthoris.com
The ICP frontend contains the domain-verification resource:
/.well-known/ic-domains
The domain configuration should be treated as a separate infrastructure concern from application functionality.
DNS changes should be minimal and deliberate.
Unrelated DNS records should not be modified without a technical reason.
64. Security Boundary Summary
The intended Valthoris security model can be summarised as:
Authentication
      +
Authorisation
      +
Least Privilege
      +
Input Validation
      +
Provider Isolation
      +
Secrets Management
      +
Auditability
      +
Error Handling
      +
Privacy
      +
Production Verification
No individual control is sufficient on its own.
65. Security Maturity
Valthoris is being developed toward a progressively more mature security architecture.
The maturity path is:
Prototype
   ↓
Working Software
   ↓
Validated Integration
   ↓
Production Verification
   ↓
Security Hardening
   ↓
Operational Monitoring
   ↓
Institutional Readiness
The current project should be understood as a substantial working platform undergoing continued validation and hardening.

66. Responsible Security Intelligence
Security intelligence should always distinguish:
Evidence
   ↓
Interpretation
   ↓
Risk Assessment
   ↓
Recommendation
rather than:
Indicator
   ↓
Automatic accusation
This distinction is fundamental to responsible fraud-prevention technology.
67. Privacy-Preserving Direction
The long-term Valthoris architecture aims to minimise unnecessary exposure of sensitive information.
Where technically and legally appropriate, future security analysis should prefer:
local processing;
minimal data transfer;
pseudonymisation;
controlled retention;
encrypted communication;
restricted access;
explicit authorisation;
limited provider disclosure.
68. Operational Resilience
Valthoris should remain useful even when individual providers become unavailable.
The long-term resilience model is:
Multiple Intelligence Sources
          │
          ▼
Provider Normalisation
          │
          ▼
Evidence Correlation
          │
          ▼
Risk Analysis
          │
          ▼
Graceful Degradation
No single external provider should become an undisclosed single point of truth.
69. Security Platform Philosophy
Valthoris is not designed merely to answer:
"Is this safe?"
It is designed to progressively answer:
What is this?
What evidence exists?
Which providers were consulted?
Which providers were unavailable?
What indicators were found?
How reliable is the evidence?
What is the current risk assessment?
Why was that assessment produced?
What should the user do next?
This is the intended direction of the Valthoris security experience.
70. Development Rule
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
71. Current Development Priority
The immediate priority is not to add functionality simply because it exists on the roadmap.
The priority is:
Production Stability
        ↓
Persistence
        ↓
Integration
        ↓
AI Validation
        ↓
Security Validation
        ↓
Documentation
        ↓
Expansion
The project should first prove that existing functionality works reliably.
Only then should additional complexity be introduced.
72. Long-Term Objective
The long-term objective is to evolve Valthoris into a robust cybersecurity and fraud-prevention platform capable of combining:
Identity Intelligence
        +
Threat Intelligence
        +
AI
        +
Risk Analysis
        +
Community Intelligence
        +
Secure Location
        +
Safe Rooms
        +
Fraud Detection
        +
Real-Time Protection
        +
Privacy
into a unified security experience.
73. Disclaimer
Valthoris is a cybersecurity and fraud-prevention technology project.
Nothing in this README constitutes:
Legal advice
Regulatory certification
Formal compliance certification
A guarantee of security
A guarantee of fraud detection
A guarantee of risk-score accuracy
Government endorsement
Law-enforcement endorsement
Financial advice
Regulatory and legal claims must be independently assessed against the actual deployment, organisation, jurisdiction and applicable legislation.
74. Transparency Statement
Valthoris deliberately distinguishes between:
What exists
      ↓
What works
      ↓
What has been verified
      ↓
What is being developed
      ↓
What is planned
      ↓
What is research
This distinction is permanent.
A feature will not be described as operational simply because it appears in the interface or architecture documentation.
75. Final Project Statement
Valthoris is a real software platform under active development.
It combines:
React
TypeScript
Vite
PWA technology
Internet Identity
Internet Computer Protocol
Motoko canisters
Supabase operational services
AI infrastructure
Threat intelligence
Identity intelligence
Security scanning
Safe Location
Safe Rooms
Community intelligence
Fraud-prevention architecture
AutoShield development
The project is substantial, but it is intentionally not presented as finished.
Its engineering philosophy is:
Build first. Verify second. Claim third.
Its security direction is:
Security by Design.
Its privacy direction is:
Privacy by Design.
Its architectural direction is:
Zero Trust.
Its engineering standard is:
Evidence-based verification.
Its documentation standard is:
If a capability cannot be demonstrated, it will not be described as operational.
VALTHORIS
AI Cybersecurity & Fraud Prevention
Intelligence · Prevention · Protection
Build. Verify. Secure. Protect.
Repository:
https://github.com/Valthoris-code/Valthoris-llm
Project: Valthoris
Infrastructure: Internet Computer Protocol + Operational Services
Frontend: React + TypeScript + Vite
Authentication: Internet Identity
Backend: Motoko Canisters
Operational Layer: Supabase
AI Layer: Valthoris AI / External AI Services
Architecture:
Security by Design · Privacy by Design · Zero Trust
Documentation Integrity Statement
"If a capability cannot be demonstrated, it will not be described as operational."
This is a permanent principle of the Valthoris project.