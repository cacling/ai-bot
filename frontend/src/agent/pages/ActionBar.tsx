/**
 * ActionBar.tsx — Dynamic action toolbar between messages and input area.
 *
 * Actions are ordered by queue type. First 4 are shown inline,
 * remaining go into a "More" dropdown. Default order used when
 * queue is unknown.
 */
import { memo, useState, useMemo } from 'react';
import { Bot, ArrowRightLeft, ClipboardList, PhoneOutgoing, Users, CheckCircle2, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { type Lang } from '../../i18n';
import { TransferQueueDialog } from './TransferQueueDialog';
import { CreateFollowUpDialog } from './CreateFollowUpDialog';
import { WrapUpDialog } from '../inbox/WrapUpDialog';
import { type WrapUpData } from '../inbox/WrapUpDialog';

type ActionKey = 'transfer_bot' | 'transfer_queue' | 'collaborate' | 'create_wo' | 'callback' | 'wrap_up';

/** Actions hidden per channel (voice doesn't need transfer_bot, etc.) */
const CHANNEL_HIDDEN_ACTIONS: Record<string, Set<ActionKey>> = {
  phone: new Set(['transfer_bot']),
  voice: new Set(['transfer_bot']),
};

interface ActionBarProps {
  lang: Lang;
  isConnected: boolean;
  interactionId: string | null;
  queueCode?: string | null;
  channel?: string | null;
  onTransferToBot: () => void;
  onTransferQueue: (targetQueue: string) => void;
  onWrapUp: (interactionId: string, code?: string, note?: string) => void;
}

const ACTION_LABELS: Record<ActionKey, Record<Lang, string>> = {
  transfer_bot: { zh: '转机器人', en: 'To Bot' },
  transfer_queue: { zh: '转队列', en: 'Transfer' },
  collaborate: { zh: '协同处理', en: 'Collaborate' },
  create_wo: { zh: '建工单', en: 'Work Order' },
  callback: { zh: '预约回呼', en: 'Callback' },
  wrap_up: { zh: '收尾', en: 'Wrap Up' },
};

const ACTION_ICONS: Record<ActionKey, typeof Bot> = {
  transfer_bot: Bot,
  transfer_queue: ArrowRightLeft,
  collaborate: Users,
  create_wo: ClipboardList,
  callback: PhoneOutgoing,
  wrap_up: CheckCircle2,
};

/** Queue-specific action priority ordering */
const QUEUE_ACTION_PRIORITY: Record<string, ActionKey[]> = {
  fault_chat: ['create_wo', 'callback', 'transfer_queue', 'wrap_up', 'transfer_bot', 'collaborate'],
  cancel_chat: ['wrap_up', 'callback', 'transfer_queue', 'create_wo', 'transfer_bot', 'collaborate'],
  bill_chat: ['transfer_queue', 'create_wo', 'wrap_up', 'callback', 'transfer_bot', 'collaborate'],
  default: ['transfer_bot', 'transfer_queue', 'collaborate', 'create_wo', 'callback', 'wrap_up'],
};

/** Number of actions shown inline (rest in overflow menu) */
const VISIBLE_COUNT = 4;

export const ActionBar = memo(function ActionBar({
  lang,
  isConnected,
  interactionId,
  queueCode,
  channel,
  onTransferToBot,
  onTransferQueue,
  onWrapUp,
}: ActionBarProps) {
  const [transferOpen, setTransferOpen] = useState(false);
  const [wrapUpOpen, setWrapUpOpen] = useState(false);
  const [workOrderOpen, setWorkOrderOpen] = useState(false);
  const [callbackOpen, setCallbackOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const disabled = !isConnected || !interactionId;

  const handleWrapUpSubmit = (data: WrapUpData) => {
    if (interactionId) {
      onWrapUp(interactionId, data.wrap_up_code, data.wrap_up_note);
    }
  };

  // Resolve action order from queue code, then filter by channel
  const orderedActions = useMemo<ActionKey[]>(() => {
    let actions: ActionKey[];
    if (queueCode && QUEUE_ACTION_PRIORITY[queueCode]) {
      actions = QUEUE_ACTION_PRIORITY[queueCode];
    } else if (queueCode) {
      // Try prefix match (e.g., "fault_chat_vip" → "fault_chat")
      const match = Object.keys(QUEUE_ACTION_PRIORITY).find(
        (key) => key !== 'default' && queueCode.startsWith(key),
      );
      actions = match ? QUEUE_ACTION_PRIORITY[match] : QUEUE_ACTION_PRIORITY.default;
    } else {
      actions = QUEUE_ACTION_PRIORITY.default;
    }

    // Filter out actions not applicable to this channel
    const hidden = channel ? CHANNEL_HIDDEN_ACTIONS[channel] : undefined;
    return hidden ? actions.filter((a) => !hidden.has(a)) : actions;
  }, [queueCode, channel]);

  const visibleActions = orderedActions.slice(0, VISIBLE_COUNT);
  const overflowActions = orderedActions.slice(VISIBLE_COUNT);

  const handleAction = (key: ActionKey) => {
    switch (key) {
      case 'transfer_bot': onTransferToBot(); break;
      case 'transfer_queue': setTransferOpen(true); break;
      case 'create_wo': setWorkOrderOpen(true); break;
      case 'callback': setCallbackOpen(true); break;
      case 'wrap_up': setWrapUpOpen(true); break;
      case 'collaborate': break; // coming soon
    }
    setMoreOpen(false);
  };

  const isWrapUp = (key: ActionKey) => key === 'wrap_up';
  const btnClass = (key: ActionKey) =>
    `whitespace-nowrap rounded-full text-xs shadow-sm transition ${
      isWrapUp(key)
        ? 'hover:border-destructive hover:text-destructive'
        : 'hover:border-primary hover:text-primary'
    }`;

  const renderActionButton = (key: ActionKey, isOverflow = false) => {
    const Icon = ACTION_ICONS[key];
    const label = ACTION_LABELS[key][lang];
    const isDisabled = key === 'transfer_bot' ? !isConnected : disabled;

    if (isOverflow) {
      return (
        <button
          key={key}
          onClick={() => handleAction(key)}
          disabled={isDisabled}
          className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Icon size={13} />
          {label}
        </button>
      );
    }

    return (
      <Button
        key={key}
        variant="outline"
        size="sm"
        onClick={() => handleAction(key)}
        disabled={isDisabled}
        className={btnClass(key)}
        title={key === 'collaborate' ? (lang === 'zh' ? '协同处理（即将推出）' : 'Collaborate (coming soon)') : undefined}
      >
        <Icon size={13} className="mr-1" />
        {label}
      </Button>
    );
  };

  return (
    <>
      <div className="bg-background/60 backdrop-blur-md border-t border-border px-3 py-2.5 flex-shrink-0">
        <div className="flex items-center space-x-2 overflow-x-auto scrollbar-hide">
          {visibleActions.map((key) => renderActionButton(key))}

          {/* Overflow menu */}
          {overflowActions.length > 0 && (
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMoreOpen(!moreOpen)}
                className="whitespace-nowrap rounded-full text-xs shadow-sm"
              >
                <MoreHorizontal size={13} className="mr-1" />
                {lang === 'zh' ? '更多' : 'More'}
              </Button>
              {moreOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMoreOpen(false)} />
                  <div className="absolute bottom-full left-0 mb-1 bg-popover border border-border rounded-md shadow-md py-1 z-50 min-w-[140px]">
                    {overflowActions.map((key) => renderActionButton(key, true))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <TransferQueueDialog
        open={transferOpen}
        lang={lang}
        onClose={() => setTransferOpen(false)}
        onTransfer={(queue) => {
          if (interactionId) onTransferQueue(queue);
        }}
      />

      {interactionId && (
        <>
          <WrapUpDialog
            open={wrapUpOpen}
            interactionId={interactionId}
            lang={lang}
            onClose={() => setWrapUpOpen(false)}
            onSubmit={handleWrapUpSubmit}
          />
          <CreateFollowUpDialog
            open={workOrderOpen}
            followUpType="ticket"
            interactionId={interactionId}
            lang={lang}
            onClose={() => setWorkOrderOpen(false)}
          />
          <CreateFollowUpDialog
            open={callbackOpen}
            followUpType="callback"
            interactionId={interactionId}
            lang={lang}
            onClose={() => setCallbackOpen(false)}
          />
        </>
      )}
    </>
  );
});
