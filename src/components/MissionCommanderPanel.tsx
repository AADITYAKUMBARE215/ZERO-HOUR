import { useState, useEffect, useRef } from 'react';
import { Sparkles, RefreshCw, AlertCircle, Compass, Play, Clock, ArrowRight, Square, CheckSquare, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Goal, GoalMetrics, Task } from '../types.js';
import MarkdownView from './MarkdownView.tsx';
import InteractiveThinkingLoader from './InteractiveThinkingLoader.tsx';
import ErrorStateBlock from './ErrorStateBlock.tsx';
import TaskCompletionModal from './TaskCompletionModal.tsx';

interface GoalWithMetrics extends Goal {
  metrics: GoalMetrics;
}

interface MissionCommanderPanelProps {
  goals: GoalWithMetrics[];
  goalsCount: number;
  triggerRefreshStats: () => void;
  showToast: (message: string, type?: 'success' | 'info' | 'error') => void;
}

export default function MissionCommanderPanel({ goals, goalsCount, triggerRefreshStats, showToast }: MissionCommanderPanelProps) {
  const [directive, setDirective] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Focus Arena states
  const [showArena, setShowArena] = useState(false);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [lastSelectedMinutes, setLastSelectedMinutes] = useState(25);
  const [arenaTimer, setArenaTimer] = useState(1500); // 25 mins in seconds
  const [arenaIsRunning, setArenaIsRunning] = useState(false);
  const [isCompletionModalOpen, setIsCompletionModalOpen] = useState(false);

  const timerIntervalRef = useRef<any>(null);

  // Find primary goal (highest priority or highest risk)
  const sortedGoals = [...goals].sort((a, b) => b.metrics.riskScore - a.metrics.riskScore);
  const primaryGoal = sortedGoals[0] || null;

  // Retrieve primary pending task for the primary goal
  useEffect(() => {
    if (primaryGoal) {
      fetch(`/api/tasks?goalId=${primaryGoal.id}`)
        .then((res) => {
          if (res.ok) return res.json();
          throw new Error();
        })
        .then((data) => {
          if (Array.isArray(data)) {
            const pending = data.find((t) => !t.completed);
            setActiveTask(pending || data[0] || null);
          }
        })
        .catch(() => {});
    } else {
      setActiveTask(null);
    }
  }, [primaryGoal?.id, showArena]);

  const fetchDirective = async (isRegen = false) => {
    if (goalsCount === 0) {
      setDirective('# YOUR FOCUS PLAN\nAdd your first goal above to generate your customized dynamic daily strategy.');
      return;
    }
    
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/dashboard/mission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: isRegen })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Failed to communicate with AI planner');
      }
      setDirective(data.directive);
    } catch (err: any) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDirective();
  }, [goalsCount]);

  // Handle active focus countdown timer
  useEffect(() => {
    if (arenaIsRunning) {
      timerIntervalRef.current = setInterval(() => {
        setArenaTimer((prev) => {
          if (prev <= 1) {
            setArenaIsRunning(false);
            clearInterval(timerIntervalRef.current);
            showToast('Focus Block Complete! Excellent work.', 'success');
            return lastSelectedMinutes * 60;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      clearInterval(timerIntervalRef.current);
    }

    return () => {
      clearInterval(timerIntervalRef.current);
    };
  }, [arenaIsRunning, lastSelectedMinutes]);

  // Handle active task completion write-back
  const completeFocusTask = () => {
    setIsCompletionModalOpen(true);
  };

  // Human readable timer string formatter
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6">
      {/* TODAY'S FOCUS HERO CARD (LARGEST CORE COMPONENT) */}
      {primaryGoal ? (
        <div className="bg-slate-900 text-white rounded-3xl p-6 md:p-8 shadow-[0_15px_40px_rgba(15,23,42,0.15)] relative overflow-hidden group">
          {/* Subtle background glow blobs */}
          <div className="absolute right-[-20%] top-[-20%] w-[60%] h-[60%] rounded-full bg-indigo-500/15 blur-[120px] pointer-events-none group-hover:bg-indigo-500/20 transition-all duration-700"></div>
          <div className="absolute left-[10%] bottom-[-30%] w-[50%] h-[50%] rounded-full bg-purple-500/10 blur-[100px] pointer-events-none"></div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 items-center relative z-10">
            {/* Title and Objective Description */}
            <div className="md:col-span-2 space-y-4">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-indigo-300">Your Current Focus Target</p>
              </div>

              <div className="space-y-2">
                <h2 className="text-xl md:text-2xl font-extrabold tracking-tight leading-tight">
                  {activeTask ? activeTask.name : `Next Step: ${primaryGoal.name}`}
                </h2>
                <p className="text-xs text-slate-350 line-clamp-2 leading-relaxed">
                  {activeTask 
                    ? `Milestone context: ${activeTask.milestone}. Let's take a moment to complete this high-impact task next.`
                    : primaryGoal.description || 'Focus on your primary active goals to stay on pace today.'
                  }
                </p>
              </div>

              {/* Focus details badges */}
              <div className="flex flex-wrap gap-4 pt-2">
                <div className="flex items-center gap-1.5 text-xs text-slate-300">
                  <Clock className="w-4 h-4 text-indigo-400" />
                  <span>Estimated Time: <strong className="font-semibold text-white">{activeTask ? `${activeTask.estimatedHours}h` : `${primaryGoal.metrics.requiredDailyHours.toFixed(1)}h/day`}</strong></span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-300">
                  <Compass className="w-4 h-4 text-indigo-400" />
                  <span>Priority: <strong className="font-semibold text-white capitalize">{primaryGoal.priority} priority</strong></span>
                </div>
              </div>
            </div>

            {/* Circular Progress Indicator / Action Trigger column */}
            <div className="flex flex-col items-center md:items-end justify-center space-y-4 border-t md:border-t-0 md:border-l border-slate-800 pt-6 md:pt-0 md:pl-8">
              <div className="text-center md:text-right">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Success Probability</span>
                <span className="text-3xl font-black font-mono tracking-tight text-emerald-400 block mt-1">
                  {primaryGoal.metrics.successProbability}%
                </span>
              </div>

              <button
                onClick={() => {
                  setArenaTimer(lastSelectedMinutes * 60);
                  setShowArena(true);
                }}
                className="w-full sm:w-auto px-6 py-3.5 bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white font-extrabold text-xs rounded-2xl flex items-center justify-center gap-2 shadow-[0_4px_25px_rgba(79,70,229,0.25)] hover:shadow-[0_8px_30px_rgba(79,70,229,0.4)] transition-all duration-300 cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
              >
                <Play className="w-4 h-4 fill-white" />
                Start Focus Timer 🚀
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-slate-100 rounded-3xl p-8 text-center space-y-3 shadow-sm">
          <Compass className="w-7 h-7 text-indigo-500 mx-auto animate-pulse" />
          <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Awaiting Active Targets</h4>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Once you register a high-stakes goal, your personalized daily checklist and plan details will appear here automatically.
          </p>
        </div>
      )}

      {/* STRATEGIC ADVISOR BRIEF (COLLAPSIBLE / ACCORDION STYLE) */}
      <div className="bg-white border border-slate-100 rounded-3xl shadow-xs hover:shadow-sm transition-all duration-300">
        <details className="group" open={goalsCount > 0}>
          <summary className="flex items-center justify-between px-6 py-5 cursor-pointer list-none select-none">
            <div className="flex items-center gap-3">
              <div className="bg-indigo-50 text-indigo-600 p-2 rounded-xl">
                <Compass className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider font-display">Daily Guide Brief</h3>
                <p className="text-[10px] text-indigo-500 font-bold tracking-widest uppercase">AI-GENERATED PATHWAYS</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  fetchDirective(true);
                }}
                disabled={loading || goalsCount === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-slate-600 disabled:opacity-45 disabled:pointer-events-none transition cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-indigo-500' : 'text-slate-450'}`} />
                Recalculate Brief
              </button>
              <span className="text-slate-350 transition-transform duration-300 group-open:rotate-180">
                ▼
              </span>
            </div>
          </summary>

          <div className="px-6 pb-6 md:pb-8 border-t border-slate-50/50 pt-5">
            {loading ? (
              <InteractiveThinkingLoader label="Formulating your progress recommendations..." />
            ) : error ? (
              <ErrorStateBlock error={error} onRetry={() => fetchDirective(true)} />
            ) : (
              <div className="space-y-4">
                <div className="bg-slate-50/40 border border-slate-100 rounded-2xl p-5 md:p-6 relative overflow-hidden">
                  <div className="absolute right-4 top-4 opacity-[0.03] text-slate-800 font-black text-6xl select-none font-sans">AI</div>
                  <MarkdownView content={directive} />
                </div>
                {goalsCount > 0 && (
                  <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center justify-end gap-1.5 px-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    Schedules optimized with your daily focus hours
                  </div>
                )}
              </div>
            )}
          </div>
        </details>
      </div>

      {/* FOCUS ARENA SCREEN OVERLAY */}
      {showArena && (
        <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-2xl z-[9999] flex flex-col items-center justify-center text-white p-6 transition-all duration-500">
          <div className="max-w-xl w-full flex flex-col items-center space-y-8 relative">
            
            {/* Close Button */}
            <button 
              onClick={() => {
                setArenaIsRunning(false);
                setShowArena(false);
              }}
              className="absolute right-0 -top-12 p-2 bg-slate-900/60 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 rounded-full text-slate-400 hover:text-white transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Breathing Ambient Aura ring */}
            <div className="relative flex items-center justify-center">
              <div className={`absolute w-72 h-72 rounded-full border border-indigo-500/20 bg-indigo-500/5 transition-all duration-1000 ${
                arenaIsRunning ? 'animate-[ping_4s_cubic-bezier(0,0,0.2,1)_infinite]' : 'scale-90'
              }`}></div>
              <div className={`absolute w-56 h-56 rounded-full border border-purple-500/20 bg-purple-500/5 transition-all duration-1000 ${
                arenaIsRunning ? 'animate-[ping_6s_cubic-bezier(0,0,0.2,1)_infinite] delay-1000' : 'scale-90'
              }`}></div>
              
              {/* Core digital timer display */}
              <div className="relative w-48 h-48 rounded-full bg-slate-900/80 border border-slate-800/80 flex flex-col items-center justify-center shadow-2xl relative z-10">
                <span className="text-[10px] font-bold text-slate-500 tracking-widest uppercase">Focus Block</span>
                <span className="text-4xl font-extrabold font-mono text-white tracking-tight mt-1.5">
                  {formatTime(arenaTimer)}
                </span>
                <span className="text-[10px] text-slate-400 mt-2 font-semibold">
                  {arenaIsRunning ? 'Executing...' : 'Ready'}
                </span>
              </div>
            </div>

            {/* Focus Duration Selector - Only shown when NOT running */}
            <AnimatePresence>
              {!arenaIsRunning && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="w-full max-w-md bg-slate-900/40 border border-slate-800/50 rounded-2xl p-4 text-center space-y-3"
                >
                  <div className="flex items-center justify-between px-1">
                    <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                      Focus Block Duration
                    </span>
                    <span className="text-[10px] font-bold text-indigo-450 uppercase tracking-widest bg-indigo-500/10 px-2 py-0.5 rounded-md">
                      Customize
                    </span>
                  </div>
                  
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {[15, 25, 45, 60, 90].map((preset) => {
                      const isSelected = lastSelectedMinutes === preset;
                      return (
                        <motion.button
                          key={preset}
                          onClick={() => {
                            setLastSelectedMinutes(preset);
                            setArenaTimer(preset * 60);
                          }}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          className={`relative px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer overflow-hidden ${
                            isSelected
                              ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-950/40'
                              : 'bg-transparent text-slate-400 border border-slate-800 hover:text-slate-200 hover:border-slate-700'
                          }`}
                        >
                          {isSelected && (
                            <motion.span
                              layoutId="activePresetGlow"
                              className="absolute inset-0 bg-white/10"
                              transition={{ type: "spring", stiffness: 300, damping: 30 }}
                            />
                          )}
                          <span className="relative z-10">{preset} min</span>
                        </motion.button>
                      );
                    })}
                    
                    {/* Custom minute input */}
                    <div className="flex items-center gap-1 bg-slate-950/50 border border-slate-800 rounded-xl px-2.5 py-1 focus-within:border-indigo-500 transition">
                      <input
                        type="number"
                        min="1"
                        max="480"
                        value={lastSelectedMinutes || ''}
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          if (!isNaN(val)) {
                            const sanitized = Math.min(Math.max(val, 1), 480);
                            setLastSelectedMinutes(sanitized);
                            setArenaTimer(sanitized * 60);
                          } else {
                            setLastSelectedMinutes(0);
                            setArenaTimer(0);
                          }
                        }}
                        onBlur={() => {
                          if (!lastSelectedMinutes || lastSelectedMinutes < 1) {
                            setLastSelectedMinutes(25);
                            setArenaTimer(25 * 60);
                          }
                        }}
                        className="w-12 bg-transparent text-center text-xs font-bold text-white focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider pr-1 select-none">min</span>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Active task overview */}
            <div className="text-center space-y-2">
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-indigo-400">ACTIVE TASK TARGET</p>
              <h3 className="text-lg md:text-xl font-bold max-w-md mx-auto leading-normal">
                {activeTask ? activeTask.name : primaryGoal ? `Execute roadmap of: ${primaryGoal.name}` : 'Commitment Roadmap Block'}
              </h3>
              <p className="text-xs text-slate-400 italic">
                {activeTask ? `Milestone: ${activeTask.milestone}` : 'Focus block pacing active.'}
              </p>
            </div>



            {/* Main execution controls */}
            <div className="flex flex-col sm:flex-row gap-4 w-full">
              <button
                onClick={() => setArenaIsRunning(!arenaIsRunning)}
                className={`flex-1 py-4 rounded-2xl text-xs font-bold uppercase tracking-widest shadow-xl cursor-pointer hover:scale-[1.01] active:scale-[0.99] transition ${
                  arenaIsRunning 
                    ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-900/10' 
                    : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-950/20'
                }`}
              >
                {arenaIsRunning ? 'Pause Session' : 'Begin Session'}
              </button>

              {activeTask && (
                <button
                  onClick={completeFocusTask}
                  className="flex-1 py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl text-xs font-bold uppercase tracking-widest shadow-xl shadow-emerald-950/10 cursor-pointer hover:scale-[1.01] active:scale-[0.99] transition"
                >
                  Mark Task Complete ✅
                </button>
              )}
            </div>
            
          </div>
        </div>
      )}

      {/* Grouped Task Completion Modal with milestone layout */}
      <TaskCompletionModal
        isOpen={isCompletionModalOpen}
        onClose={() => setIsCompletionModalOpen(false)}
        goals={goals}
        triggerRefreshStats={triggerRefreshStats}
        showToast={showToast}
        onCompleted={() => {
          setArenaIsRunning(false);
          setShowArena(false);
        }}
      />
    </div>
  );
}

