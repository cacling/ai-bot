/**
 * CustomerLayout.tsx — Layout for /staff/operations/customers/* routes.
 *
 * 9 sub-pages grouped into 3 sections:
 * - 运营能力: 客户列表、标签管理、客户分群、生命周期
 * - 数据治理: 身份合并、导入导出
 * - 合规审计: 黑名单/隐私、操作日志
 *
 * Customer Detail is accessed via list row click, not via tab bar.
 * Uses CSS hidden toggle to preserve state across tabs.
 */
import { useNavigate, useLocation } from 'react-router-dom';
import {
  List,
  Tags,
  UsersRound,
  Activity,
  GitMerge,
  ArrowDownUp,
  ShieldBan,
  FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useAgentContext } from '../AgentContext';
import { CustomerListPage } from './pages/CustomerListPage';
import { CustomerDetailPage } from './pages/CustomerDetailPage';
import { AuditLogPage } from './pages/AuditLogPage';
import { TagManagementPage } from './pages/TagManagementPage';
import { BlacklistConsentPage } from './pages/BlacklistConsentPage';
import { SegmentPage } from './pages/SegmentPage';
import { LifecyclePage } from './pages/LifecyclePage';
import { IdentityMergePage } from './pages/IdentityMergePage';
import { ImportExportPage } from './pages/ImportExportPage';

type CustomerSub =
  | 'list' | 'detail'
  | 'tags' | 'segments' | 'lifecycle'
  | 'identity-merge' | 'import-export'
  | 'blacklist-consent' | 'audit-log';

interface TabDef {
  id: CustomerSub;
  path: string;
  Icon: typeof List;
  label: Record<string, string>;
  group: 'ops' | 'governance' | 'compliance';
}

const TABS: TabDef[] = [
  // 运营能力
  { id: 'list', path: '/staff/operations/customers/list', Icon: List, label: { zh: '客户列表', en: 'Customers' }, group: 'ops' },
  { id: 'tags', path: '/staff/operations/customers/tags', Icon: Tags, label: { zh: '标签管理', en: 'Tags' }, group: 'ops' },
  { id: 'segments', path: '/staff/operations/customers/segments', Icon: UsersRound, label: { zh: '客户分群', en: 'Segments' }, group: 'ops' },
  { id: 'lifecycle', path: '/staff/operations/customers/lifecycle', Icon: Activity, label: { zh: '生命周期', en: 'Lifecycle' }, group: 'ops' },
  // 数据治理
  { id: 'identity-merge', path: '/staff/operations/customers/identity-merge', Icon: GitMerge, label: { zh: '身份合并', en: 'ID Merge' }, group: 'governance' },
  { id: 'import-export', path: '/staff/operations/customers/import-export', Icon: ArrowDownUp, label: { zh: '导入导出', en: 'Import/Export' }, group: 'governance' },
  // 合规审计
  { id: 'blacklist-consent', path: '/staff/operations/customers/blacklist-consent', Icon: ShieldBan, label: { zh: '黑名单/隐私', en: 'Blacklist' }, group: 'compliance' },
  { id: 'audit-log', path: '/staff/operations/customers/audit-log', Icon: FileText, label: { zh: '操作日志', en: 'Audit Log' }, group: 'compliance' },
];

const GROUP_LABELS: Record<string, Record<string, string>> = {
  ops: { zh: '运营', en: 'Ops' },
  governance: { zh: '治理', en: 'Gov' },
  compliance: { zh: '合规', en: 'Comp' },
};

function subFromPath(pathname: string): CustomerSub {
  if (pathname.includes('/detail/')) return 'detail';
  for (const tab of TABS) {
    if (pathname.includes(`/${tab.id}`)) return tab.id;
  }
  return 'list';
}

export function CustomerLayout() {
  const { lang } = useAgentContext();
  const navigate = useNavigate();
  const location = useLocation();
  const activeSub = subFromPath(location.pathname);

  // Group tabs by section
  const groups = ['ops', 'governance', 'compliance'] as const;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Tab bar — hidden when viewing detail */}
      {activeSub !== 'detail' && (
        <div className="bg-background border-b border-border px-4 flex items-center h-9 flex-shrink-0 gap-0">
          {groups.map((group, gi) => {
            const groupTabs = TABS.filter((t) => t.group === group);
            return (
              <div key={group} className="flex items-center">
                {gi > 0 && <Separator orientation="vertical" className="h-4 mx-1" />}
                <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider mr-1 select-none">
                  {GROUP_LABELS[group][lang]}
                </span>
                {groupTabs.map((tab) => {
                  const isActive = activeSub === tab.id;
                  const isEnabled = true;
                  return (
                    <Button
                      key={tab.id}
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate(tab.path)}
                      disabled={!isEnabled}
                      className={`flex items-center gap-1.5 px-3 h-full rounded-none text-xs font-medium border-b-2 transition-colors ${
                        isActive
                          ? 'border-primary text-primary'
                          : isEnabled
                            ? 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                            : 'border-transparent text-muted-foreground/40 cursor-not-allowed'
                      }`}
                    >
                      <tab.Icon size={13} />
                      {tab.label[lang]}
                    </Button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* Pages — CSS hidden toggle to preserve state */}
      <div className="flex-1 overflow-hidden relative">
        <div className={`absolute inset-0 ${activeSub !== 'list' ? 'hidden' : ''}`}>
          <CustomerListPage />
        </div>
        <div className={`absolute inset-0 ${activeSub !== 'detail' ? 'hidden' : ''}`}>
          {activeSub === 'detail' && <CustomerDetailPage />}
        </div>
        <div className={`absolute inset-0 ${activeSub !== 'audit-log' ? 'hidden' : ''}`}>
          <AuditLogPage />
        </div>
        <div className={`absolute inset-0 ${activeSub !== 'tags' ? 'hidden' : ''}`}>
          <TagManagementPage />
        </div>
        <div className={`absolute inset-0 ${activeSub !== 'blacklist-consent' ? 'hidden' : ''}`}>
          <BlacklistConsentPage />
        </div>
        <div className={`absolute inset-0 ${activeSub !== 'segments' ? 'hidden' : ''}`}>
          <SegmentPage />
        </div>
        <div className={`absolute inset-0 ${activeSub !== 'lifecycle' ? 'hidden' : ''}`}>
          <LifecyclePage />
        </div>
        <div className={`absolute inset-0 ${activeSub !== 'identity-merge' ? 'hidden' : ''}`}>
          <IdentityMergePage />
        </div>
        <div className={`absolute inset-0 ${activeSub !== 'import-export' ? 'hidden' : ''}`}>
          <ImportExportPage />
        </div>
      </div>
    </div>
  );
}
