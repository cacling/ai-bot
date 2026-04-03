import React, { memo, useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Bot, Send, Headset, User, MessageSquare, PlusCircle, Smile, StickyNote } from 'lucide-react';
import { CardMessage, type CardData } from '../../chat/CardMessage';
import { type Lang, T } from '../../i18n';
import { type CardState } from '../cards/registry';
import { CardPanel } from '../cards/CardPanel';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { Button } from '@/components/ui/button';
import { ActionBar } from './ActionBar';
import { ReplyChips } from './ReplyChips';
import { ConversationHeader } from './ConversationHeader';
import { type InboxInteraction } from '../inbox/InboxContext';

interface AgentMessage {
  id: number;
  msgId?: string;
  sender: 'bot' | 'agent' | 'customer' | 'system';
  text: string;
  translated_text?: string;
  time: string;
  card?: CardData;
  _ms?: number;
}

interface AgentWorkbenchPaneProps {
  lang: Lang;
  messages: AgentMessage[];
  cardStates: CardState[];
  inputValue: string;
  isTyping: boolean;
  isConnected: boolean;
  botMode: 'bot' | 'human';
  interactionId: string | null;
  interaction: InboxInteraction | undefined;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  onInputChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onSend: () => void;
  onTransferToBot: () => void;
  onTransferQueue: (targetQueue: string) => void;
  onWrapUp: (interactionId: string, code?: string, note?: string) => void;
  onUpdateCards: (cards: CardState[]) => void;
  onSendNote?: (text: string) => void;
}

