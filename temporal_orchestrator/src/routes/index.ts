import { Hono } from 'hono';
import { callbackRoutes } from './callbacks.js';
import { handoffRoutes } from './handoffs.js';

// P2:
// import { outboundRoutes } from './outbound.js';
// P3:
// import { kmRoutes } from './km.js';
// P4:
// import { wfmRoutes } from './wfm.js';
// P5:
// import { analyticsRoutes } from './analytics.js';

const api = new Hono();

api.get('/health', (c) => c.json({ status: 'ok' }));

// P1
api.route('/api/temporal/callbacks', callbackRoutes);
api.route('/api/temporal/handoffs', handoffRoutes);

// P2:
// api.route('/api/temporal/outbound', outboundRoutes);
// P3:
// api.route('/api/temporal/km', kmRoutes);
// P4:
// api.route('/api/temporal/wfm', wfmRoutes);
// P5:
// api.route('/api/temporal/analytics', analyticsRoutes);

export { api };
