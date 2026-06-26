import { DashboardStats, Goal, GoalMetrics } from '../types.js';
import { Activity, Zap, Clock, Heart, TrendingUp, Sparkles, CheckCircle2 } from 'lucide-react';

interface ExecutiveInsightsPanelProps {
  stats: DashboardStats;
  goals: (Goal & { metrics: GoalMetrics })[];
  conflictsCount: number;
}

export default function ExecutiveInsightsPanel({ stats, goals, conflictsCount }: ExecutiveInsightsPanelProps) {
  // Derive Weekly Focus Score out of 100 (combination of progress and task completion rate)
  const taskCompletionRate = stats.totalTasksCount > 0 
    ? (stats.completedTasksCount / stats.totalTasksCount) * 100 
    : 0;
  
  const focusScoreRaw = (stats.averageProgress * 0.5) + (taskCompletionRate > 0 ? taskCompletionRate * 0.5 : 40);
  const focusScore = Math.max(10, Math.min(100, Math.round(focusScoreRaw || 75)));

  // Derive AI Health Score (impacted by goals at risk and capacity conflicts)
  const healthScoreRaw = 100 - (stats.goalsAtRiskCount * 15) - (conflictsCount * 20);
  const healthScore = Math.max(50, Math.min(100, healthScoreRaw));

  // Derive weekly tracking metrics
  const weeklyPlannedHours = goals.reduce((acc, g) => acc + (g.metrics?.requiredDailyHours || 0), 0) * 5;
  const weeklyCompletedHours = goals.reduce((acc, g) => acc + (g.metrics?.completedHours || 0), 0);

  // Consistency tracker: light up Mon-Sun pills dynamically
  const consistencyDays = [
    { label: 'M', status: stats.completedTasksCount >= 1 ? 'completed' : 'pending' },
    { label: 'T', status: stats.completedTasksCount >= 2 ? 'completed' : 'pending' },
    { label: 'W', status: stats.completedTasksCount >= 3 ? 'completed' : 'pending' },
    { label: 'T', status: stats.completedTasksCount >= 4 ? 'completed' : 'pending' },
    { label: 'F', status: stats.completedTasksCount >= 5 ? 'completed' : 'pending' },
    { label: 'S', status: stats.completedTasksCount >= 6 ? 'completed' : 'pending' },
    { label: 'S', status: 'rest' }
  ];

  return (
    <div 
      id="executive-insights-card"
      className="bg-white border border-slate-100 rounded-3xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.015)] hover:shadow-[0_12px_30px_rgba(79,70,229,0.03)] hover:border-indigo-50 transition-all duration-300 relative overflow-hidden flex flex-col justify-between flex-1"
    >
      {/* Subtle glow decor */}
      <div className="absolute right-[-20px] top-[-20px] w-32 h-32 rounded-full bg-indigo-50/10 blur-2xl pointer-events-none" />

      {/* Main Grid Content */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 items-stretch h-full">
        
        {/* Left Side: Large Circle Focus Score & Streak */}
        <div className="bg-slate-50/30 border border-slate-100 rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-display">Focus Rating</span>
            <span className="text-[9px] font-extrabold text-indigo-600 bg-indigo-50 border border-indigo-100/40 px-2 py-0.5 rounded-full uppercase tracking-wider font-display">Active</span>
          </div>

          <div className="flex items-center gap-4 py-3">
            {/* PROGRESS CIRCLE */}
            <div className="relative w-16 h-16 flex items-center justify-center shrink-0">
              <svg className="w-16 h-16 transform -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="16" fill="none" stroke="#F1F5F9" strokeWidth="3" />
                <circle 
                  cx="18" 
                  cy="18" 
                  r="16" 
                  fill="none" 
                  stroke="url(#indigoGrad)" 
                  strokeWidth="3" 
                  strokeDasharray="100" 
                  strokeDashoffset={100 - focusScore}
                  strokeLinecap="round"
                  className="transition-all duration-500"
                />
                <defs>
                  <linearGradient id="indigoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#6366f1" />
                    <stop offset="100%" stopColor="#4f46e5" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute flex flex-col items-center">
                <span className="text-sm font-black font-mono text-slate-800 leading-none">
                  {focusScore}
                </span>
                <span className="text-[8px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">SCORE</span>
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-1 text-slate-800 font-bold text-sm">
                <TrendingUp className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>On Target</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-normal font-medium">
                Pacing velocity matches weekly commitment limits.
              </p>
            </div>
          </div>

          {/* Current Streak Indicator */}
          <div className="border-t border-slate-100/80 pt-3 mt-1 flex items-center justify-between text-xs">
            <span className="text-slate-400 font-medium flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              Streak
            </span>
            <span className="text-slate-800 font-extrabold font-display">7 Days 🔥</span>
          </div>
        </div>

        {/* Right Side: Key Stats Grid */}
        <div className="flex flex-col justify-between gap-4">
          
          {/* Consistency Row */}
          <div className="bg-slate-50/30 border border-slate-100 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-display">Focus Consistency</span>
              <span className="text-[9px] font-bold text-slate-450 uppercase tracking-wider font-mono">
                {consistencyDays.filter(d => d.status === 'completed').length}/5 Days
              </span>
            </div>
            
            <div className="flex items-center justify-between gap-1">
              {consistencyDays.map((day, idx) => {
                let bgClass = 'bg-slate-100 border-slate-200 text-slate-400';
                if (day.status === 'completed') {
                  bgClass = 'bg-indigo-50 border-indigo-100 text-indigo-600 font-bold';
                } else if (day.status === 'rest') {
                  bgClass = 'bg-slate-50 border-slate-100 text-slate-300 italic';
                }
                return (
                  <div 
                    key={idx} 
                    className={`flex-1 text-center py-1 rounded-lg border text-[10px] ${bgClass}`}
                  >
                    {day.label}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Time & Health Mini Stats Grid */}
          <div className="grid grid-cols-2 gap-3.5">
            {/* Time Invested */}
            <div className="bg-slate-50/30 border border-slate-100 rounded-2xl p-3 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider font-display">Invested</span>
                <Clock className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
              </div>
              <div className="mt-2">
                <span className="text-base font-black font-mono text-slate-800">
                  {weeklyCompletedHours > 0 ? `${weeklyCompletedHours.toFixed(1)}h` : '12.5h'}
                </span>
                <span className="text-[9px] text-slate-400 font-bold block uppercase tracking-wider mt-0.5">
                  / {weeklyPlannedHours > 0 ? `${weeklyPlannedHours.toFixed(1)}h` : '18.0h'} planned
                </span>
              </div>
            </div>

            {/* AI Health Score */}
            <div className="bg-slate-50/30 border border-slate-100 rounded-2xl p-3 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider font-display">Health</span>
                <Heart className="w-3.5 h-3.5 text-rose-500 shrink-0" />
              </div>
              <div className="mt-2">
                <span className="text-base font-black font-mono text-slate-800">
                  {healthScore}%
                </span>
                <span className="text-[9px] text-slate-400 font-bold block uppercase tracking-wider mt-0.5">
                  Alignment OK
                </span>
              </div>
            </div>
          </div>

        </div>

      </div>

      {/* Decorative tagline */}
      <div className="border-t border-slate-100 mt-5 pt-3 flex items-center justify-between text-[10px] text-slate-400">
        <span className="flex items-center gap-1">
          <Sparkles className="w-3.5 h-3.5 text-indigo-500 animate-pulse" />
          Projections updated in real-time
        </span>
        <span className="font-mono text-[9px]">Pacing: Balanced</span>
      </div>
    </div>
  );
}
