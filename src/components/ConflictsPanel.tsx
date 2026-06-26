import { GoalConflict, Goal } from '../types.js';
import { ShieldAlert, Info, HelpCircle, Clock, Zap } from 'lucide-react';

interface ConflictsPanelProps {
  conflicts: GoalConflict[];
  workspaceCapacity: number;
  goals: Goal[];
}

export default function ConflictsPanel({ conflicts, workspaceCapacity = 8.0, goals = [] }: ConflictsPanelProps) {
  // Filter active goals (incomplete) to find current active allocations
  const activeGoals = goals.filter(g => g.metrics ? g.metrics.progressPercentage < 100 : true);
  const totalAllocated = activeGoals.reduce((sum, g) => sum + (g.dailyGoalAllocation ?? g.availableHoursPerDay ?? 2), 0);
  const isOverAllocated = totalAllocated > workspaceCapacity;
  const difference = Math.abs(totalAllocated - workspaceCapacity);
  const allocationRatio = workspaceCapacity > 0 ? Math.min(100, (totalAllocated / workspaceCapacity) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* 1. CAPACITY BALANCE WIDGET (Always visible, clean, highly professional) */}
      <div 
        id="capacity-balance-widget"
        className="bg-white border border-slate-100 rounded-3xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.015)] space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h4 className="text-xs font-black text-slate-450 uppercase tracking-widest font-display flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-indigo-500" /> Daily Capacity Balance
            </h4>
            <p className="text-xs text-slate-500 font-medium">
              Real-time synchronization between active goal allocations and available focus limits
            </p>
          </div>

          <div className="flex items-center gap-2">
            {isOverAllocated ? (
              <span className="text-[10px] font-extrabold bg-rose-50 border border-rose-100/60 px-3 py-1.5 rounded-xl text-rose-600 uppercase tracking-wider flex items-center gap-1">
                <Zap className="w-3 h-3 text-rose-500 animate-pulse" /> Over-allocated by {difference.toFixed(1)}h/day
              </span>
            ) : totalAllocated === workspaceCapacity ? (
              <span className="text-[10px] font-extrabold bg-indigo-50 border border-indigo-100/60 px-3 py-1.5 rounded-xl text-indigo-600 uppercase tracking-wider">
                100% Utilized
              </span>
            ) : (
              <span className="text-[10px] font-extrabold bg-emerald-50 border border-emerald-100/60 px-3 py-1.5 rounded-xl text-emerald-600 uppercase tracking-wider">
                {difference.toFixed(1)}h/day Unallocated
              </span>
            )}
          </div>
        </div>

        {/* Capacity metric grids */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-slate-50/50 border border-slate-100/70 rounded-2xl p-4 flex flex-col justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Available Daily Capacity</span>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-2xl font-black font-mono text-slate-800">{workspaceCapacity.toFixed(1)}h</span>
              <span className="text-slate-400 text-xs font-normal">/ day</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-2 font-medium">Configured in Workspace Settings</p>
          </div>

          <div className={`border rounded-2xl p-4 flex flex-col justify-between ${isOverAllocated ? 'bg-rose-50/20 border-rose-100' : 'bg-slate-50/50 border-slate-100/70'}`}>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Allocated Daily Capacity</span>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className={`text-2xl font-black font-mono ${isOverAllocated ? 'text-rose-600' : 'text-slate-800'}`}>{totalAllocated.toFixed(1)}h</span>
              <span className="text-slate-400 text-xs font-normal">/ day</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-2 font-medium">Sum of all active goal allocations</p>
          </div>
        </div>

        {/* Visual Progress/Gauge track */}
        <div className="space-y-1.5 pt-2">
          <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold uppercase tracking-wider">
            <span>Allocation usage ratio</span>
            <span>{Math.round((totalAllocated / workspaceCapacity) * 100)}%</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
            <div 
              className={`h-2.5 rounded-full transition-all duration-500 ${isOverAllocated ? 'bg-rose-500 animate-pulse' : 'bg-indigo-600'}`}
              style={{ width: `${allocationRatio}%` }}
            ></div>
          </div>
        </div>
      </div>

      {/* 2. SYSTEM CONFLICTS OR ALL CLEAR CARD */}
      {conflicts.length === 0 ? (
        <div 
          id="conflicts-empty-state"
          className="bg-white border border-slate-100 rounded-3xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.015)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.03)] transition-all duration-300 flex flex-col md:flex-row md:items-center justify-between gap-6 overflow-hidden relative group"
        >
          <div className="absolute right-[-40px] top-[-40px] w-40 h-40 rounded-full bg-emerald-100/10 blur-3xl group-hover:bg-emerald-100/20 transition-all duration-500"></div>
          <div className="flex items-start gap-4">
            <div className="bg-emerald-50 text-emerald-600 p-3 rounded-2xl shrink-0">
              <span className="text-xl">✅</span>
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-800 tracking-tight font-display">You're managing your workload well</h4>
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed max-w-xl">
                Keep this balance to stay productive. All of your active goals fit comfortably within your daily focus hours. Your current pacing is optimized and healthy.
              </p>
            </div>
          </div>
          <div className="shrink-0 flex items-center gap-2 self-start md:self-auto bg-emerald-50 border border-emerald-100 rounded-xl px-3.5 py-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 font-display">Workload OK</span>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {conflicts.map((conflict, idx) => (
            <div 
              key={conflict.id || idx} 
              className={`bg-white border rounded-3xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.015)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.03)] transition-all duration-350 relative overflow-hidden flex flex-col justify-between group ${
                conflict.severity === 'high' 
                  ? 'border-rose-100 hover:border-rose-200' 
                  : 'border-amber-100 hover:border-amber-200'
              }`}
            >
              {/* Background glowing gradients */}
              <div className={`absolute -right-16 -top-16 w-32 h-32 rounded-full blur-3xl transition-all duration-500 pointer-events-none ${
                conflict.severity === 'high' ? 'bg-rose-500/5 group-hover:bg-rose-500/10' : 'bg-amber-500/5 group-hover:bg-amber-500/10'
              }`}></div>

              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className={`w-4 h-4 ${conflict.severity === 'high' ? 'text-rose-500' : 'text-amber-500'}`} />
                    <span className={`text-[10px] font-extrabold uppercase tracking-widest font-display ${
                      conflict.severity === 'high' ? 'text-rose-600' : 'text-amber-600'
                    }`}>
                      Needs Attention
                    </span>
                  </div>
                  <div className={`text-[9px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                    conflict.severity === 'high' 
                      ? 'bg-rose-50 text-rose-700 border border-rose-100/50' 
                      : 'bg-amber-50 text-amber-700 border border-amber-100/50'
                  }`}>
                    Overcommitted
                  </div>
                </div>

                <h4 className="text-base font-bold text-slate-800 tracking-tight font-display">
                  {conflict.id === 'conflict-allocation-overflow' 
                    ? 'Daily Allocation Limit Exceeded' 
                    : conflict.id === 'conflict-capacity' 
                    ? 'Workload Limit Reached' 
                    : 'Goal Schedule Conflict'}
                </h4>

                <p className="text-xs text-slate-500 mt-2.5 leading-relaxed">
                  {conflict.conflictDescription}
                </p>

                {/* Graphical representation of the conflict */}
                <div className="grid grid-cols-5 gap-3 items-center mt-5">
                  <div className="col-span-3 bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs flex flex-col justify-between h-full space-y-2">
                    <div>
                      <span className="text-slate-400 font-semibold block uppercase tracking-wider text-[9px]">
                        {conflict.id === 'conflict-allocation-overflow' ? 'Allocated Hours' : 'Required Daily Hours'}
                      </span>
                      <span className="text-rose-500 font-extrabold font-mono text-base mt-1 block">
                        {conflict.totalRequiredDailyHours.toFixed(1)}h<span className="text-slate-400 text-xs font-normal"> / day</span>
                      </span>
                    </div>
                    <div className="border-t border-slate-100 pt-1.5">
                      <span className="text-slate-400 font-semibold block uppercase tracking-wider text-[9px]">
                        {conflict.id === 'conflict-allocation-overflow' ? 'Available Capacity' : 'Your Pacing Limit'}
                      </span>
                      <span className="text-emerald-650 font-extrabold font-mono text-xs mt-0.5 block">
                        {conflict.availableDailyHours}h<span className="text-slate-400 font-normal"> / day max</span>
                      </span>
                    </div>
                  </div>

                  {/* Animated orbital visualizer */}
                  <div className="col-span-2 flex items-center justify-center p-1.5 h-full relative">
                    <svg className="w-16 h-16 animate-[spin_12s_linear_infinite]" viewBox="0 0 100 100">
                      {/* Orbit Ring */}
                      <circle cx="50" cy="50" r="38" fill="none" stroke={conflict.severity === 'high' ? '#FECDD3' : '#FDE68A'} strokeWidth="1.5" strokeDasharray="5 5" />
                      {/* Inner Orbit */}
                      <circle cx="50" cy="50" r="24" fill="none" stroke="#E2E8F0" strokeWidth="1" />
                      {/* Center nucleus */}
                      <circle cx="50" cy="50" r="10" fill={conflict.severity === 'high' ? '#EF4444' : '#F59E0B'} className="animate-pulse" />
                      {/* Satellites */}
                      <circle cx="12" cy="50" r="4.5" fill="#4F46E5" />
                      <circle cx="80" cy="30" r="3.5" fill="#7C3AED" />
                      <circle cx="50" cy="88" r="4" fill="#10B981" />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold font-mono text-slate-400">
                      ⚠️
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-5 flex gap-2 items-start text-xs border-t border-slate-100 pt-4 bg-slate-50/30 -mx-6 -mb-6 p-5 rounded-b-[24px]">
                <HelpCircle className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                <p className="text-slate-500 leading-relaxed">
                  <span className="text-indigo-600 font-bold">Suggested Pacing Adjustment:</span> {conflict.remedyRecommendation}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
