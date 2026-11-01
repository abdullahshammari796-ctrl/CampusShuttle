import express from 'express';
import type { WaitingRequest } from '../../demand/model.ts';
import type { WebDeps } from '../deps.ts';
import { bodyOf, param, principalOf } from '../http.ts';

/** The student never sees the pseudonymous reference stored with the request. */
function toView(request: WaitingRequest | null) {
  if (!request) return null;
  const { requesterRef: _hidden, ...view } = request;
  return view;
}

export function studentRoutes(deps: WebDeps): express.Router {
  const router = express.Router();

  router.get('/waiting', (_req, res) => {
    res.json({ request: toView(deps.waiting.latest(principalOf(res).userId)), serverTime: deps.clock.now() });
  });

  router.post('/waiting', (req, res) => {
    const body = bodyOf(req);
    const request = deps.waiting.create(principalOf(res).userId, { stopId: body.stopId, routeId: body.routeId });
    res.status(201).json({ request: toView(request), serverTime: deps.clock.now() });
  });

  router.delete('/waiting/:id', (req, res) => {
    const request = deps.waiting.cancel(principalOf(res).userId, param(req, 'id'));
    res.json({ request: toView(request), serverTime: deps.clock.now() });
  });

  return router;
}
