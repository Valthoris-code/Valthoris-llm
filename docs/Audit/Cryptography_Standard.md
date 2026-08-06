# Valthoris Cryptography Standard

## Purpose

This document defines the official cryptographic standards adopted by the Valthoris platform.

Its objective is to ensure confidentiality, integrity, authenticity and non-repudiation across all platform components.

---

# Cryptographic Principles

The platform follows:

- Confidentiality
- Integrity
- Authentication
- Non-repudiation
- Secure Key Management
- Cryptographic Agility

---

# Approved Algorithms

## Symmetric Encryption

- AES-256-GCM

---

## Asymmetric Cryptography

- Ed25519
- X25519
- X25519ML-KEM768 (Post-Quantum Hybrid where supported)

---

## Hash Functions

- SHA-256
- SHA-512

---

## Password Hashing

- Argon2id

---

## Secure Randomness

Cryptographically Secure Random Number Generator (CSPRNG)

---

# Transport Security

All communications shall use:

- TLS 1.3
- HTTPS only
- HSTS
- Perfect Forward Secrecy (PFS)

---

# Digital Signatures

Digital signatures shall use:

- Ed25519

---

# Key Management

Keys shall:

- never be hardcoded;
- be rotated periodically;
- be stored securely;
- follow least privilege principles.

---

# Secrets Management

Secrets must be stored using secure secret management systems.

No production secrets shall be committed to Git repositories.

---

# Cryptographic Lifecycle

The platform shall support:

- Key generation
- Key rotation
- Key revocation
- Key destruction

---

# Compliance

This standard aligns with:

- GDPR
- NIS2
- Cyber Resilience Act
- EU AI Act
- ENISA Recommendations
- ISO/IEC 27001
- OWASP ASVS

---

# Governance

Any change to approved algorithms requires a formal security review.

---

Status: Active Cryptography Standard
