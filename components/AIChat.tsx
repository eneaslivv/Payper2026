import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { useAuth } from '../contexts/AuthContext';
import { useAIContext } from '../hooks/useAIContext';

interface Message {
  role: 'user' | 'model';
  text: string;
}

const SHORTCUTS = [
  { label: 'Analizar Ventas Hoy', prompt: 'Analiza el rendimiento de ventas de hoy basándote en lo que sabes del sistema.' },
  { label: 'Estrategia Lealtad', prompt: 'Sugiere una estrategia de lealtad táctica para retener clientes.' },
  { label: 'Estado del Stock', prompt: '¿Cómo puedo verificar mi stock crítico y hacer transferencias?' },
  { label: 'Auditar Configuración', prompt: 'Revisa si mi configuración de Mercado Pago y Roles es correcta según las mejores prácticas.' },
  { label: 'Crear Recompensa', prompt: 'Guíame paso a paso para crear una nueva recompensa de lealtad.' },
];

const SYSTEM_CONTEXT_BASE = `
ROL: Eres SquadAI, el copiloto operativo del local.
REGLAS:
1. SOLO respondes sobre ESTE local. No tienes acceso global.
2. NO inventes funcionalidades. Bésate en: Dashboard, Menú, Inventario, Lealtad, Configuración.
3. Si algo no existe (como historial financiero histórico), dilo.
4. Sé breve, táctico y "militar/futurista" en tu tono.
`;

