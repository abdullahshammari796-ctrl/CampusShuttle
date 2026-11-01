import express from 'express';
import type { WebDeps } from '../deps.ts';
import { param, principalOf, sessionExpiryOf } from '../http.ts';

/** Read endpoints available to every signed-in role. */
export function sharedRoutes(deps: WebDeps): express.Router {
  const router = express.Router();

  router.get('/network', (_req, res) => {
    const principal = principalOf(res);
    const routes = deps.network.listRoutes({ includeInactive: principal.role === 'office' });
    res.json({
      stops: deps.network.listStops(),
      routes: routes.map((route) => {
        const path = deps.network.pathFor(route.id);
        return {
          id: route.id,
          name: route.name,
          color: route.color,
          loop: route.loop,
          active: route.active,
          stopIds: route.stopIds,
          nominalSpeedKmh: route.nominalSpeedKmh,
          dwellSeconds: route.dwellSeconds,
          lengthMeters: Math.round(path.length),
          path: path.points(),
        };
      }),
      shuttles: deps.network.listShuttles().map((s) => ({ id: s.id, label: s.label, capacity: s.capacity })),
    });
  });

  router.get('/live', (_req, res) => {
    res.json({ serverTime: deps.clock.now(), vehicles: deps.tracking.liveVehicles(), waiting: deps.waiting.countsByStop() });
  });

  router.get('/stops/:stopId/arrivals', (req, res) => {
    const stopId = param(req, 'stopId');
    res.json({
      serverTime: deps.clock.now(),
      stopId,
      arrivals: deps.tracking.arrivalsAt(stopId),
      waiting: deps.waiting.countsByStop()[stopId] ?? 0,
    });
  });

  router.get('/stream', (req, res) => {
    deps.hub.attach(req, res, principalOf(res).role, sessionExpiryOf(res));
  });

  return router;
}
