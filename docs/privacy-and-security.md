# Privacy and security

The brief requires that a system handling personal data explains how it protects it. This document lists what personal data exists, why, for how long, and the security controls around it. It describes the prototype; a real deployment would need review by the university's data-protection officer under the UAE personal-data law (Federal Decree-Law No. 45 of 2021).

## 1. Data inventory

| Data | Personal? | Purpose | Who can see it | Retention |
|---|---|---|---|---|
| User account (username, display name, role, password hash) | Yes | Sign-in and role checks | Owner; not exposed by any API except own profile | Life of the account |
| Driver position during a trip (lat/lng, speed, accuracy, time) | Yes (driver at work) | Live tracking, ETAs, trip inspection | Students: route-snapped position of the *shuttle*, never the driver's name. Office: full trace with driver name | Raw positions deleted after **30 days** (hourly retention job) |
| Trip (route, shuttle, driver, times, end reason) | Yes (work record) | Operations, accountability | Office | Kept (operational record) |
| Waiting request (stop, route, time, outcome) | Pseudonymous | Live demand signal; demand history | Students: only their own; others: counts per stop only | Pseudonym erased **24 h after closing**; the remaining row is non-personal |
| Student location | — | **Never collected** | — | — |
| Audit log (office actions) | Yes (staff) | Accountability | Office | Kept |
| Session token (cookie) | Yes | Authentication | Browser only (HttpOnly) | 8 hours |

## 2. Privacy controls
* **Data minimisation**: students select a stop; no API accepts their position. Drivers' positions are only accepted for an active trip they own; the driver app says "your location is shared only while a trip is active".
* **Pseudonymisation**: waiting requests store `HMAC(secret, "waiting:" + userId)`, never the user id; the office sees counts only.
* **Separation of views**: `VehicleView` (students and everyone) has no driver fields; `OfficeTripView` adds the driver name and is served only under `/api/office`.
* **Retention**: `container.runJobs('retention')` purges positions older than 30 days and erases pseudonyms 24 h after requests close (configurable `LOCATION_RETENTION_DAYS`).
* **No third parties**: no map tiles, fonts, analytics or CDNs; CSP `connect-src 'self'` enforces it.

## 3. Security controls (threat → control)

| Threat (STRIDE) | Control | Verified by |
|---|---|---|
| Spoofing: guessing passwords | scrypt hashes; 5 failures → 5-minute lockout per username | lockout test |
| Spoofing: forged session | HMAC-SHA256 signed tokens, constant-time comparison, expiry, account must exist | token tests |
| Spoofing: an expired session keeps a live stream open | the SSE hub records each stream's session expiry, checks it before every push and on every 15 s heartbeat, then sends `session-expired` and closes the stream | "Session expiry on open live streams" |
| Tampering: a driver moving another driver's shuttle | ownership check in `TrackingService` | "only the owning driver can post positions" |
| Tampering: fake / garbage positions | validation (coordinates, accuracy, age, service area, jump filter, ordering) | tracking tests |
| Repudiation: office actions | audit log with actor, time, target, reason | office tests |
| Information disclosure: XSS | strict CSP (no inline script/style), HTML escaping of all rendered values, `nosniff` | header test; code review |
| Information disclosure: clickjacking / referrers / caching | `X-Frame-Options: DENY`, `frame-ancestors 'none'`, no-referrer, `Cache-Control: no-store` on API | header test |
| Elevation of privilege: wrong role | role checks at the edge for 26 endpoints | role-matrix test |
| CSRF | `SameSite=Strict` cookie + required `X-Requested-With` header on state-changing calls | CSRF test |
| Denial of service (application level) | 64 KB body limit, ≤ 100 positions per upload, ≥ 1 s between positions, waiting-request rate limit (6/hour), slow SSE clients cannot grow server memory | tests |

## 4. Known gaps (not done in the prototype)
* **Session expiry is not revocation.** Sessions are stateless signed tokens with an 8-hour expiry. Expiry is enforced everywhere, including open live streams. There is no server-side session store or revocation list, so a session cannot be ended early: logout deletes the cookie in that browser only, and a copied token stays valid until it expires (deleting the user account does end it, because every request checks that the account exists). Early revocation would need a session table or a token deny-list checked on each request and by the SSE hub. It is not justified for a local prototype, but it is needed before production.
* HTTPS is not configured (development uses `http://localhost`); production must run behind TLS and set `SECURE_COOKIES=true`.
* Demo accounts and passwords are public (README); they must never be used outside a local demo.
* No integration with the university's identity provider; no multi-factor authentication for office staff.
* No network-level rate limiting (a reverse proxy should add it).
* No penetration test or dependency-vulnerability scanning pipeline.
* Tokens cannot be revoked individually before expiry (deleting the account does revoke them).
