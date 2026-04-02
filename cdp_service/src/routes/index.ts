import { Hono } from 'hono';
import identityRoutes from './identity';
import partyRoutes from './party';
import identityLinkRoutes from './identity-link';
import sourceRecordRoutes from './source-record';
import resolutionCaseRoutes from './resolution-case';
import preferenceRoutes from './preference';
import consentRoutes from './consent';
import profileRoutes from './profile';
import eventRoutes from './event';
import customerRoutes from './customer';
import auditLogRoutes from './audit-log';
import tagRoutes from './tag';
import blacklistRoutes from './blacklist';
import segmentRoutes from './segment';
import lifecycleRoutes from './lifecycle';
import importExportRoutes from './import-export';

const router = new Hono();

// Phase 1: 核心主体
router.route('/identity', identityRoutes);
router.route('/party', partyRoutes);
// Phase 2: Identity Graph 治理
router.route('/identity-links', identityLinkRoutes);
router.route('/source-records', sourceRecordRoutes);
router.route('/resolution-cases', resolutionCaseRoutes);
// Phase 3: 联系治理
router.route('/preferences', preferenceRoutes);
router.route('/consents', consentRoutes);
// Phase 4: 消费视图
router.route('/views', profileRoutes);
// Phase 5: 事实事件 + household
router.route('/', eventRoutes);
// Phase 6: 客户管理
router.route('/customers', customerRoutes);
router.route('/audit-logs', auditLogRoutes);
router.route('/tags', tagRoutes);
router.route('/blacklist', blacklistRoutes);
router.route('/segments', segmentRoutes);
router.route('/lifecycle', lifecycleRoutes);
router.route('/tasks', importExportRoutes);

export default router;
