import express from 'express';
import type { TripStatus } from '../../tracking/model.ts';
import { validationError } from '../../shared/errors.ts';
import type { WebDeps } from '../deps.ts';
import { bodyOf, param, principalOf, queryInt, queryString } from '../http.ts';

const TRIP_STATUSES: TripStatus[] = ['ACTIVE', 'COMPLETED', 'TERMINATED'];

export function officeRoutes(deps: WebDeps): express.Router {
  const router = express.Router();

  router.get('/overview', (_req, res) => {
    const waiting = deps.waiting.countsByStop();
    res.json({
      serverTime: deps.clock.now(),
      activeTrips: deps.tracking.officeTrips().length,
      signals: deps.tracking.signalSummary(),
      waitingTotal: Object.values(waiting).reduce((s, n) => s + n, 0),
      waiting,
      routesInService: deps.network.listRoutes().length,
      viewers: deps.hub.stats(),
    });
  });

  router.get('/trips/active', (_req, res) => {
    res.json({ serverTime: deps.clock.now(), trips: deps.tracking.officeTrips() });
  });

  router.get('/trips', (req, res) => {
    const status = queryString(req, 'status');
    if (status !== undefined && !TRIP_STATUSES.includes(status as TripStatus)) throw validationError('Unknown status filter.');
    res.json({ trips: deps.tracking.tripHistory({ limit: queryInt(req, 'limit', 50, 1, 500), status: status as TripStatus | undefined }) });
  });

  router.get('/trips/:tripId/track', (req, res) => {
    res.json(deps.tracking.tripTrack(param(req, 'tripId')));
  });

  router.post('/trips/:tripId/terminate', (req, res) => {
    const trip = deps.tracking.terminateTrip(principalOf(res).userId, param(req, 'tripId'), bodyOf(req).reason);
    res.json({ trip });
  });

  router.get('/routes', (_req, res) => {
    res.json({ routes: deps.network.listRoutes({ includeInactive: true }), stops: deps.network.listStops() });
  });

  router.patch('/routes/:routeId', (req, res) => {
    const body = bodyOf(req);
    const patch: Record<string, unknown> = {};
    for (const key of ['name', 'color', 'nominalSpeedKmh', 'dwellSeconds', 'active']) if (key in body) patch[key] = body[key];
    if (Object.keys(patch).length === 0) throw validationError('Nothing to update.');
    res.json({ route: deps.network.updateRoute(principalOf(res).userId, param(req, 'routeId'), patch) });
  });

  router.post('/routes', (req, res) => {
    const body = bodyOf(req);
    const route = deps.network.createRoute(principalOf(res).userId, {
      name: body.name as string,
      color: body.color as string,
      stopIds: body.stopIds as string[],
      loop: body.loop as boolean,
      nominalSpeedKmh: body.nominalSpeedKmh as number,
      dwellSeconds: body.dwellSeconds as number,
    });
    res.status(201).json({ route });
  });

  router.get('/demand/models', (_req, res) => {
    res.json({ models: deps.demand.models(), today: deps.demand.today() });
  });

  router.get('/demand/history', (req, res) => {
    res.json(deps.demand.history(queryInt(req, 'weeks', 8, 1, 26)));
  });

  router.get('/demand/forecast', (req, res) => {
    res.json(deps.demand.forecast(queryString(req, 'date') ?? deps.demand.today(), queryString(req, 'model')));
  });

  router.get('/demand/explain', (req, res) => {
    const stopId = queryString(req, 'stopId');
    if (!stopId) throw validationError('stopId is required.');
    res.json(deps.demand.explain(stopId, queryString(req, 'date') ?? deps.demand.today(), queryInt(req, 'hour', -1, 0, 23), queryString(req, 'model')));
  });

  router.get('/demand/evaluation', (req, res) => {
    res.json(deps.demand.evaluate(queryInt(req, 'days', 14, 1, 28)));
  });

  router.get('/system', (_req, res) => {
    res.json({ ...deps.systemInfo(), viewers: deps.hub.stats(), audit: deps.audit.recent(25) });
  });

  return router;
}
