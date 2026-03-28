import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { router } from './api/routes';
import { startListening, initSSEBridge } from './lib/sse';
import { startListening as startPgListening } from './lib/db';
import { logger } from './lib/logger';

async function main() {
  const app = express();
  const PORT = parseInt(process.env.PORT || '3001');

  // ── Security middleware ─────────────────────────────────────────────────
  app.use(helmet({
    contentSecurityPolicy: false, // Handled by reverse proxy
  }));

  const corsOptions = {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
    optionsSuccessStatus: 200,
  };
  app.use(cors(corsOptions));
  app.options('*', cors(corsOptions));

  app.use(compression());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // ── Rate limiting ───────────────────────────────────────────────────────
  app.use('/api/', rateLimit({
    windowMs: 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests' },
  }));

  // ── Request logging ─────────────────────────────────────────────────────
  app.use((req, _res, next) => {
    logger.debug(`${req.method} ${req.path}`, { ip: req.ip, query: req.query });
    next();
  });

  // ── Async error wrapper — prevents unhandled rejections killing process ──
  const wrap = (fn: Function) => (req: express.Request, res: express.Response, next: express.NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
  app.set('asyncWrapper', wrap);

  // ── Routes ──────────────────────────────────────────────────────────────
  app.use('/api/v1', router);

  // ── 404 handler ─────────────────────────────────────────────────────────
  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

  // ── Global error handler ─────────────────────────────────────────────────
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error('Unhandled error', { err: err.message, stack: err.stack });
    res.status(500).json({ error: 'Internal server error' });
  });

  // ── Start PostgreSQL LISTEN/NOTIFY ──────────────────────────────────────
  await startPgListening();
  initSSEBridge();

  // ── Start server ─────────────────────────────────────────────────────────
  app.listen(PORT, () => {
    logger.info(`Restore backend running`, { port: PORT, env: process.env.NODE_ENV });
  });
}

main().catch(err => {
  console.error('Fatal startup error', err);
  process.exit(1);
});

// Prevent unhandled promise rejections from killing the process
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});
