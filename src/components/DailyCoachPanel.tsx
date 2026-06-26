import { useState, useEffect } from 'react';
import { MessageSquareCode, RefreshCw, Award, CheckCircle } from 'lucide-react';
import MarkdownView from './MarkdownView.tsx';
import InteractiveThinkingLoader from './InteractiveThinkingLoader.tsx';
import ErrorStateBlock from './ErrorStateBlock.tsx';

interface DailyCoachPanelProps {
  goalsCount: number;
}

export default function DailyCoachPanel({ goalsCount }: DailyCoachPanelProps) {
  const [coachMessage, setCoachMessage] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  const fetchCoachMessage = async (isRegen = false) => {
    if (goalsCount === 0) {
      setCoachMessage('Welcome to **ZERO HOUR**. I am your AI Coach. Register your first high-stakes goal above to begin. Clarity begins when you commit.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/dashboard/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: isRegen })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Failed to talk with the coach');
      }
      setCoachMessage(data.message);
    } catch (err: any) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCoachMessage(false);
  }, [goalsCount]);

  return (
    <div className="bg-white border border-slate-100 rounded-3xl shadow-[0_4px_20px_rgba(0,0,0,0.015)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.03)] overflow-hidden transition-all duration-300">
      <div className="border-b border-slate-100 px-6 py-5 flex items-center justify-between bg-slate-50/50">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-50 text-indigo-600 p-2.5 rounded-xl">
            <MessageSquareCode className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider font-display">AI Coach</h3>
            <p className="text-[10px] text-indigo-500 font-bold tracking-widest uppercase">DAILY HABITS & MOTIVATION</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Daily Streak Indicator */}
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-amber-500/10 to-rose-500/10 border border-amber-200/40 rounded-xl text-amber-700 font-bold text-xs select-none">
            <span>Streak: 7 days</span>
            <span className="text-sm">🔥</span>
          </div>
          
          <button
            onClick={() => fetchCoachMessage(true)}
            disabled={loading || goalsCount === 0}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-slate-600 disabled:opacity-45 disabled:pointer-events-none transition cursor-pointer shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-indigo-500' : 'text-slate-450'}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="p-6 md:p-8">
        {loading ? (
          <InteractiveThinkingLoader label="AI Coach: consulting performance history" />
        ) : error ? (
          <ErrorStateBlock error={error} onRetry={() => fetchCoachMessage(true)} />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Coach Message Section */}
            <div className="lg:col-span-2 space-y-4">
              <div className={`bg-slate-50/50 border border-slate-100 rounded-2xl p-6 relative overflow-hidden transition-all duration-300 ${
                isExpanded ? '' : 'max-h-[260px]'
              }`}>
                <div className="absolute left-3 top-2 text-7xl font-serif text-slate-150/40 pointer-events-none select-none">“</div>
                <div className="pl-6 pt-2 text-slate-650 leading-relaxed text-xs sm:text-sm">
                  <MarkdownView content={coachMessage} />
                </div>

                {!isExpanded && coachMessage.length > 300 && (
                  <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-slate-50 via-slate-50/95 to-transparent flex items-end justify-center pb-3">
                    <button
                      onClick={() => setIsExpanded(true)}
                      className="px-4 py-1.5 bg-white border border-slate-200 shadow-xs hover:border-indigo-200 hover:text-indigo-600 rounded-xl text-xs font-bold text-slate-650 transition cursor-pointer"
                    >
                      Read Full Coach Insight
                    </button>
                  </div>
                )}
                
                {isExpanded && (
                  <div className="mt-6 flex justify-center border-t border-slate-100 pt-3">
                    <button
                      onClick={() => setIsExpanded(false)}
                      className="px-4 py-1.5 bg-white border border-slate-200 shadow-xs hover:border-slate-300 rounded-xl text-xs font-bold text-slate-600 transition cursor-pointer"
                    >
                      Collapse Insight
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Coach Recommendations Side panel */}
            <div className="border border-slate-100 rounded-2xl p-5 bg-gradient-to-br from-indigo-50/30 to-purple-50/30 space-y-4 self-start">
              <div className="flex items-center gap-2">
                <Award className="w-4 h-4 text-indigo-500" />
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider font-display">Daily Action Plan</h4>
              </div>
              <div className="space-y-3">
                <div className="flex items-start gap-2.5 text-xs text-slate-500 leading-normal">
                  <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <span>Execute on schedule and protect your focus blocks.</span>
                </div>
                <div className="flex items-start gap-2.5 text-xs text-slate-500 leading-normal">
                  <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <span>Isolate your highest-impact goal before starting.</span>
                </div>
                <div className="flex items-start gap-2.5 text-xs text-slate-500 leading-normal">
                  <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <span>Review risk pacing to avoid compounding delays.</span>
                </div>
              </div>
              <div className="border-t border-slate-100 pt-3 text-[10px] text-slate-450 leading-relaxed italic">
                "Consistency beats intensity. Win the next focused hour."
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

