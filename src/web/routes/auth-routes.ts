import express from 'express';
import type { Principal } from '../../identity/model.ts';
import type { WebDeps } from '../deps.ts';
import { bodyOf, clearSessionCookie, sendError, sessionCookie } from '../http.ts';

export function authRoutes(deps: WebDeps): express.Router {
  const router = express.Router();

  router.post('/login', async (req, res) => {
    const body = bodyOf(req);
    const { principal, token, expiresAt } = await deps.auth.login(body.username, body.password);
    res.setHeader('Set-Cookie', sessionCookie(token, Math.floor(deps.settings.sessionTtlMs / 1000), deps.settings.secureCookies));
    res.json({ user: principal, expiresAt });
  });

  router.post('/logout', (_req, res) => {
    res.setHeader('Set-Cookie', clearSessionCookie(deps.settings.secureCookies));
    res.status(204).end();
  });

  router.get('/me', (_req, res) => {
    const principal = res.locals.principal as Principal | undefined;
    if (!principal) return void sendError(res, 401, 'UNAUTHENTICATED', 'Not signed in.');
    res.json({ user: principal });
  });

  return router;
}
