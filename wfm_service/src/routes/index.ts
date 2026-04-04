import { Hono } from 'hono';
import activities from './activities';
import shifts from './shifts';
import contracts from './contracts';
import groups from './groups';
import staffSkills from './staff-skills';
import leaves from './leaves';
import plans from './plans';
import staffing from './staffing';
import planEdits from './plan-edits';
import rules from './rules';

const router = new Hono();

// P1 阶段: 主数据 CRUD
router.route('/activities', activities);
router.route('/shifts', shifts);
router.route('/contracts', contracts);
router.route('/groups', groups);
router.route('/staff-skills', staffSkills);
router.route('/leaves', leaves);

// P2 阶段: 排班计划 + 人力需求
router.route('/plans', plans);
router.route('/staffing', staffing);

// P3 阶段: 排班编辑
router.route('/plans', planEdits);

// P4 阶段: 规则管理
router.route('/rules', rules);

export default router;
