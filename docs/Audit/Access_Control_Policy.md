# Valthoris Access Control Policy

## Purpose

This document defines the official Access Control Policy for the Valthoris platform.

Its objective is to ensure that every user, administrator, service and AI component only has the minimum permissions required to perform its functions.

---

# Security Principles

Access control follows:

- Least Privilege
- Need to Know
- Zero Trust
- Separation of Duties
- Role-Based Access Control (RBAC)
- Attribute-Based Access Control (ABAC) where applicable

---

# User Roles

The platform may define roles such as:

- Visitor
- Registered User
- Verified User
- Premium User
- Moderator
- Security Analyst
- Administrator
- System Administrator
- AI Service Account

Each role shall have explicitly defined permissions.

---

# Authentication

Authentication mechanisms include:

- Secure passwords
- Multi-Factor Authentication (MFA)
- OAuth / OpenID Connect where applicable
- Internet Identity (ICP) integration
- Session expiration and renewal

---

# Authorization

Authorization decisions shall be enforced through:

- PostgreSQL Row Level Security (RLS)
- Backend authorization checks
- API authorization policies
- Service-to-service authentication

---

# Administrative Access

Administrative accounts shall:

- use MFA;
- be individually assigned;
- never be shared;
- be fully auditable.

---

# Service Accounts

Service accounts:

- shall have limited permissions;
- shall be rotated periodically;
- shall not be used for interactive logins.

---

# Privileged Operations

All privileged operations shall be:

- authenticated;
- authorized;
- logged;
- auditable.

---

# Access Reviews

Permissions shall be reviewed periodically to ensure:

- obsolete accounts are removed;
- excessive privileges are revoked;
- inactive accounts are disabled.

---

# Logging

Authentication and authorization events shall be logged for:

- successful logins;
- failed logins;
- privilege changes;
- role assignments;
- account creation and deletion.

---

# Compliance

This policy aligns with:

- GDPR
- NIS2
- Cyber Resilience Act
- EU AI Act
- ENISA Recommendations
- ISO/IEC 27001
- ISO/IEC 27701
- OWASP ASVS

---

# Governance

Any modification to access control rules requires formal approval and documentation.

---

Status: Active Access Control Policy
