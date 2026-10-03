import { Router } from 'express';

export const healthRouter = Router();

// Liveness only. This does not claim that a database or scanner is available.
healthRouter.get('/', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ status: 'ok', service: 'ewaguard-api' });
});
