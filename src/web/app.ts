import express from 'express';
import type { WebDeps } from './deps.ts';
import { errorHandler, requireRole, sendError } from './http.ts';
import { authenticate, csrfGuard, requireAuth, securityHeaders } from './middleware.ts';
import { authRoutes } from './routes/auth-routes.ts';
import { driverRoutes } from './routes/driver-routes.ts';
import { officeRoutes } from './routes/office-routes.ts';
import { sharedRoutes } from './routes/shared-routes.ts';
import { studentRoutes } from './routes/student-routes.ts';

/**
 * HTTP adapter. Translates HTTP into application-service calls and back;
 * holds no business rules. Role checks happen here, at the edge, before any
 * service is reached.
 */
export function createApp(deps: WebDeps): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(securityHeaders);
  app.use(express.json({ limit: '64kb' }));
  app.use(authenticate(deps.auth));
  app.use('/api', csrfGuard);

  app.use('/api/auth', authRoutes(deps));
  app.use('/api', requireAuth, sharedRoutes(deps));
  app.use('/api/student', requireRole('student'), studentRoutes(deps));
  app.use('/api/driver', requireRole('driver'), driverRoutes(deps));
  app.use('/api/office', requireRole('office'), officeRoutes(deps));
  app.use('/api', (_req, res) => sendError(res, 404, 'NOT_FOUND', 'No such endpoint.'));

  app.use(express.static(deps.settings.publicDir, { extensions: ['html'], index: 'index.html' }));
  app.use(errorHandler);
  return app;
}
