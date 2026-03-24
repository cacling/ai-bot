/**
 * km/index.ts — 知识管理路由汇总
 */
import { Hono } from 'hono';
import documents from './documents';
import candidates from './candidates';
import evidence from './evidence';
import conflicts from './conflicts';
import reviewPackages from './review-packages';
import actionDrafts from './action-drafts';
import assets from './assets';
import tasks from './tasks';
import audit from './audit';
import replyCopilot from './reply-copilot';

const km = new Hono();

km.route('/documents', documents);
km.route('/candidates', candidates);
km.route('/evidence', evidence);
km.route('/conflicts', conflicts);
km.route('/review-packages', reviewPackages);
km.route('/action-drafts', actionDrafts);
km.route('/assets', assets);
km.route('/tasks', tasks);
km.route('/audit-logs', audit);
km.route('/reply-copilot', replyCopilot);

export default km;
