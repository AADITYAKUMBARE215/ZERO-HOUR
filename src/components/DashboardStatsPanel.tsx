import { DashboardStats } from '../types.js';
import { Target, AlertCircle, CheckCircle2, TrendingUp } from 'lucide-react';

interface DashboardStatsPanelProps {
  stats: DashboardStats;
}

export default function DashboardStatsPanel({ stats }: DashboardStatsPanelProps) {
  const completionRate = stats.totalTasksCount > 0 
    ? Math.round((stats.completedTasksCount / stats.totalTasksCount) * 100) 
    : 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
      {/* Active Goals */}
      <div 
        id="stat-active-goals" 
        className="bg-white border border-slate-100 rounded-3xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.015)] hover:shadow-[0_12px_30px_rgba(79,70,229,0.04)] hover:border-indigo-100 transition-all duration-350 hover:-translate-y-0.5 group flex flex-col justify-between"
      >
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-[10px] font-bold text-slate-450 uppercase tracking-widest font-display">Active Goals</p>
            <h3 className="text-4xl font-extrabold text-slate-800 tracking-tight font-display mt-2">
              {stats.activeGoalsCount}
            </h3>
          </div>
          <div className="bg-indigo-50/70 text-indigo-600 p-3 rounded-2xl transition-all duration-300 group-hover:bg-indigo-100/70 group-hover:scale-105">
            <Target className="w-5 h-5" />
          </div>
        </div>
        <div className="text-xs text-slate-500 mt-5 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></span>
          <span>Steady progress active</span>
        </div>
      </div>

      {/* Goals at Risk */}
      <div 
        id="stat-at-risk" 
        className="bg-white border border-slate-100 rounded-3xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.015)] hover:shadow-[0_12px_30px_rgba(244,63,94,0.04)] hover:border-rose-100 transition-all duration-350 hover:-translate-y-0.5 group flex flex-col justify-between"
      >
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-[10px] font-bold text-slate-450 uppercase tracking-widest font-display">Goals At Risk</p>
            <h3 className="text-4xl font-extrabold text-slate-800 tracking-tight font-display mt-2">
              {stats.goalsAtRiskCount}
            </h3>
          </div>
          <div className={`p-3 rounded-2xl transition-all duration-300 group-hover:scale-105 ${
            stats.goalsAtRiskCount > 0 
              ? 'bg-rose-50 text-rose-500 group-hover:bg-rose-100/70' 
              : 'bg-emerald-50 text-emerald-500 group-hover:bg-emerald-100/70'
          }`}>
            <AlertCircle className="w-5 h-5" />
          </div>
        </div>
        <div className="text-xs mt-5 flex items-center gap-2">
          {stats.goalsAtRiskCount > 0 ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
              <span className="text-rose-600 font-semibold">Needs Attention</span>
            </>
          ) : (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              <span className="text-emerald-600 font-semibold">All goals stable</span>
            </>
          )}
        </div>
      </div>

      {/* Success Probability */}
      <div 
        id="stat-avg-progress" 
        className="bg-white border border-slate-100 rounded-3xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.015)] hover:shadow-[0_12px_30px_rgba(16,185,129,0.04)] hover:border-emerald-100 transition-all duration-350 hover:-translate-y-0.5 group flex flex-col justify-between"
      >
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-[10px] font-bold text-slate-450 uppercase tracking-widest font-display">Success Probability</p>
            <h3 className="text-4xl font-extrabold text-slate-800 tracking-tight font-display mt-2">
              {stats.averageProgress}%
            </h3>
          </div>
          <div className="bg-emerald-50 text-emerald-500 p-3 rounded-2xl transition-all duration-300 group-hover:bg-emerald-100/70 group-hover:scale-105">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>
        <div className="mt-5 space-y-2">
          <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
            <div 
              className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${stats.averageProgress}%` }}
            ></div>
          </div>
        </div>
      </div>

      {/* Tasks Completed */}
      <div 
        id="stat-task-ratio" 
        className="bg-white border border-slate-100 rounded-3xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.015)] hover:shadow-[0_12px_30px_rgba(245,158,11,0.04)] hover:border-amber-100 transition-all duration-350 hover:-translate-y-0.5 group flex flex-col justify-between"
      >
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-[10px] font-bold text-slate-450 uppercase tracking-widest font-display">Tasks Completed</p>
            <h3 className="text-4xl font-extrabold text-slate-800 tracking-tight font-display mt-2">
              {stats.completedTasksCount}
              <span className="text-slate-450 text-xl font-medium font-sans">/{stats.totalTasksCount}</span>
            </h3>
          </div>
          <div className="bg-amber-50 text-amber-500 p-3 rounded-2xl transition-all duration-300 group-hover:bg-amber-100/70 group-hover:scale-105">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>
        <div className="text-xs text-slate-500 mt-5 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
            <span>Task completion rate</span>
          </span>
          <span className="text-slate-650 font-bold font-mono">{completionRate}%</span>
        </div>
      </div>
    </div>
  );
}

