
import React, { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { GoogleGenerativeAI } from '@google/generative-ai';

interface Message {
  role: 'user' | 'model';
  text: string;
}

const AIChat: React.FC = () => {
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: 'model', text: '¡Hola Operador! Soy SquadAI, tu copiloto táctico. ¿En qué puedo ayudarte hoy?' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    const userMsg: Message = { role: 'user', text: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);
    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';
      if (!apiKey) throw new Error('API Key not configured');
      const ai = new GoogleGenerativeAI(apiKey);
      const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const result = await model.generateContent(input);
      const response = await result.response;
      setMessages(prev => [...prev, { role: 'model', text: response.text() || 'Sin señal.' }]);
    } catch (e) { setMessages(prev => [...prev, { role: 'model', text: 'Error de enlace.' }]); } finally { setIsLoading(false); }
  };

  return (
    <div className="fixed bottom-4 right-4 z-[300] flex flex-col items-end gap-3 pointer-events-none">
      {isOpen && (
        <div className="w-[320px] sm:w-[350px] h-[420px] bg-[#0D0F0D] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-5 pointer-events-auto">
          <div className="p-4 border-b border-white/5 flex justify-between items-center bg-neon/10">
            <div className="flex items-center gap-2.5">
              <div className="size-8 rounded-lg bg-neon/10 border border-neon/30 flex items-center justify-center text-neon">
                <span className="material-symbols-outlined text-lg animate-pulse">smart_toy</span>
              </div>
              <div>
                <h4 className="text-[10px] font-black italic-black text-white uppercase tracking-tighter leading-none">SquadAI</h4>
                <p className="text-[7px] font-black text-neon uppercase tracking-widest mt-0.5 leading-none">ACTIVE UNIT</p>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} className="text-white/20 hover:text-white transition-colors"><span className="material-symbols-outlined text-lg">close</span></button>
          </div>
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[90%] p-3 rounded-xl text-[10px] font-medium leading-relaxed ${m.role === 'user' ? 'bg-primary text-white rounded-tr-none' : 'bg-white/5 border border-white/5 text-white/80 rounded-tl-none italic'}`}>
                  {m.text}
                </div>
              </div>
            ))}
            {isLoading && <div className="bg-white/5 p-2 rounded-lg w-10 h-6 flex gap-1 items-center justify-center"><div className="size-1 bg-neon rounded-full animate-bounce"></div><div className="size-1 bg-neon rounded-full animate-bounce delay-100"></div></div>}
          </div>
          <div className="p-3 bg-[#0D0F0D] border-t border-white/5">
            <div className="relative flex items-center gap-2">
              <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSend()} placeholder="Escribe al SquadAI..." className="w-full h-9 pl-3 pr-10 rounded-lg bg-white/5 border border-white/10 text-[9px] font-bold text-white outline-none focus:ring-1 focus:ring-neon/20 transition-all uppercase tracking-widest placeholder:text-white/10" />
              <button onClick={handleSend} disabled={!input.trim() || isLoading} className="absolute right-1 size-7 rounded-md bg-neon text-black flex items-center justify-center hover:scale-105 active:scale-95 disabled:opacity-30"><span className="material-symbols-outlined text-sm font-black">send</span></button>
            </div>
          </div>
        </div>
      )}
      <button onClick={() => setIsOpen(!isOpen)} className="size-12 rounded-xl bg-neon text-black shadow-neon-soft flex items-center justify-center hover:scale-110 active:scale-95 transition-all pointer-events-auto border-[2px] border-[#0D0F0D]">
        <span className="material-symbols-outlined text-xl font-black">{isOpen ? 'chat_bubble' : 'auto_awesome'}</span>
      </button>
    </div>
  );
};

export default AIChat;
