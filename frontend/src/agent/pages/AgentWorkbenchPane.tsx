import React, { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Bot, Send, Headset, User, MessageSquare, PlusCircle, Smile } from 'lucide-react';
import { CardMessage, type CardData } from '../../chat/CardMessage';
import { type Lang, T } from '../../i18n';
import { type CardState } from '../cards/registry';
import { CardPanel } from '../cards/CardPanel';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { Button } from '@/components/ui/button';

interface AgentMessage {
  id: number;
  msgId?: string;
  sender: 'bot' | 'agent' | 'customer';
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
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  onInputChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onSend: () => void;
  onTransferToBot: () => void;
  onUpdateCards: (cards: CardState[]) => void;
}

export const AgentWorkbenchPane = memo(function AgentWorkbenchPane({
  lang,
  messages,
  cardStates,
  inputValue,
  isTyping,
  isConnected,
  textareaRef,
  messagesEndRef,
  onInputChange,
  onKeyDown,
  onSend,
  onTransferToBot,
  onUpdateCards,
}: AgentWorkbenchPaneProps) {
  const t = T[lang];

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

          {/* Toolbar */}
          <div className="bg-background/60 backdrop-blur-md border-t border-border px-3 py-2.5 flex-shrink-0">
            <div className="flex items-center space-x-2 overflow-x-auto scrollbar-hide">
              <Button
                variant="outline"
                size="sm"
                onClick={onTransferToBot}
                disabled={!isConnected}
                className="whitespace-nowrap rounded-full text-xs shadow-sm hover:border-primary hover:text-primary transition"
              >
                {t.transfer_to_bot}
              </Button>
            </div>
          </div>

          {/* Input area */}
          <div className="bg-background p-3 pt-2 pb-3 border-t border-border flex-shrink-0">
            <div className="flex items-end space-x-2">
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary flex-shrink-0 mb-1">
                <PlusCircle size={24} strokeWidth={1.5} />
              </Button>
              <div className="flex-1 bg-muted border border-border rounded-2xl flex items-end relative overflow-hidden focus-within:border-ring focus-within:ring-1 focus-within:ring-ring transition-all">
                <textarea
                  ref={textareaRef}
                  value={inputValue}
                  onChange={e => onInputChange(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder={t.agent_reply_placeholder}
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
                onClick={onSend}
                disabled={!inputValue.trim() || isTyping || !isConnected}
                className={`p-2.5 rounded-full flex-shrink-0 mb-0.5 transition-all shadow-sm ${
                  inputValue.trim() && !isTyping && isConnected
                    ? 'bg-primary text-primary-foreground hover:bg-primary/90'
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
          <CardPanel cards={cardStates} lang={lang} onUpdate={onUpdateCards} />
        </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
});
