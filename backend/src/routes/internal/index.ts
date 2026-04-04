import { Hono } from 'hono';
import notifyRoutes from './notify';
import outboundRoutes from './outbound';

const internalRouter = new Hono();
internalRouter.route('/notify', notifyRoutes);
internalRouter.route('/outbound', outboundRoutes);

export default internalRouter;
