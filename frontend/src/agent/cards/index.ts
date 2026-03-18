/**
 * cards/index.ts — register all agent-workstation cards
 *
 * Import this file once as a side-effect:
 *   import '../components/cards/index'
 *
 * To add a new card:
 *   1. Create content component in contents/
 *   2. Call registerCard() here
 */

import { GitBranch, Smile, PhoneForwarded, PhoneCall, UserCircle, ShieldAlert } from 'lucide-react';
import { registerCard } from './registry';
import { DiagramContent      } from './contents/DiagramContent';
import { EmotionContent      } from './contents/EmotionContent';
import { HandoffContent      } from './contents/HandoffContent';
import { OutboundTaskContent } from './contents/OutboundTaskContent';
import { UserDetailContent   } from './contents/UserDetailContent';
import { ComplianceContent   } from './contents/ComplianceContent';

// Registration order determines default layout.
// col-span-1 cards first → they pair side-by-side in row 1.
// col-span-2 cards last  → full-width row below.

// ── 用户详情卡片 (col-span-1) ─────────────────────────────────────────────────
registerCard({
  id: 'user_detail',
  title: { zh: '用户详情', en: 'User Detail' },
  Icon: UserCircle,
  headerClass: 'bg-gradient-to-r from-gray-600 to-gray-500',
  colSpan: 1,
  defaultOpen: true,
  defaultCollapsed: false,
  wsEvents: ['user_detail'],     // injected directly from AgentWorkstationPage
  dataExtractor: (msg) => msg.data,
  component: UserDetailContent,
});

// ── 外呼任务详情卡片 (col-span-1) ─────────────────────────────────────────────
registerCard({
  id: 'outbound_task',
  title: { zh: '外呼任务详情', en: 'Outbound Task' },
  Icon: PhoneCall,
  headerClass: 'bg-gradient-to-r from-gray-600 to-gray-500',
  colSpan: 1,
  defaultOpen: true,
  defaultCollapsed: false,
  wsEvents: ['outbound_task'],   // injected directly from AgentWorkstationPage
  dataExtractor: (msg) => msg.data,
  component: OutboundTaskContent,
});

// ── 情感分析卡片 (col-span-1, left) ───────────────────────────────────────────
registerCard({
  id: 'emotion',
  title: { zh: '情感分析', en: 'Emotion' },
  Icon: Smile,
  headerClass: 'bg-gradient-to-r from-gray-600 to-gray-500',
  colSpan: 1,
  defaultOpen: true,
  defaultCollapsed: false,
  wsEvents: ['emotion_update'],
  dataExtractor: (msg) => ({
    label: msg.label,
    emoji: msg.emoji,
    color: msg.color,
  }),
  component: EmotionContent,
});

// ── 合规监控卡片 (col-span-1) ─────────────────────────────────────────────────
registerCard({
  id: 'compliance',
  title: { zh: '合规监控', en: 'Compliance' },
  Icon: ShieldAlert,
  headerClass: 'bg-gradient-to-r from-gray-600 to-gray-500',
  colSpan: 1,
  defaultOpen: true,
  defaultCollapsed: false,
  wsEvents: ['compliance_alert'],
  dataExtractor: (msg) => {
    // 累积模式：返回新告警，CardPanel 负责追加到数组
    const d = msg.data as Record<string, unknown> | undefined;
    return { ...d, ts: Date.now() };
  },
  component: ComplianceContent,
});

// ── 转人工摘要卡片 (col-span-1, right) ────────────────────────────────────────
registerCard({
  id: 'handoff',
  title: { zh: '转人工摘要', en: 'Handoff Summary' },
  Icon: PhoneForwarded,
  headerClass: 'bg-gradient-to-r from-gray-600 to-gray-500',
  colSpan: 1,
  defaultOpen: true,
  defaultCollapsed: false,
  wsEvents: ['handoff_card'],
  dataExtractor: (msg) => msg.data,
  component: HandoffContent,
});

// ── 流程图卡片 (col-span-2, full width below) ──────────────────────────────────
registerCard({
  id: 'diagram',
  title: { zh: '流程图', en: 'Flowchart' },
  Icon: GitBranch,
  headerClass: 'bg-gradient-to-r from-gray-600 to-gray-500',
  colSpan: 2,
  defaultOpen: true,
  defaultCollapsed: false,
  wsEvents: ['skill_diagram_update'],
  dataExtractor: (msg) => ({
    skill_name: msg.skill_name,
    mermaid:    msg.mermaid,
  }),
  component: DiagramContent,
});
