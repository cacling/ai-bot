/**
 * KnowledgeManagementPage.tsx — 知识管理主容器（左侧导航+右侧内容区）
 */
import React, { useState, useCallback } from 'react';
import { FileText, Inbox, PackageCheck, Archive, ClipboardList, Shield, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DocumentListPage } from './DocumentListPage';
import { DocumentDetailPage } from './DocumentDetailPage';
import { CandidateListPage } from './CandidateListPage';
import { CandidateDetailPage } from './CandidateDetailPage';
import { ReviewPackageListPage } from './ReviewPackageListPage';
import { ReviewPackageDetailPage } from './ReviewPackageDetailPage';
import { ActionDraftListPage } from './ActionDraftListPage';
import { AssetListPage } from './AssetListPage';
import { AssetDetailPage } from './AssetDetailPage';
import { TaskListPage } from './TaskListPage';
import { AuditLogPage } from './AuditLogPage';

export type KMPage =
  | { view: 'documents' }
  | { view: 'document-detail'; id: string }
  | { view: 'candidates' }
  | { view: 'candidate-detail'; id: string }
  | { view: 'review-packages' }
  | { view: 'review-detail'; id: string }
  | { view: 'action-drafts' }
  | { view: 'assets' }
  | { view: 'asset-detail'; id: string }
  | { view: 'tasks' }
  | { view: 'audit-logs' };

interface NavItem {
  key: string;
  label: string;
  icon: React.ElementType;
  view: KMPage['view'];
}

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: '文档管理',
    items: [{ key: 'documents', label: '文档列表', icon: FileText, view: 'documents' }],
  },
  {
    label: '知识候选',
    items: [{ key: 'candidates', label: '候选列表', icon: Inbox, view: 'candidates' }],
  },
  {
    label: '评审与发布',
    items: [
      { key: 'review-packages', label: '评审包', icon: PackageCheck, view: 'review-packages' },
      { key: 'action-drafts', label: '动作草案', icon: ClipboardList, view: 'action-drafts' },
    ],
  },
  {
    label: '资产中心',
    items: [{ key: 'assets', label: '发布资产', icon: Archive, view: 'assets' }],
  },
  {
    label: '运维与治理',
    items: [
      { key: 'tasks', label: '治理任务', icon: ClipboardList, view: 'tasks' },
      { key: 'audit-logs', label: '审计日志', icon: Shield, view: 'audit-logs' },
    ],
  },
];

export function KnowledgeManagementPage() {
  const [page, setPage] = useState<KMPage>({ view: 'documents' });
  const navigate = useCallback((p: KMPage) => setPage(p), []);

  const activeView = page.view.replace(/-detail$/, 's').replace('review-detail', 'review-packages');

  return (
    <div className="flex h-full bg-background">
      {/* 左侧导航 */}
      <nav className="w-48 flex-shrink-0 bg-background border-r overflow-y-auto py-2">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-1">
            <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              {group.label}
            </div>
            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive = activeView === item.key ||
                (item.key === 'review-packages' && page.view === 'review-detail');
              return (
                <Button
                  key={item.key}
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate({ view: item.view } as KMPage)}
                  className={`w-full justify-start gap-2 rounded-none text-xs ${
                    isActive
                      ? 'bg-accent text-accent-foreground font-medium'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Icon size={13} />
                  {item.label}
                  {isActive && <ChevronRight size={11} className="ml-auto" />}
                </Button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* 右侧内容区 */}
      <main className="flex-1 overflow-auto">
        {renderPage(page, navigate)}
      </main>
    </div>
  );
}

function renderPage(page: KMPage, navigate: (p: KMPage) => void) {
  switch (page.view) {
    case 'documents':
      return <DocumentListPage navigate={navigate} />;
    case 'document-detail':
      return <DocumentDetailPage id={page.id} navigate={navigate} />;
    case 'candidates':
      return <CandidateListPage navigate={navigate} />;
    case 'candidate-detail':
      return <CandidateDetailPage id={page.id} navigate={navigate} />;
    case 'review-packages':
      return <ReviewPackageListPage navigate={navigate} />;
    case 'review-detail':
      return <ReviewPackageDetailPage id={page.id} navigate={navigate} />;
    case 'action-drafts':
      return <ActionDraftListPage navigate={navigate} />;
    case 'assets':
      return <AssetListPage navigate={navigate} />;
    case 'asset-detail':
      return <AssetDetailPage id={page.id} navigate={navigate} />;
    case 'tasks':
      return <TaskListPage navigate={navigate} />;
    case 'audit-logs':
      return <AuditLogPage />;
  }
}
