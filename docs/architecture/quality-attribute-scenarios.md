# Quality-attribute scenarios

Six-part scenarios (Bass, Clements & Kazman). Every response measure is checked by a named test, script or manual procedure. Results were measured on 31 Oct – 1 Nov 2026 on a Windows 11 desktop PC (Intel Core i7-14700F, 16 GB RAM) with Node 24.14.1.

## Utility tree (priorities)

| Quality | Refinement | Scenario | Importance / difficulty |
|---|---|---|---|
| Timeliness | Live updates reach viewers fast | QA-1 | High / Medium |
| Scalability | Peak number of viewers | QA-2 | High / Medium |
| Availability of truthful information | GPS outage | QA-3 | High / High |
| Reliability | Mobile network loss | QA-4 | High / High |
| Security | Role-based access | QA-5 | High / Medium |
| Privacy | Data minimisation and retention | QA-6 | High / Medium |
| Modifiability | New ETA / forecasting algorithm | QA-7 | Medium / Low |
| Testability | Deterministic, fast test suite | QA-8 | Medium / Low |
| Consistency | Concurrent trip start | QA-9 | Medium / Low |

## Scenarios

### QA-1 Timeliness of live updates
* **Source:** driver app. **Stimulus:** uploads a new position. **Artifact:** tracking + real-time gateway. **Environment:** normal operation, up to 1,000 connected viewers, one server.
* **Response:** every connected viewer receives the new position, signal state and ETAs.
* **Measure:** 95th percentile ≤ 1 s from upload to delivery.
* **Verification:** local benchmark `npm run load-test` (method and limits below). 31 Oct: p50 23.4 ms, p95 35.1 ms, p99 47.0 ms, max 56.1 ms over 60,000 deliveries (`docs/evidence/load-test-1000.txt`). 1 Nov re-run: p50 24.6 ms, p95 37.0 ms, p99 48.1 ms, max 55.1 ms, 60,000 of 60,000 delivered (`load-test-1000-20261101.txt`). Automated test with 200 viewers asserts max < 1 s. **Met in the local benchmark.** Not measured over real networks or with real browsers.

### QA-2 Scalability at peak
* **Source:** students at the start of term. **Stimulus:** 3,000 concurrent viewers. **Artifact:** server. **Environment:** one machine; in the benchmark, the 3,000 simulated viewers run on the same machine and in the same process as the server.
* **Response:** keeps delivering every update to every healthy viewer.
* **Measure:** max delivery ≤ 1 s; 0 updates skipped for healthy clients.
* **Verification:** `npm run load-test -- --viewers 3000 --rounds 10`. 31 Oct: p95 89.9 ms, max 107.5 ms, 0 skipped, 332 MB for server and test clients together. 1 Nov re-run: p95 98.0 ms, max 113.1 ms, 90,000 of 90,000 delivered, 0 skipped, 311 MB. **Met only as a local benchmark of the server's fan-out.** It does not show that 3,000 real students on campus Wi-Fi or mobile data would see the same latency (see the limits below). The limit beyond 3,000 was not measured.

#### How the load test measures, and what it does not show
* **Method.** `scripts/load-test.ts` starts an in-memory server on `127.0.0.1`, opens N SSE connections with `node:http`, drives 3 shuttles through the real REST API, and records, for each upload, the time from just before the driver's POST until each viewer's parser sees the matching `vehicle` message. Both timestamps come from `performance.now()` in one process, so clock skew cannot distort them. Latency therefore includes HTTP handling, validation, persistence, coalescing, serialisation, socket writes, loopback TCP and test-client parsing.
* **Same process, loopback.** Server and all viewers share one Node.js process and event loop, so they compete for one CPU core. Traffic never leaves the machine: there is no Wi-Fi or mobile latency, no packet loss, no TLS and no reverse proxy. Some of these effects make the result pessimistic (shared CPU), others optimistic (no real network).
* **No browsers.** No `EventSource`, DOM updates or map rendering are measured. Rendering time on low-end phones is unknown.
* **One shared session.** All viewers reuse one signed-in demo student session. The hub's per-connection work does not depend on the user, so fan-out cost is representative, but 3,000 sign-ins (scrypt hashing) and 3,000 distinct sessions were not exercised.
* **Load shape.** 3 location uploads per second in total and no other API traffic (arrival queries, waiting requests, office pages). Runs last 13–23 s, so long-running memory growth is not covered.
* **Environment of the 1 Nov runs.** Intel Core i7-14700F (28 logical cores), 16 GB RAM, Windows 11 (10.0.26200), Node.js 24.14.1. The development server and the browser pane were also running.
* **Observed throughput.** 1,000 viewers: 2,608 deliveries/s averaged over 23 s (paced by the 3 uploads/s), and at least 18,133 deliveries/s within the slowest single update. 3,000 viewers: 6,806 deliveries/s averaged over 13.2 s, and at least 26,511 deliveries/s within the slowest update.
* **Remaining uncertainties.** Real network latency and TLS cost; operating-system socket limits; a reverse proxy's buffering behaviour with SSE; mobile browsers in the background; a smaller server (e.g. a 1–2 vCPU campus VM); simultaneous sign-in bursts; and many hours of uptime. A deployment test from separate client machines against a staging server is needed before relying on these numbers.

