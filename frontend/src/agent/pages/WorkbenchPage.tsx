/**
 * WorkbenchPage.tsx — Renders the agent workbench (chat + cards).
 * Consumes state from AgentContext provided by AgentWorkstationPage layout.
 */
import { AgentWorkbenchPane } from './AgentWorkbenchPane';
import { useAgentContext } from '../AgentContext';

export function WorkbenchPage() {
  const ctx = useAgentContext();

  return (
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
  );
}
