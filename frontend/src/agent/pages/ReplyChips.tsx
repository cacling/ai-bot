/**
 * ReplyChips.tsx — Context-aware action chips above the input area.
 *
 * Reads reply_options and suggested_actions from agent_copilot card state.
 * Supports action types:
 *   - insert_text: Inserts text into the reply input
 *   - open_dialog: Opens a dialog (e.g., create work order, callback)
 *   - execute_action: Triggers an action (e.g., transfer, wrap up)
 */
import { memo } from 'react';
import { Sparkles, ClipboardList, PhoneOutgoing, ArrowRightLeft, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { type Lang } from '../../i18n';
import { type CardState } from '../cards/registry';

type ChipActionType = 'insert_text' | 'open_dialog' | 'execute_action';

interface ReplyChipsProps {
  lang: Lang;
  cardStates: CardState[];
}

interface ReplyOption {
  label: string;
  text: string;
  source: string;
}

interface SuggestedAction {
  label: string;
  action_type: ChipActionType;
  /** For insert_text: the text to insert */
  text?: string;
  /** For open_dialog: dialog name (e.g., "create_wo", "callback") */
  dialog?: string;
  /** For execute_action: action name (e.g., "wrap_up", "transfer_bot") */
  action?: string;
  /** Optional icon hint */
  icon?: string;
}

interface CopilotCardData {
  recommendations?: {
    reply_options?: ReplyOption[];
    suggested_actions?: SuggestedAction[];
    asset_version_id?: string;
  };
}

const ACTION_ICONS: Record<string, typeof ClipboardList> = {
  create_wo: ClipboardList,
  callback: PhoneOutgoing,
  transfer: ArrowRightLeft,
  wrap_up: CheckCircle2,
};

const ACTION_STYLES: Record<ChipActionType, string> = {
  insert_text: 'bg-primary/5 text-primary border-primary/20 hover:bg-primary/10 hover:border-primary/40',
  open_dialog: 'bg-warning/5 text-warning border-warning/20 hover:bg-warning/10 hover:border-warning/40',
  execute_action: 'bg-muted text-foreground border-border hover:bg-accent hover:border-accent',
};

export const ReplyChips = memo(function ReplyChips({ lang, cardStates }: ReplyChipsProps) {
  const copilotCard = cardStates.find((c) => c.id === 'agent_copilot');
  const data = copilotCard?.data as CopilotCardData | null | undefined;
  const options = data?.recommendations?.reply_options;
  const suggestedActions = data?.recommendations?.suggested_actions;

  const hasOptions = options && options.length > 0;
  const hasActions = suggestedActions && suggestedActions.length > 0;

  if (!hasOptions && !hasActions) return null;

  const assetVersionId = data?.recommendations?.asset_version_id ?? '';

  const handleReplyClick = (opt: ReplyOption) => {
    window.dispatchEvent(
      new CustomEvent('reply-copilot-action', {
        detail: { type: 'insert_text', text: opt.text, assetVersionId },
      }),
    );
  };

  const handleActionClick = (action: SuggestedAction) => {
    window.dispatchEvent(
      new CustomEvent('reply-copilot-action', {
        detail: {
          type: action.action_type,
          text: action.text,
          dialog: action.dialog,
          action: action.action,
          assetVersionId,
        },
      }),
    );
  };

  return (
    <div className="px-3 py-1.5 flex-shrink-0">
      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
        <Sparkles size={12} className="text-muted-foreground flex-shrink-0" />

        {/* Reply text chips */}
        {options?.slice(0, 3).map((opt, i) => (
          <Button
            key={`reply-${i}`}
            variant="outline"
            size="sm"
            onClick={() => handleReplyClick(opt)}
            className={`rounded-full text-xs whitespace-nowrap max-w-[200px] truncate h-7 px-2.5 ${ACTION_STYLES.insert_text}`}
            title={opt.text}
          >
            {opt.label}
          </Button>
        ))}

        {/* Suggested action chips */}
        {suggestedActions?.slice(0, 3).map((action, i) => {
          const Icon = action.icon ? ACTION_ICONS[action.icon] : null;
          return (
            <Button
              key={`action-${i}`}
              variant="outline"
              size="sm"
              onClick={() => handleActionClick(action)}
              className={`rounded-full text-xs whitespace-nowrap h-7 px-2.5 ${ACTION_STYLES[action.action_type]}`}
              title={action.text ?? action.label}
            >
              {Icon && <Icon size={11} className="mr-1" />}
              {action.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
});
