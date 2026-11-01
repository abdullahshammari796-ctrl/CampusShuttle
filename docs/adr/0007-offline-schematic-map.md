# ADR-0007 — Offline schematic SVG map instead of map tiles

**Status:** Accepted · **Date:** 2026-10-31

## Context
A street map normally needs a tile provider (OpenStreetMap tiles have usage policies; commercial providers need keys and may charge). Every tile request would also tell a third party roughly where each viewer is looking. The prototype must run offline for the demonstration.

## Decision
Render a schematic map as inline SVG from the route geometry and stop coordinates (equirectangular projection, 100 m grid). Vehicles are animated markers whose style encodes the signal state (solid = live, dashed ring = delayed, grey = lost — always also stated in text).

## Consequences
* + Works offline; no keys, costs or third-party requests; strict CSP possible.
* + Clear for a small campus network.
* − No streets or buildings in the background; a production version could add self-hosted tiles behind the same map component.
