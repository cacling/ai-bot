import { type Lang } from '../i18n';
import { type StaffRole } from './auth/api';

export type PrimaryView = 'workbench' | 'operations';
export type OperationsView = 'knowledge' | 'workorders';

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
      { id: 'knowledge', label: { zh: '知识和工具库', en: 'Knowledge & Tools' }, path: '/staff/operations/knowledge' },
      { id: 'workorders', label: { zh: '工单管理', en: 'Work Orders' }, path: '/staff/operations/workorders' },
    ],
  },
];

/** Breadcrumb path segment labels */
export const BREADCRUMB_LABELS: Record<string, Record<Lang, string>> = {
  workbench: { zh: '坐席工作台', en: 'Workbench' },
  operations: { zh: '运营管理', en: 'Operations' },
  knowledge: { zh: '知识和工具库', en: 'Knowledge & Tools' },
  workorders: { zh: '工单管理', en: 'Work Orders' },
  documents: { zh: '知识管理', en: 'Documents' },
  skills: { zh: '技能管理', en: 'Skills' },
  tools: { zh: '工具管理', en: 'Tool Runtime' },
  items: { zh: '工单列表', en: 'Work Items' },
  intakes: { zh: '线索与草稿', en: 'Intakes' },
  threads: { zh: '事项主线', en: 'Threads' },
};
