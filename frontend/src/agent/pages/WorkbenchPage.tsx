/**
 * WorkbenchPage.tsx — Renders the agent workbench (inbox + chat + cards).
 * Consumes state from AgentContext provided by AgentWorkstationPage layout.
 * InboxPanel is shown here (not in top-level layout) so it only appears on the workbench route.
 */
import { AgentWorkbenchPane } from './AgentWorkbenchPane';
import { useAgentContext } from '../AgentContext';
import { InboxPanel } from '../inbox';

export function WorkbenchPage() {
  const ctx = useAgentContext();

  return (
    <div className="flex h-full overflow-hidden">
      <InboxPanel lang={ctx.lang} />
      <div className="flex-1 overflow-hidden">
        <AgentWorkbenchPane
          lang={ctx.lang}
          messages={ctx.messages}
          cardStates={ctx.cardStates}
          inputValue={ctx.inputValue}
          isTyping={ctx.isTyping}
          isConnected={ctx.isConnected}
          botMode={ctx.botMode}
          textareaRef={ctx.textareaRef}
          messagesEndRef={ctx.messagesEndRef}
          onInputChange={ctx.onInputChange}
          onKeyDown={ctx.onKeyDown}
          onSend={ctx.onSend}
          onTransferToBot={ctx.onTransferToBot}
          onUpdateCards={ctx.onUpdateCards}
        />
      </div>
    </div>
  );
}
