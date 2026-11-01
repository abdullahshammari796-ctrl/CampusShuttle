import express from 'express';
import type { WebDeps } from '../deps.ts';
import { bodyOf, param, principalOf } from '../http.ts';

export function driverRoutes(deps: WebDeps): express.Router {
  const router = express.Router();

  router.get('/options', (_req, res) => {
    res.json({
      routes: deps.network.listRoutes().map((r) => ({ id: r.id, name: r.name, color: r.color, stops: r.stopIds.length })),
      shuttles: deps.network.listShuttles().map((s) => ({
        id: s.id,
        label: s.label,
        plate: s.plate,
        capacity: s.capacity,
        busy: deps.tracking.isShuttleBusy(s.id),
      })),
    });
  });

  router.get('/trip', (_req, res) => {
    const vehicle = deps.tracking.activeTripFor(principalOf(res).userId);
    const locationSource = vehicle ? deps.tracking.lastFixSource(vehicle.tripId) : null;
    res.json({ vehicle, locationSource, serverTime: deps.clock.now() });
  });

  router.post('/trips', (req, res) => {
    const body = bodyOf(req);
    const driverId = principalOf(res).userId;
    const trip = deps.tracking.startTrip(driverId, { routeId: body.routeId, shuttleId: body.shuttleId });
    res.status(201).json({ trip, vehicle: deps.tracking.vehicle(trip.id), serverTime: deps.clock.now() });
  });

  router.post('/trips/:tripId/locations', (req, res) => {
    const body = bodyOf(req);
    const result = deps.tracking.recordFixes(principalOf(res).userId, param(req, 'tripId'), body.fixes, body.sentAt);
    res.json({ ...result, serverTime: deps.clock.now() });
  });

  router.post('/trips/:tripId/occupancy', (req, res) => {
    const trip = deps.tracking.setOccupancy(principalOf(res).userId, param(req, 'tripId'), bodyOf(req).level);
    res.json({ trip });
  });

  router.post('/trips/:tripId/end', (req, res) => {
    const trip = deps.tracking.endTrip(principalOf(res).userId, param(req, 'tripId'));
    res.json({ trip });
  });

  return router;
}
