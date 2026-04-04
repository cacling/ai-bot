import { Hono } from 'hono';
import campaignsRoutes from './campaigns';
import tasksRoutes from './tasks';
import resultsRoutes from './results';
import testPersonasRoutes from './test-personas';
import internalRoutes from './internal';
import dashboardRoutes from './dashboard';

const router = new Hono();

// 营销活动管理
router.route('/campaigns', campaignsRoutes);

// 外呼任务（催收 + 营销）+ 回拨
router.route('/tasks', tasksRoutes);

// 结果记录（通话、营销、短信、转人工）
router.route('/results', resultsRoutes);

// 测试 Persona
router.route('/test-personas', testPersonasRoutes);

// 内部 API（供 Temporal Activity 调用）
router.route('/internal', internalRoutes);

// 效果看板聚合
router.route('/dashboard', dashboardRoutes);

export default router;
