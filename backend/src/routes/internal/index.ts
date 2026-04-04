import { Hono } from 'hono';
import notifyRoutes from './notify';

const internalRouter = new Hono();
internalRouter.route('/notify', notifyRoutes);

// P2:
// import outboundRoutes from './outbound';
// internalRouter.route('/outbound', outboundRoutes);

export default internalRouter;
