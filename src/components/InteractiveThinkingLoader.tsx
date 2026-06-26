import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, BrainCircuit, Hourglass } from 'lucide-react';

interface InteractiveThinkingLoaderProps {
  label?: string;
  className?: string;
}

const MESSAGES = [
  '🧠 Breaking your goal into actionable milestones...',
  '📅 Building your personalized schedule...',
  '⚠️ Evaluating deadline risks...',
  '🎯 Selecting today\'s highest-impact task...',
  '📈 Calculating success probability...',
  '💬 Preparing your AI coach...',
  '✨ Optimizing your execution plan...',
];

export default function InteractiveThinkingLoader({ label, className = '' }: InteractiveThinkingLoaderProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % MESSAGES.length);
    }, 2800);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className={`flex flex-col items-center justify-center py-12 px-6 text-center ${className}`}>
      {/* Premium Visual Indicator */}
      <div className="relative mb-6">
        {/* Outer pulsating ring */}
        <motion.div
          animate={{ scale: [1, 1.25, 1], opacity: [0.15, 0.4, 0.15] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -inset-4 rounded-full bg-indigo-500/10 blur-xl"
        />
        {/* Medium spin border ring */}
        <div className="absolute inset-0 rounded-full border border-indigo-500/20 border-t-indigo-500 animate-spin" />
        
        {/* Core Icon Wrapper */}
        <div className="relative bg-indigo-50 text-indigo-600 p-4.5 rounded-full shadow-inner flex items-center justify-center">
          <BrainCircuit className="w-6 h-6 animate-pulse text-indigo-600" />
        </div>
      </div>

      {/* Rotating status lines */}
      <div className="h-6 flex items-center justify-center overflow-hidden w-full max-w-sm">
        <AnimatePresence mode="wait">
          <motion.p
            key={index}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.35, ease: 'easeInOut' }}
            className="text-xs font-bold text-slate-700 font-display flex items-center gap-1.5 justify-center tracking-wide"
          >
            {MESSAGES[index]}
          </motion.p>
        </AnimatePresence>
      </div>

      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-3.5 flex items-center gap-1">
        <Hourglass className="w-3 h-3 animate-spin text-slate-400" />
        {label || 'Zero Hour cognitive core active'}
      </p>
    </div>
  );
}
