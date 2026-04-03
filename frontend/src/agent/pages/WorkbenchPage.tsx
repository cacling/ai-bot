/**
 * WorkbenchPage.tsx — Renders the agent workbench (inbox + chat + cards).
 *
 * All per-interaction state (messages, cards, typing, botMode, inputValue)
 * now comes from InboxContext. AgentContext only provides layout-level state.
 */
import { useCallback } from 'react';
import { AgentWorkbenchPane } from './AgentWorkbenchPane';
import { useAgentContext } from '../AgentContext';
import {
  useInboxContext,
  getFocusedInteraction,
  getFocusedMessages,
  getFocusedCardStates,
  getFocusedTyping,
  getFocusedBotMode,
  getFocusedInputValue,
} from '../inbox/InboxContext';
import { InboxPanel } from '../inbox';
import { type CardState } from '../cards/registry';

export function WorkbenchPage() {
  const ctx = useAgentContext();
  const { inbox, transferInteraction, wrapUp, updateCardStates } = useInboxContext();

  const focusedInteraction = getFocusedInteraction(inbox);
  const messages = getFocusedMessages(inbox);
  const cardStates = getFocusedCardStates(inbox);
  const isTyping = getFocusedTyping(inbox);
  const botMode = getFocusedBotMode(inbox);
  const inputValue = getFocusedInputValue(inbox);

  const handleUpdateCards = useCallback((cards: CardState[]) => {
    if (inbox.focusedInteractionId) {
      updateCardStates(inbox.focusedInteractionId, cards);
    }
  }, [inbox.focusedInteractionId, updateCardStates]);

  return (
    <div className="flex h-full overflow-hidden">
      <InboxPanel lang={ctx.lang} />
      <div className="flex-1 overflow-hidden">
        <AgentWorkbenchPane
          lang={ctx.lang}
          messages={messages}
          cardStates={cardStates}
          inputValue={inputValue}
          isTyping={isTyping}
          isConnected={ctx.isConnected}
          botMode={botMode}
          interactionId={inbox.focusedInteractionId}
          interaction={focusedInteraction}
          textareaRef={ctx.textareaRef}
          messagesEndRef={ctx.messagesEndRef}
          onInputChange={ctx.onInputChange}
          onKeyDown={ctx.onKeyDown}
          onSend={ctx.onSend}
          onTransferToBot={ctx.onTransferToBot}
          onTransferQueue={(targetQueue) => {
            if (inbox.focusedInteractionId) transferInteraction(inbox.focusedInteractionId, targetQueue);
          }}
          onWrapUp={wrapUp}
          onUpdateCards={handleUpdateCards}
        />
      </div>
    </div>
  );
}
