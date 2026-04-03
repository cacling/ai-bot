import { type Lang } from '../i18n';
import { type StaffRole } from './auth/api';

export type PrimaryView = 'workbench' | 'operations';
export type OperationsView = 'knowledge' | 'workorders' | 'customers';

export interface MenuItem {
  id: string;
  label: Record<Lang, string>;
  path: string;
  /** 可见角色集合（undefined = 全员可见） */
  roles?: StaffRole[];
  children?: MenuItem[];
}

export const MENU_TREE: MenuItem[] = [
  {
    id: 'workbench',
    label: { zh: '坐席工作台', en: 'Agent Workbench' },
    path: '/staff/workbench',
  },
  {
    id: 'operations',
    label: { zh: '运营管理', en: 'Operations' },
    path: '/staff/operations',
    roles: ['operations'],
    children: [
      { id: 'knowledge', label: { zh: '知识与技能', en: 'Knowledge & Skills' }, path: '/staff/operations/knowledge' },
      { id: 'workorders', label: { zh: '工单管理', en: 'Work Orders' }, path: '/staff/operations/workorders' },
      { id: 'routing', label: { zh: '路由管理', en: 'Routing Management' }, path: '/staff/operations/routing' },
      { id: 'customers', label: { zh: '客户管理', en: 'Customers' }, path: '/staff/operations/customers' },
    ],
  },
];

/** Breadcrumb path segment labels */
export const BREADCRUMB_LABELS: Record<string, Record<Lang, string>> = {
  workbench: { zh: '坐席工作台', en: 'Workbench' },
  operations: { zh: '运营管理', en: 'Operations' },
  knowledge: { zh: '知识与技能', en: 'Knowledge & Skills' },
  workorders: { zh: '工单管理', en: 'Work Orders' },
  documents: { zh: '知识管理', en: 'Documents' },
  skills: { zh: '技能管理', en: 'Skills' },
  tools: { zh: '工具管理', en: 'Tool Runtime' },
  items: { zh: '工单列表', en: 'Work Items' },
  intakes: { zh: '线索与草稿', en: 'Intakes' },
  threads: { zh: '事项主线', en: 'Threads' },
  routing: { zh: '路由管理', en: 'Routing Management' },
  overview: { zh: '路由总览', en: 'Overview' },
  rules: { zh: '路由规则', en: 'Rules' },
  scoring: { zh: '打分策略', en: 'Scoring' },
  overflow: { zh: '溢出与降级', en: 'Overflow' },
  monitor: { zh: '实时监控', en: 'Monitor' },
  logs: { zh: '日志与回放', en: 'Logs & Replay' },
  customers: { zh: '客户管理', en: 'Customers' },
  list: { zh: '客户列表', en: 'Customer List' },
  detail: { zh: '客户详情', en: 'Customer Detail' },
  tags: { zh: '标签管理', en: 'Tag Management' },
  segments: { zh: '客户分群', en: 'Segments' },
  lifecycle: { zh: '生命周期', en: 'Lifecycle' },
  'identity-merge': { zh: '身份合并', en: 'Identity Merge' },
  'import-export': { zh: '导入导出', en: 'Import/Export' },
  'blacklist-consent': { zh: '黑名单/隐私', en: 'Blacklist/Consent' },
  'audit-log': { zh: '操作日志', en: 'Audit Log' },
};
