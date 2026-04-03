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

import { GitBranch, Smile, PhoneForwarded, PhoneCall, UserCircle, ShieldAlert, BotMessageSquare, ClipboardList, Clock, CalendarCheck, MessageSquareShare, Route } from 'lucide-react';
import { registerCard } from './registry';
import { DiagramContent      } from './contents/DiagramContent';
import { EmotionContent      } from './contents/EmotionContent';
import { HandoffContent      } from './contents/HandoffContent';
import { OutboundTaskContent } from './contents/OutboundTaskContent';
import { UserDetailContent   } from './contents/UserDetailContent';
import { ComplianceContent   } from './contents/ComplianceContent';
import { AgentCopilotContent } from './contents/AgentCopilotContent';
import { WorkOrderSummaryContent  } from './contents/WorkOrderSummaryContent';
import { WorkOrderTimelineContent } from './contents/WorkOrderTimelineContent';
import { AppointmentPanelContent  } from './contents/AppointmentPanelContent';
import { EngagementContent        } from './contents/EngagementContent';
import { RouteContextContent      } from './contents/RouteContextContent';

// Priority determines layout position (1 = highest, 10 = lowest).
// Higher-priority cards are placed higher in the layout.
// colSpan=2 cards render full-width; colSpan=1 cards are packed into two columns.

// ── 用户详情卡片 (col-span-1) ─────────────────────────────────────────────────
registerCard({
  id: 'user_detail',
  title: { zh: '用户详情', en: 'User Detail' },
  Icon: UserCircle,
  headerClass: 'bg-gradient-to-r from-gray-600 to-gray-500',
  colSpan: 1,
  priority: 1,
  defaultHeight: 220,
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
  priority: 2,
  defaultHeight: 100,
  defaultOpen: false,
  defaultCollapsed: false,
  wsEvents: ['outbound_task'],   // injected directly from AgentWorkstationPage
  dataExtractor: (msg) => msg.data,
  component: OutboundTaskContent,
  relevantQueues: ['outbound'],
});

// ── 情感分析卡片 (col-span-1) ────────────────────────────────────────────────
registerCard({
  id: 'emotion',
  title: { zh: '情感分析', en: 'Emotion' },
  Icon: Smile,
  headerClass: 'bg-gradient-to-r from-gray-600 to-gray-500',
  colSpan: 1,
  priority: 3,
  defaultHeight: 130,
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
  priority: 4,
  defaultHeight: 80,
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

// ── 转人工摘要卡片 (col-span-1) ───────────────────────────────────────────────
registerCard({
  id: 'handoff',
  title: { zh: '转人工摘要', en: 'Handoff Summary' },
  Icon: PhoneForwarded,
  headerClass: 'bg-gradient-to-r from-gray-600 to-gray-500',
  colSpan: 1,
  priority: 5,
  defaultHeight: 80,
  defaultOpen: false,
  defaultCollapsed: false,
  wsEvents: ['handoff_card'],
  dataExtractor: (msg) => msg.data,
  component: HandoffContent,
});

// ── 坐席助手卡片 (col-span-2, full width) ───────────────────────────────────
registerCard({
  id: 'agent_copilot',
  title: { zh: '坐席助手', en: 'Agent Copilot' },
  Icon: BotMessageSquare,
  headerClass: 'bg-gradient-to-r from-indigo-600 to-blue-500',
  colSpan: 2,
  priority: 3,
  defaultHeight: 240,
  defaultOpen: false,
  defaultCollapsed: false,
  wsEvents: ['agent_copilot', 'reply_hints'],
  dataExtractor: (msg) => msg.data,
  component: AgentCopilotContent,
});

// ── 流程图卡片 (col-span-2, full width) ─────────────────────────────────────
registerCard({
  id: 'diagram',
  title: { zh: '流程图', en: 'Flowchart' },
  Icon: GitBranch,
  headerClass: 'bg-gradient-to-r from-gray-600 to-gray-500',
  colSpan: 2,
  priority: 7,
  defaultHeight: 180,
  defaultOpen: true,
  defaultCollapsed: false,
  wsEvents: ['skill_diagram_update'],
  dataExtractor: (msg) => ({
    skill_name:    msg.skill_name,
    mermaid:       msg.mermaid,
    nodeTypeMap:   msg.node_type_map,
    progressState: msg.progress_state,
  }),
  component: DiagramContent,
});

// ── 工单概要卡片 (col-span-1) ──────────────────────────────────────────────
registerCard({
  id: 'work_order_summary',
  title: { zh: '工单概要', en: 'Work Order Summary' },
  Icon: ClipboardList,
  headerClass: 'bg-gradient-to-r from-gray-600 to-gray-500',
  colSpan: 1,
  priority: 2,
  defaultHeight: 200,
  defaultOpen: true,
  defaultCollapsed: false,
  wsEvents: ['work_item_summary', 'work_item_updated'],
  dataExtractor: (msg) => msg.data,
  component: WorkOrderSummaryContent,
});

// ── 预约详情卡片 (col-span-1) ──────────────────────────────────────────────
registerCard({
  id: 'appointment_panel',
  title: { zh: '预约详情', en: 'Appointment' },
  Icon: CalendarCheck,
  headerClass: 'bg-gradient-to-r from-gray-600 to-gray-500',
  colSpan: 1,
  priority: 3,
  defaultHeight: 160,
  defaultOpen: false,
  defaultCollapsed: false,
  wsEvents: ['appointment_update'],
  dataExtractor: (msg) => msg.data,
  component: AppointmentPanelContent,
});

// ── 公域互动上下文卡片 (col-span-1) ──────────────────────────────────────────
registerCard({
  id: 'engagement_context',
  title: { zh: '公域互动', en: 'Engagement' },
  Icon: MessageSquareShare,
  headerClass: 'bg-gradient-to-r from-gray-600 to-gray-500',
  colSpan: 1,
  priority: 4,
  defaultHeight: 180,
  defaultOpen: false,
  defaultCollapsed: false,
  wsEvents: ['engagement_context'],
  dataExtractor: (msg) => msg.data,
  component: EngagementContent,
  relevantQueues: ['public_engagement'],
});

// ── 路由上下文卡片 (col-span-1) ────────────────────────────────────────────
registerCard({
  id: 'route_context',
  title: { zh: '路由上下文', en: 'Route Context' },
  Icon: Route,
  headerClass: 'bg-gradient-to-r from-indigo-600 to-indigo-500',
  colSpan: 1,
  priority: 2,
  defaultHeight: 180,
  defaultOpen: true,
  defaultCollapsed: true,
  wsEvents: ['interaction_assigned'],
  dataExtractor: (msg) => msg.interaction,
  component: RouteContextContent,
});

// ── 工单时间线卡片 (col-span-2, full width) ─────────────────────────────────
registerCard({
  id: 'work_order_timeline',
  title: { zh: '工单时间线', en: 'Work Order Timeline' },
  Icon: Clock,
  headerClass: 'bg-gradient-to-r from-gray-600 to-gray-500',
  colSpan: 2,
  priority: 6,
  defaultHeight: 200,
  defaultOpen: true,
  defaultCollapsed: true,
  wsEvents: ['work_item_timeline'],
  dataExtractor: (msg) => msg.data,
  component: WorkOrderTimelineContent,
});