export const AgentWorkbenchPane = memo(function AgentWorkbenchPane({
  lang,
  messages,
  cardStates,
  inputValue,
  isTyping,
  isConnected,
  interactionId,
  interaction,
  textareaRef,
  messagesEndRef,
  onInputChange,
  onKeyDown,
  onSend,
  onTransferToBot,
  onTransferQueue,
  onWrapUp,
  onUpdateCards,
  onSendNote,
}: AgentWorkbenchPaneProps) {
  const t = T[lang];
  const [noteMode, setNoteMode] = useState(false);

  const handleSend = useCallback(() => {
    if (noteMode && onSendNote) {
      onSendNote(inputValue);
    } else {
      onSend();
    }
  }, [noteMode, onSendNote, onSend, inputValue]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (noteMode && e.key === 'Enter' && !e.shiftKey && onSendNote) {
      e.preventDefault();
      onSendNote(inputValue);
      return;
    }
    onKeyDown(e);
  }, [noteMode, onSendNote, onKeyDown, inputValue]);

  return (
    <div className="h-full overflow-hidden p-4">
      <ResizablePanelGroup orientation="horizontal" className="h-full gap-4" id="agent-workstation">

        {/* Left: Chat dialog */}
        <ResizablePanel id="agent-chat" defaultSize="30%" minSize="20%" maxSize="50%">
        <div className="h-full bg-background rounded-2xl shadow-md border border-border flex flex-col overflow-hidden">

          {/* Dialog header */}
          <div className="flex items-center px-4 py-2.5 border-b border-border bg-muted flex-shrink-0">
            <MessageSquare size={15} className="text-muted-foreground mr-2" />
            <span className="text-sm font-medium text-foreground">{t.agent_dialog_title}</span>
          </div>

          {/* Conversation context header */}
          <ConversationHeader lang={lang} interaction={interaction} cardStates={cardStates} />

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center select-none space-y-3">
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                  <Bot size={28} className="text-primary/30" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">{t.agent_empty_title}</p>
                  <p className="text-xs text-muted-foreground/60">{t.agent_empty_subtitle}</p>
                </div>
              </div>
            )}

            {messages.map(msg => {
              // System events render as centered divider lines
              if (msg.sender === 'system') {
                return (
                  <div key={msg.id} className="flex items-center gap-2 py-1">
                    <div className="flex-1 border-t border-border" />
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">{msg.text}</span>
                    <div className="flex-1 border-t border-border" />
                  </div>
                );
              }

              const isLeft  = msg.sender === 'bot' || msg.sender === 'customer';
              const isAgent = msg.sender === 'agent';
              return (
                <div key={msg.id} className={`flex items-start gap-2 ${isLeft ? 'justify-start' : 'justify-end'}`}>
                  {msg.sender === 'bot' && (
                    <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Bot size={14} />
                    </div>
                  )}
                  {msg.sender === 'customer' && (
                    <div className="w-7 h-7 rounded-full bg-secondary text-primary flex items-center justify-center flex-shrink-0 mt-0.5">
                      <User size={14} />
                    </div>
                  )}

                  <div className={`flex flex-col ${isLeft ? 'flex-1 min-w-0' : 'max-w-[70%] items-end'}`}>
                    {msg.sender === 'customer' && (
                      <span className="text-[10px] text-primary font-medium mb-0.5 px-0.5">{t.agent_label_customer}</span>
                    )}
                    {isAgent && (
                      <span className="text-[10px] text-primary font-medium mb-0.5 px-0.5">{t.agent_label_agent}</span>
                    )}

                    {msg.text?.trim() && (
                      <div className={`px-3.5 py-2.5 rounded-xl text-sm leading-relaxed ${
                        msg.sender === 'bot'
                          ? 'bg-muted text-foreground border border-border rounded-tl-none'
                          : msg.sender === 'customer'
                          ? 'bg-secondary text-foreground border border-border rounded-tl-none'
                          : 'bg-primary text-primary-foreground rounded-tr-none'
                      }`}>
                        {msg.sender !== 'agent'
                          ? <div className="markdown-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text}</ReactMarkdown></div>
                          : msg.text}
                        {msg.translated_text?.trim() && (
                          <div className={`mt-1.5 pt-1.5 text-sm leading-relaxed ${
                            msg.sender === 'customer'
                              ? 'border-t border-border text-primary'
                              : 'border-t border-border text-primary'
                          }`}>
                            <div className="markdown-body">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.translated_text}</ReactMarkdown>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {msg.card && (
                      <div className="mt-2 w-full"><CardMessage card={msg.card} lang={lang} /></div>
                    )}
                    <div className="text-[11px] text-muted-foreground mt-1 px-0.5">
                      {msg.time}
                      {msg.sender === 'bot' && msg._ms != null && (
                        <span className="ml-1.5 text-muted-foreground/60">· {(msg._ms / 1000).toFixed(1)}s</span>
                      )}
                    </div>
                  </div>

                  {isAgent && (
                    <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Headset size={14} />
                    </div>
                  )}
                </div>
              );
            })}

            {isTyping && (
              <div className="flex items-center space-x-2">
                <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                  <Bot size={14} />
                </div>
                <div className="bg-muted border border-border px-3 py-2 rounded-xl rounded-tl-none flex items-center space-x-1">
                  <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Action toolbar */}
          <ActionBar
            lang={lang}
            isConnected={isConnected}
            interactionId={interactionId}
            queueCode={interaction?.queue_code}
            channel={interaction?.channel}
            onTransferToBot={onTransferToBot}
            onTransferQueue={onTransferQueue}
            onWrapUp={onWrapUp}
          />

          {/* Recommended reply chips */}
          <ReplyChips lang={lang} cardStates={cardStates} />

          {/* Input area */}
          <div className={`p-3 pt-2 pb-3 border-t flex-shrink-0 transition-colors ${
            noteMode ? 'bg-warning/5 border-warning/30' : 'bg-background border-border'
          }`}>
            {/* Note mode indicator */}
            {noteMode && (
              <div className="flex items-center gap-1.5 mb-1.5 text-[10px] text-warning font-medium">
                <StickyNote size={10} />
                {lang === 'zh' ? '内部备注模式 — 仅坐席可见' : 'Internal Note — visible to agents only'}
              </div>
            )}
            <div className="flex items-end space-x-2">
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary flex-shrink-0 mb-1">
                <PlusCircle size={24} strokeWidth={1.5} />
              </Button>

              {/* Note mode toggle */}
              <Button
                variant={noteMode ? 'secondary' : 'ghost'}
                size="icon"
                onClick={() => setNoteMode(!noteMode)}
                className={`flex-shrink-0 mb-1 ${noteMode ? 'text-warning bg-warning/10' : 'text-muted-foreground hover:text-warning'}`}
                title={lang === 'zh' ? '切换内部备注' : 'Toggle internal note'}
              >
                <StickyNote size={18} strokeWidth={1.5} />
              </Button>

              <div className={`flex-1 border rounded-2xl flex items-end relative overflow-hidden transition-all ${
                noteMode
                  ? 'bg-warning/5 border-warning/30 focus-within:border-warning focus-within:ring-1 focus-within:ring-warning'
                  : 'bg-muted border-border focus-within:border-ring focus-within:ring-1 focus-within:ring-ring'
              }`}>
                <textarea
                  ref={textareaRef}
                  value={inputValue}
                  onChange={e => onInputChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={noteMode
                    ? (lang === 'zh' ? '输入内部备注...' : 'Type internal note...')
                    : t.agent_reply_placeholder
                  }
                  disabled={isTyping || !isConnected}
                  className="w-full bg-transparent max-h-24 min-h-[40px] px-3 py-2.5 outline-none text-sm text-foreground resize-none scrollbar-hide disabled:opacity-60"
                  rows={1}
                />
                <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-foreground flex-shrink-0 mb-0.5">
                  <Smile size={20} strokeWidth={1.5} />
                </Button>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleSend}
                disabled={!inputValue.trim() || isTyping || !isConnected}
                className={`p-2.5 rounded-full flex-shrink-0 mb-0.5 transition-all shadow-sm ${
                  inputValue.trim() && !isTyping && isConnected
                    ? noteMode
                      ? 'bg-warning text-warning-foreground hover:bg-warning/90'
                      : 'bg-primary text-primary-foreground hover:bg-primary/90'
                    : 'bg-muted text-muted-foreground cursor-not-allowed'
                }`}
              >
                <Send size={18} />
              </Button>
            </div>
          </div>
        </div>
        </ResizablePanel>

        <ResizableHandle />

        {/* Right: Card panel */}
        <ResizablePanel id="agent-cards" defaultSize="70%" minSize="40%">
        <div className="h-full overflow-y-auto pb-4">
          <CardPanel cards={cardStates} lang={lang} queueCode={interaction?.queue_code} onUpdate={onUpdateCards} />
        </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
});
