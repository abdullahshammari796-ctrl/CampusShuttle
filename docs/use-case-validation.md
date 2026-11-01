# Use-case validation — 1 November 2026

Performed by ChatGPT Work at Zuhair's request on the actual application, with isolated demo data. B = real Chromium UI and HTTP/SSE; I = API integration; U = domain/unit tests; S = source comparison. A source check is not a browser observation. The team still needs its own walkthrough and diagram-render inspection.

| Scenario / extension | Evidence and outcome |
|---|---|
| UC1 main 1–4: map, stop, arrivals, updates | B: `roles.spec.ts` student persistence and cross-role stream; `use-cases.spec.ts` GPS transition test. |
| UC1 main 5: stop reached / next lap | U: `trip-tracker.test.ts`, `eta.test.ts`, `route-path.test.ts`; I: served-at-stop path. S: UI sorts next-stop arrival timestamps. Corrected description to distinguish loop/non-loop routes; full physical lap not driven in a browser. |
| UC1 3a: no shuttle | B: role stream test sees empty fleet after end; I: `start → live position and ETAs for students → end → removed`. |
| UC1 4a/4b: delayed/lost/no ETA | B: real stream at controlled 21 s and 61 s; restores Live after fresh upload. |
| UC1 4c: reconnect snapshot | B: offline student misses a served event, reconnects and sees its closed request; I: SSE snapshot and slow-client resync. |
| UC1 4d: expired session | B: existing stream gets expiry and sign-in link after server-clock advance; I: idle heartbeat expiry and fresh-session isolation. Not an eight-hour soak. |
| UC2 main 1–7: start/upload/load/end | B: driver offline/recovery and cross-role tests. I: route selection, accepted fixes, ETA and removal; U: queue drain/in-flight safety. |
| UC2 1a: busy/inactive/unknown | I: active-trip conflicts; U: `enforces one active trip per shuttle and per driver, and only on routes in service`. |
| UC2 3a: GPS outage | B: `UC1/UC2` test with real stream and simulated GPS. Device GPS field evidence is still Abdullah's #3. |
| UC2 3b: network queue | B: simulated mobile-data loss, positive queued count, failed end, recovery and end. U: queue, retry, backoff, drain and limits. No restart durability guarantee. |
| UC2 4a: bad fixes | B: injected glitch visibly rejected; U: invalid/accuracy/area/age rejection plus duplicate/order/jump tests. |
| UC2 4b: reload | B: active trip title preserved, resumed-trip log observed. **Corrected in the owner review (PR from `abdullah/owner-completion`):** the page now resumes the source of the trip's latest accepted position. B: `e2e/driver-location-source.spec.ts` shows that a device-GPS trip stays on device GPS after reload, with only `device` positions stored, and that a trip with no accepted position shares nothing until the driver chooses a source. I: `GET /api/driver/trip` returns `locationSource`, also after a server restart. |
| UC2 7a: office ends | B: office reason entry, audit record, driver's start form returns; I: terminal trips reject further uploads. |
| UC2 7b: auto-close | B: after 31 minutes via clock port, driver returns to start form; U: timeout rule. |
| UC2 7c: failed end/retry | B: simulated network failure leaves active UI; U: failed request, already-ended and queued/in-flight recovery. |
| UC3 main 1–4 | B: registration/cancellation and closure after reconnect. I: real accepted fixes trigger arrival and SERVED, aggregate counts never expose requester reference. |
| UC3 1a/1b/1c | I: idempotent registration, replacement, invalid-route rejection. S: idempotence requires same stop **and route**, corrected prose. |
| UC3 1d/3a/4a | I: rate limit, cancellation, expiry; B: cancel and visible expiry without reload. |
| UC3 retention postcondition | I: erases requester link after 24 h; no real personal data used. |
| UC4 main 1–2 | B: live fleet and audit; I: trip-track endpoints and restart recovery. S: office renders stored trace/stats; historical-trace visual review remains in team walkthrough. |
| UC4 1a | B: reason-required termination, driver removal and audit. |
| UC4 1b | B: edit and disable route through form; I: validates/audits route changes and prevents new trips on disabled routes. |
| UC5 main 1–4 | B: median selector, historical explanation, four-model backtest and synthetic notice; I: 9×15 forecast/explanation/evaluation; U: hand-computed predictions/backtest. |
| UC5 2a/2b | B: ancient empty period has 135 no-history cells and no invented prediction; synthetic warning visible. |

## Defects and corrections

The expiry and missed-served-event tests both failed before the private-request refresh fix and passed afterward. Those were actual UI defects. An asynchronous response revision prevents older reads overwriting newer request actions. Accessibility regressions and fixes are documented separately in the test plan.

Text corrected: simulator/device update cadence; loop versus non-loop arrivals; waiting-request idempotence includes route; remote termination can come from the scheduler. The use-case diagram now treats driver end as optional extension: office termination/timeout can finish a trip without a driver ending it. Activity diagram, trip state machine and waiting state machine were compared with current handlers and services; no other source-level change was required. All rendered diagrams remain Abdullah's #1 work; this does not claim renderer validation.

## Remaining bounded limitations

The earlier reload limitation (every reload resumed simulated GPS, even for a device-GPS trip) was corrected in the owner review; see UC2 4b above. Device GPS on a real phone is still untested (issue #3). Session logout does not implement full token revocation. Queues are memory-only and fixes older than ten minutes are rejected. Human screen-reader listening, full browser lap/trace walkthrough, physical GPS, presentation rehearsal and signatures are not performed by this automation.
