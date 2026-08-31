import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, Send, ShieldAlert } from './icons';
import { ChatMessage } from '../types/game';

interface ChatPanelProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  currentSocketId: string;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  messages,
  onSendMessage,
  currentSocketId
}) => {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText.trim());
    setInputText('');
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 notch p-4 shadow-2xl backdrop-blur-md flex flex-col h-full min-h-[550px] lg:min-h-[650px] justify-between">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
        <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2 font-mono">
          <MessageSquare className="w-4 h-4 text-amber-400" /> СВЯЗЬ И ЖУРНАЛ СОБЫТИЙ
        </h3>
        <span className="text-[10px] font-mono px-2 py-0.5 bg-slate-800 text-slate-400 notch-sm border border-slate-700">
          {messages.length} ЗАПИСЕЙ
        </span>
      </div>

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 mb-3 max-h-[500px] lg:max-h-[560px]">

        {messages.length === 0 ? (
          <div className="text-center py-10 text-xs text-slate-600 font-mono">
            Журнал шлюза чист... Начните обсуждение.
          </div>
        ) : (
          messages.map(msg => {
            const isSelf = msg.senderId === currentSocketId;
            if (msg.isSystem) {
              return (
                <div
                  key={msg.id}
                  className="bg-amber-500/10 border border-amber-500/20 text-amber-300 p-2 notch-sm text-xs font-mono flex items-start gap-2"
                >
                  <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold mr-1">[{msg.timestamp}]</span>
                    <span>{msg.text}</span>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={msg.id}
                className={`p-2.5 notch-sm border text-xs leading-snug max-w-[85%] ${
                  isSelf
                    ? 'ml-auto bg-amber-950/30 border-amber-800/50 text-amber-100'
                    : 'mr-auto bg-slate-950 border-slate-800 text-slate-200'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-bold text-amber-400 text-[11px]">{msg.senderName}</span>
                  <span className="text-[9px] font-mono text-slate-500">{msg.timestamp}</span>
                </div>
                <p>{msg.text}</p>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <form onSubmit={handleSend} className="flex items-center gap-2 pt-2 border-t border-slate-800">
        <input
          type="text"
          placeholder="Напишите сообщение в бункер..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          className="flex-1 bg-slate-950 border border-slate-800 notch-sm px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
        />
        <button
          type="submit"
          disabled={!inputText.trim()}
          className={`p-2 notch-sm text-slate-950 font-bold transition-all ${
            inputText.trim()
              ? 'bg-amber-500 hover:bg-amber-400 cursor-pointer'
              : 'bg-slate-800 text-slate-600 cursor-not-allowed'
          }`}
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};