const AIChat: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: 'model', text: 'SQUADAI COGNITIVE SYSTEM ONLINE. Esperando órdenes tácticas.' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Real-time Context
  const aiContext = useAIContext();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async (textOverride?: string) => {
    const textToSend = textOverride || input;
    if (!textToSend.trim() || isLoading) return;

    const userMsg: Message = { role: 'user', text: textToSend };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';
      if (!apiKey) throw new Error('API Key no configurada');

      const ai = new GoogleGenerativeAI(apiKey);
      const model = ai.getGenerativeModel({ model: 'gemini-2.0-flash' });

      // Construct Real-time Data String
      const contextString = `
      DATOS EN TIEMPO REAL:
      - Ventas Hoy: $${aiContext.dailySales.toLocaleString()}
      - Pedidos Hoy: ${aiContext.ordersCount}
      - Ticket Promedio: $${aiContext.avgTicket.toFixed(2)}
      - Mesas Activas: ${aiContext.activeTables}
      - Stock Bajo: ${aiContext.lowStockItems.length > 0 ? aiContext.lowStockItems.join(', ') : 'Ninguno crítico'}
      `;

      // Inject System Context with Real Data
      const prompt = `${SYSTEM_CONTEXT_BASE}\n${contextString}\n\nUser Query: ${textToSend}`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      setMessages(prev => [...prev, { role: 'model', text: response.text() || 'Sin respuesta táctica.' }]);
    } catch (e: any) {
      console.error(e);
      setMessages(prev => [...prev, { role: 'model', text: '⚠️ ERROR DE ENLACE: Verifique conexión y API Key.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* TRIGGER BUTTON (Always visible when closed) */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-[200] group flex items-center gap-3 animate-in slide-in-from-bottom-10 fade-in duration-700"
        >
          <div className="bg-[#0D0F0D] border border-neon/30 text-neon px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-2xl opacity-0 group-hover:opacity-100 transition-all -translate-x-4 group-hover:translate-x-0">
            Abrir SquadAI
          </div>
          <div className="size-14 rounded-2xl bg-[#0D0F0D] border border-neon/50 shadow-[0_0_30px_rgba(74,222,128,0.2)] flex items-center justify-center text-neon transition-all hover:scale-110 active:scale-95 hover:shadow-[0_0_50px_rgba(74,222,128,0.4)]">
            <span className="material-symbols-outlined text-2xl font-black">smart_toy</span>
            <div className="absolute top-0 right-0 size-2.5 bg-neon rounded-full border-2 border-black animate-pulse"></div>
          </div>
        </button>
      )}

      {/* LATERAL DRAWER & BACKDROP */}
      {isOpen && (
        <>
          {/* BACKDROP - Light blur to focus attention but keep context */}
          <div
            className="fixed inset-0 z-[300] bg-black/40 backdrop-blur-sm animate-in fade-in duration-500"
            onClick={() => setIsOpen(false)}
          />

          {/* DRAWER CONTAINER */}
          <div className="fixed inset-y-0 right-0 w-full md:w-[450px] z-[310] bg-[#0A0A0A]/95 backdrop-blur-xl border-l border-white/5 shadow-2xl flex flex-col animate-in slide-in-from-right duration-500">

            {/* HEADER */}
            <div className="p-6 border-b border-white/5 flex justify-between items-center bg-gradient-to-r from-neon/5 to-transparent">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-xl bg-neon/10 border border-neon/20 flex items-center justify-center text-neon shadow-[0_0_15px_rgba(74,222,128,0.1)]">
                  <span className="material-symbols-outlined text-xl">smart_toy</span>
                </div>
                <div>
                  <h2 className="text-lg font-black italic text-white uppercase tracking-tight leading-none">SquadAI</h2>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="size-1.5 rounded-full bg-neon animate-pulse"></span>
                    <p className="text-[9px] font-black text-neon/80 uppercase tracking-[0.2em]">ONLINE • v2.0</p>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="size-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white transition-all"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            {/* CHAT AREA */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5 scroll-smooth custom-scrollbar" ref={scrollRef}>

              {/* Context Summary Badge (Optional Debug/Trust) */}
              <div className="flex justify-center mb-4">
                <div className="bg-white/5 border border-white/5 rounded-full px-4 py-1.5 flex items-center gap-3">
                  <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">LIVE CONTEXT</span>
                  <span className="text-[9px] font-bold text-white/60 tabular-nums">Sales: ${aiContext.dailySales.toLocaleString()}</span>
                  <span className="text-[9px] font-bold text-white/60 tabular-nums">Tables: {aiContext.activeTables}</span>
                </div>
              </div>

              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2 fade-in duration-300`}>
                  <div className={`max-w-[85%] p-4 rounded-2xl text-[13px] md:text-sm font-medium leading-relaxed shadow-lg ${m.role === 'user'
                      ? 'bg-neon text-black rounded-tr-sm font-bold'
                      : 'bg-zinc-900 border border-white/10 text-zinc-300 rounded-tl-sm'
                    }`}>
                    {/* Render with basic markdown-like support eventually, for now plain text */}
                    {m.text}
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="flex justify-start animate-in fade-in">
                  <div className="bg-zinc-900 border border-white/5 p-4 rounded-2xl rounded-tl-sm flex items-center gap-1.5">
                    <div className="size-1.5 bg-neon rounded-full animate-bounce"></div>
                    <div className="size-1.5 bg-neon rounded-full animate-bounce delay-100"></div>
                    <div className="size-1.5 bg-neon rounded-full animate-bounce delay-200"></div>
                  </div>
                </div>
              )}
            </div>

            {/* SHORTCUTS (Horizontal Scroll if needed, or Grid) */}
            {messages.length < 3 && !isLoading && (
              <div className="px-5 pb-2">
                <p className="text-[9px] font-black text-zinc-600 uppercase tracking-[0.2em] mb-2 pl-1">Protocolos Rápidos</p>
                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
                  {SHORTCUTS.map((sc, i) => (
                    <button
                      key={i}
                      onClick={() => handleSend(sc.prompt)}
                      className="whitespace-nowrap px-4 py-2 bg-white/5 border border-white/5 rounded-xl hover:bg-neon/10 hover:border-neon/30 hover:text-white text-[10px] font-black text-zinc-400 uppercase tracking-wider transition-all"
                    >
                      {sc.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* INPUT AREA */}
            <div className="p-5 bg-[#0D0F0D] border-t border-white/5">
              <div className="relative flex items-center">
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSend()}
                  placeholder="Escriba comando..."
                  className="w-full h-14 pl-5 pr-14 rounded-2xl bg-zinc-900/50 border border-white/10 text-sm font-medium text-white outline-none focus:border-neon/40 focus:bg-zinc-900 transition-all placeholder:text-zinc-600"
                  disabled={isLoading}
                  autoFocus
                />
                <button
                  onClick={() => handleSend()}
                  disabled={!input.trim() || isLoading}
                  className="absolute right-2 size-10 rounded-xl bg-neon text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-neon-soft disabled:opacity-30 disabled:hover:scale-100 disabled:shadow-none"
                >
                  <span className="material-symbols-outlined text-xl">send</span>
                </button>
              </div>
              <div className="flex justify-between items-center mt-3 px-1">
                <p className="text-[8px] font-black text-zinc-700 uppercase tracking-[0.2em]">SquadAI v2.0 • Secure</p>
                <div className={`size-1.5 rounded-full ${isLoading ? 'bg-yellow-500 animate-pulse' : 'bg-green-500'}`} />
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
};

export default AIChat;
