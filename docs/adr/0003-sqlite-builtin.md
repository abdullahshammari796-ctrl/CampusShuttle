# ADR-0003 — SQLite through Node's built-in `node:sqlite`

**Status:** Accepted · **Date:** 2026-10-31

## Context
We need durable, transactional storage for trips, positions, waiting requests, demand history and an audit log, with database-enforced consistency rules, on a student laptop, with no installation and no paid service.

Alternatives: PostgreSQL (separate server to install and operate), in-memory only (loses data on restart), a document store (weaker constraints), `better-sqlite3` (native compilation on some machines).

## Decision
SQLite in WAL mode via Node 24's built-in `node:sqlite` (`DatabaseSync`), schema migrations tracked with `PRAGMA user_version`, foreign keys on. Consistency rules live in the schema: partial unique indexes guarantee at most one active trip per shuttle and per driver, and one open waiting request per student. Access goes through repository interfaces (ADR-0001), so PostgreSQL adapters could be added later without touching business code.

## Consequences
* + Zero installation; one file to back up; real SQL constraints and transactions.
* + Synchronous calls keep code simple; latency depends on the query, data size and storage.
* − `node:sqlite` is marked experimental in Node 24 (warning suppressed in npm scripts; minimum Node version declared in `engines`; Node 24 used for verification).
* − Synchronous calls block the event loop; fan-out was unaffected at 3,000 simulated viewers in the local benchmark, but a slow disk would hurt.
* − Single writer: fine for one campus; a multi-instance deployment would need PostgreSQL.
