# ADR-0002 — Server-Sent Events for live updates, REST for uploads

**Status:** Accepted · **Date:** 2026-10-31

## Context
Information flows mostly one way: a few drivers upload positions every ~3 s; hundreds or thousands of viewers must receive them within about a second (QA-1, QA-2).

| Option | Freshness | Server load with 1,000 viewers | Complexity |
|---|---|---|---|
| Client polling every 5 s | average 2.5 s old, worst 5 s | 200 requests/s, even when nothing changes | lowest |
| WebSockets | push; latency depends on workload/network | one message per update per viewer | bidirectional protocol, custom reconnection, proxy upgrades |
| **Server-Sent Events** | push; latency depends on workload/network | one message per update per viewer | plain HTTP; browsers reconnect automatically; cookies are sent automatically |

## Decision
Viewers subscribe to `GET /api/stream` (SSE). On every connection the server sends a full **snapshot**; afterwards it pushes `vehicle`, `vehicle-removed`, `waiting`, `arrival`, `network` and `heartbeat` events. Authorisation is checked when the stream opens; the session's expiry is then re-checked before every push and on every heartbeat, and an expired stream receives `session-expired` and is closed. Drivers upload positions with ordinary `POST` requests (batched when offline). Each event is serialised once per broadcast; all positions in one upload are **coalesced** into one message per trip; a client whose socket buffer exceeds 256 KB skips incremental messages and gets a fresh snapshot when it drains.

## Consequences
* + Local benchmark (one desktop PC, Node 24; simulated viewers in the same process over loopback, one shared session, no browsers): 1,000 viewers p95 35–37 ms; 3,000 viewers max 108–113 ms. This shows the fan-out is cheap; it is not a deployment test (see QA-1/QA-2).
* + Reconnection is free and safe (snapshot replaces client state).
* − HTTP/1.1 browsers allow ~6 connections per origin — fine for one tab per user.
* − Some proxies buffer streams: `X-Accel-Buffering: no` and 15 s heartbeats; the client reconnects after 40 s of silence.
* − More than one server instance would need a shared broker (e.g. Redis pub/sub) behind the existing `EventPublisher` interface — **Proposed, not implemented**.

The protocol does not guarantee sub-100ms latency. Session expiry is enforced; full revocation on logout is not implemented. Technical evidence review: [Zuhair-requested review](zuhair-technical-review.md).