### QA-3 Truthful information during a GPS outage
* **Source:** a shuttle's GPS. **Stimulus:** stops producing positions. **Artifact:** tracking. **Environment:** active trip.
* **Response:** viewers see "location delayed" with approximate times, then "GPS signal lost" with **no** time; on the next position the shuttle is live again; a trip silent for 30 minutes is closed.
* **Measure:** delayed within 20 s + one monitor interval (2 s); lost within 60 s + 2 s; zero ETAs shown while lost; recovery on the first accepted position.
* **Verification:** `test/unit/signal-state.test.ts`, `tracking-service.test.ts` ("degrades LIVE → STALE → LOST…", "closes a trip automatically…"), `test/integration/api.test.ts` ("degrades to delayed / lost…"); browser walkthrough with the simulator's GPS-outage button. **Met.**

### QA-4 Bounded position loss during a mobile-network outage
* **Source:** driver phone. **Stimulus:** mobile data lost while GPS keeps working. **Artifact:** driver app (`LocationUploader`) + tracking. **Environment:** active trip; the driver page stays open.
* **Response:** positions are queued in the page, retried with backoff and delivered in order; duplicates, out-of-order and implausible positions are rejected; the shuttle's position catches up on reconnection.
* **Measure (bounded, not "zero loss"):** for an outage of **up to 10 minutes with the driver page left open**, every queued position that passes validation is stored. Outside that envelope, positions are lost by design, and the loss is visible or documented:
  1. The queue keeps the newest 500 positions (≈ 25 min at one every 3 s). Older ones are dropped and counted on the driver screen.
  2. Positions more than 10 minutes old when they reach the server are rejected as `TOO_OLD`, because they are no longer useful for live tracking.
  3. The queue lives in the page's memory. Closing or reloading the page, or a browser restart, loses unsent positions. The trip itself resumes from the server.
  4. After 30 minutes without an accepted position the trip is closed automatically, and later uploads are refused.
  5. Positions recorded while an end-trip request is pending are not sent if the trip ends; the driver log reports how many.
* **Verification:** `tracking-service.test.ts` "accepts a shuffled offline backlog…", "rejects … too-old positions…"; `api.test.ts` "…recovers when it resumes" (duplicate rejected); `driver-trip-ending.test.ts` "keeps only the newest maxQueue positions while offline…", "drain() waits for the upload in flight…", and the end-trip tests; browser walkthrough of network loss and recovery. **Met within the stated bound.** Surviving a page reload would need persistent browser storage (IndexedDB). It is not built, because the prototype's scope is honest live tracking, not a complete trace archive.

### QA-5 Role-based access
* **Source:** an anonymous caller or a user with the wrong role. **Stimulus:** calls a protected endpoint. **Artifact:** web API.
* **Response:** refused before any service is reached.
* **Measure:** 100 % of 26 protected endpoints × 4 caller types return 401 (anonymous) or 403 (wrong role); tampered, foreign-key or expired tokens rejected; 5 failed logins → 429 for 5 minutes; an open live stream receives no update after its session expires and is closed (checked before every push and at every 15 s heartbeat).
* **Verification:** "enforces the role matrix…", token and lockout tests; "Session expiry on open live streams" (manual clock: an expired stream gets `session-expired` and is closed, a fresher session keeps receiving updates, reconnecting with the expired cookie returns 401). **Met.** Limitation: sessions expire but cannot be revoked early. Tokens are stateless, so logout deletes the cookie in that browser only, and a copied token stays valid until it expires (8 h) — see `docs/privacy-and-security.md`.

### QA-6 Privacy by design
* **Source:** any user, or an attacker who obtains the database. **Stimulus:** data is displayed or stored. **Artifact:** whole system.
* **Response:** only data needed for the service exists.
* **Measure:** no endpoint accepts a student location; no driver identity in student-visible data; waiting requests stored with a keyed pseudonym that is erased 24 h after closing; raw GPS deleted after 30 days; no third-party requests from the browser.
* **Verification:** tests "public vehicle views never contain the driver identity", "…never exposes the pseudonym", "erases the pseudonymous link 24 h after…"; CSP `connect-src 'self'`. **Met** (30-day purge is implemented; its test uses the same job but not a 30-day dataset).

### QA-7 Modifiability of algorithms
* **Source:** developer. **Stimulus:** adds a new ETA or forecasting algorithm. **Artifact:** tracking / demand.
* **Response:** added without changing services, API or UI.
* **Measure:** one new class + one line in `src/container.ts`.
* **Verification:** design review (Strategy pattern); the office model selector is filled from `/api/office/demand/models`. **Exercised in issue #6** by adding `SameWeekdayMedianPredictor` and registering it in `src/container.ts`, with six targeted unit tests. Full Node 24 integration recheck remains pending.

### QA-8 Testability
* **Source:** developer. **Stimulus:** runs the test suite. **Artifact:** code base. **Environment:** developer PC, no network.
* **Response:** all business rules exercised; time-dependent rules deterministic (manual clock).
* **Measure:** full suite < 10 s.
* **Verification:** `npm test` → 103 tests in ≈ 4.7 s (1 Nov 2026). **Met.**

### QA-9 Consistency under concurrency
* **Source:** two drivers. **Stimulus:** start trips on the same shuttle at the same moment. **Artifact:** tracking + database.
* **Response:** exactly one succeeds; the other gets 409.
* **Measure:** guaranteed by unique partial indexes regardless of timing.
* **Verification:** tests "keeps shuttles and drivers to one active trip each"; the fleet simulator's first version hit exactly this case and received 409. **Met.**
