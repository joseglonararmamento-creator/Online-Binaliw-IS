import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, X, Send, Bot, User, Loader2, GraduationCap } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import ReactMarkdown from 'react-markdown';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function StudyAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Hi! I\'m your BISonline Study Assistant. How can I help you with your lessons today?' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
      
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview', 
        contents: [
          {
            role: 'user',
            parts: [{ text: `You are a helpful study assistant for BISonline. 
            EDUCATIONAL GUARDRAILS:
            - NEVER write full essays for students.
            - NEVER provide direct answers to mathematical equations.
            - INSTEAD: Provide guide questions, step-by-step processes, and conceptual explanations.
            - ACT as a tutor helping the student learn, not a ghostwriter.
            - If a student asks for a direct answer or essay, explain why you can't provide it and offer to help them process it themselves.
            
            Keep responses clear, educational, and encouraging.
            Here is the user query: ${userMessage}` }]
          }
        ]
      });

      const aiResponse = response.text || "I'm sorry, I couldn't process that. Could you try rephrasing your question?";
      setMessages(prev => [...prev, { role: 'assistant', content: aiResponse }]);
    } catch (error) {
      console.error('AI Error:', error);
      setMessages(prev => [...prev, { role: 'assistant', content: "Sorry, I'm having trouble connecting to my brain right now. Please try again later." }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Draggable Floating Toggle Button */}
      {!isOpen && (
        <motion.button
          drag
          dragConstraints={{ left: 20, right: window.innerWidth - 84, top: 20, bottom: window.innerHeight - 84 }}
          dragTransition={{ bounceStiffness: 600, bounceDamping: 20 }}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-[100] w-14 h-14 md:w-16 md:h-16 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-full shadow-2xl flex items-center justify-center text-white cursor-move group"
        >
          <Sparkles className="group-hover:rotate-12 transition-transform" size={24} />
          <div className="hidden md:block absolute -top-12 right-0 bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest py-1.5 px-3 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none shadow-xl">
            Long Press to Drag
          </div>
        </motion.button>
      )}

      {/* Chat Card */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20, x: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20, x: 20 }}
            className="fixed bottom-4 right-4 md:bottom-6 md:right-6 z-[101] w-[calc(100vw-2rem)] md:w-[380px] h-[calc(100vh-8rem)] md:h-[550px] bg-white rounded-3xl shadow-2xl border border-slate-100 flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="p-4 bg-indigo-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                  <GraduationCap size={24} />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-widest leading-none mb-1">Study AI</h3>
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                    <span className="text-[10px] font-bold text-indigo-100 uppercase">Online Assistant</span>
                  </div>
                </div>
              </div>
              <button 
                onClick={() => setIsOpen(false)}
                className="p-2 hover:bg-white/10 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`flex gap-2 max-w-[85%] ${m.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-sm ${m.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-white text-indigo-600 border border-slate-100'}`}>
                      {m.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                    </div>
                    <div className={`p-3 rounded-2xl text-sm leading-relaxed ${
                      m.role === 'user' 
                        ? 'bg-indigo-600 text-white rounded-tr-none' 
                        : 'bg-white text-slate-700 border border-slate-100 shadow-sm rounded-tl-none'
                    }`}>
                      <div className="prose prose-sm prose-slate max-w-none prose-headings:text-inherit prose-p:my-1 prose-ul:my-1">
                        <ReactMarkdown>
                          {m.content}
                        </ReactMarkdown>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="flex gap-2 max-w-[85%] items-center">
                    <div className="w-8 h-8 rounded-lg bg-white text-indigo-600 border border-slate-100 flex items-center justify-center shrink-0 shadow-sm">
                      <Bot size={16} />
                    </div>
                    <div className="bg-white border border-slate-100 p-3 rounded-2xl rounded-tl-none flex items-center gap-2 shadow-sm">
                      <Loader2 className="animate-spin text-indigo-600" size={16} />
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Thinking...</span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <form onSubmit={handleSend} className="p-4 bg-white border-t border-slate-100">
              <div className="relative">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask about your project, homework..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 pl-4 pr-12 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all font-medium"
                />
                <button
                  disabled={!input.trim() || isLoading}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-indigo-600 text-white rounded-xl flex items-center justify-center hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 transition-all shadow-lg shadow-indigo-100"
                >
                  <Send size={16} />
                </button>
              </div>
              <p className="text-[10px] text-center text-slate-400 mt-2 font-bold uppercase tracking-widest">Powered by Gemini AI</p>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
