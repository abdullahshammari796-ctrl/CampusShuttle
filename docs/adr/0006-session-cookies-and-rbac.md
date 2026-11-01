# ADR-0006 — Signed HttpOnly session cookies and role checks at the edge

**Status:** Accepted · **Date:** 2026-10-31

## Context
Three roles with very different rights; location data of drivers; the live stream (EventSource) cannot send custom authorisation headers; no external identity provider is available for the prototype.

## Decision
* Passwords: salted scrypt hashes. Five failed attempts lock a username for five minutes.
* Sessions: HMAC-SHA256-signed token (user id, role, display name, expiry 8 h) in an `HttpOnly; SameSite=Strict` cookie (`Secure` when `SECURE_COOKIES=true` behind HTTPS). The account must still exist on every request.
* Authorisation: by URL prefix at the edge (`/api/student`, `/api/driver`, `/api/office`) plus ownership checks inside services (a driver can only post to their own trip; a student can only cancel their own request).
* CSRF defence in depth: state-changing calls must carry `X-Requested-With: campus-shuttle`.
* Hardening: strict Content-Security-Policy (no inline script or style), `X-Frame-Options: DENY`, `nosniff`, no-referrer, `no-store` on API data, `x-powered-by` removed, 64 KB body limit, HTML escaping of every rendered value.

## Consequences
* + Tokens are not readable by page scripts (XSS cannot steal them); works with EventSource.
* + Role matrix is verified automatically for all 26 protected endpoints.
* − Stateless tokens cannot be revoked individually before expiry (an account deletion does revoke them). A production deployment should use the university's single sign-on (OIDC) — **Proposed**.
* − Demo passwords are published in the README; they are for local demonstration only.
