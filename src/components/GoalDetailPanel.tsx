import React, { useState, useEffect } from 'react';
import { 
  CheckSquare, Square, Clock, Calendar, AlertCircle, Play,
  Trash2, ArrowLeft, ShieldAlert, Zap, Compass, RefreshCw,
  PlusCircle, CheckCircle2, AlertOctagon, Sparkles, Sliders, Flame, Shield, Scissors, X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Goal, Task, GoalMetrics, AIOutput, PlannerResult, SchedulerResult, RecoveryPlanResult } from '../types.js';
import MarkdownView from './MarkdownView.tsx';
import InteractiveThinkingLoader from './InteractiveThinkingLoader.tsx';
import ErrorStateBlock from './ErrorStateBlock.tsx';

interface GoalDetailPanelProps {
  goalId: string;
  onBack: () => void;
  onGoalMutated: (deletedGoalId?: string) => void;
}

export default function GoalDetailPanel({ goalId, onBack, onGoalMutated }: GoalDetailPanelProps) {
  const [data, setData] = useState<{
    goal: Goal;
    metrics: GoalMetrics;
    tasks: Task[];
    aiOutputs: {
      planner: PlannerResult | null;
      scheduler: SchedulerResult | null;
      recoveryPlan: RecoveryPlanResult | null;
    }
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Sub-forms state
  const [newTaskName, setNewTaskName] = useState('');
  const [newTaskHours, setNewTaskHours] = useState('2');
  const [newTaskMilestone, setNewTaskMilestone] = useState('');
  const [showAddTask, setShowAddTask] = useState(false);

  // Deletion confirmations
  const [confirmDeleteGoal, setConfirmDeleteGoal] = useState(false);
  const [confirmDeleteTaskId, setConfirmDeleteTaskId] = useState<string | null>(null);

  // AI Operation States
  const [agentLoading, setAgentLoading] = useState<'risk' | 'schedule' | 'recovery' | null>(null);
  const [riskExplanation, setRiskExplanation] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'tasks' | 'risk' | 'schedule' | 'recovery'>('tasks');

  // Interactive recovery strategy selection
  const [selectedRecoveryStrategy, setSelectedRecoveryStrategy] = useState<'balanced' | 'aggressive' | 'scope'>('balanced');

  // Selected weekly day for details modal
  const [selectedWeeklyDay, setSelectedWeeklyDay] = useState<{ day: string; tasks: string[] } | null>(null);

  // Listen for escape key press to close daily schedule details modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedWeeklyDay(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const fetchDetails = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/goals/${goalId}`);
      if (!res.ok) throw new Error('Failed to retrieve goal data');
      const json = await res.json();
      setData(json);
      
      // Auto-set milestone input default
      if (json.tasks && json.tasks.length > 0) {
        setNewTaskMilestone(json.tasks[0].milestone);
      } else {
        setNewTaskMilestone('Phase 1: Foundation');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetails();
  }, [goalId]);

  // Handle task check/uncheck toggle
  const toggleTask = async (taskId: string, completed: boolean) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: !completed })
      });
      if (res.ok) {
        const updatedTasks = data!.tasks.map(t => t.id === taskId ? { ...t, completed: !completed } : t);
        
        // Recalculate metrics locally on frontend for instant feedback
        const total = updatedTasks.reduce((sum, t) => sum + t.estimatedHours, 0);
        const done = updatedTasks.filter(t => t.completed).reduce((sum, t) => sum + t.estimatedHours, 0);
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
        
        setData({
          ...data!,
          tasks: updatedTasks,
          metrics: {
            ...data!.metrics,
            completedHours: done,
            progressPercentage: pct,
          }
        });
        
        onGoalMutated();
        // Slower background detail refresh to capture server metrics
        setTimeout(fetchDetails, 1000);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateAllocation = async (newVal: number) => {
    try {
      const res = await fetch(`/api/goals/${goalId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dailyGoalAllocation: newVal })
      });
      if (res.ok) {
        setData(prev => {
          if (!prev) return null;
          return {
            ...prev,
            goal: {
              ...prev.goal,
              dailyGoalAllocation: newVal,
              availableHoursPerDay: newVal
            }
          };
        });
        onGoalMutated();
        // Slower background detail refresh to capture server metrics
        setTimeout(fetchDetails, 1000);
      }
    } catch (err: any) {
      console.error('Failed to update daily goal allocation:', err);
    }
  };

  // Handle task creation
  const handleAddTaskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskName || !newTaskHours) return;

    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goalId,
          name: newTaskName,
          estimatedHours: Number(newTaskHours),
          milestone: newTaskMilestone || 'Phase Extension',
          dueDate: data!.goal.deadline
        })
      });
      if (res.ok) {
        setNewTaskName('');
        setShowAddTask(false);
        fetchDetails();
        onGoalMutated();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Handle task deletion
  const handleDeleteTask = async (taskId: string) => {
    if (confirmDeleteTaskId !== taskId) {
      setConfirmDeleteTaskId(taskId);
      setTimeout(() => {
        setConfirmDeleteTaskId(null);
      }, 5000);
      return;
    }

    try {
      const res = await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
      if (res.ok) {
        setConfirmDeleteTaskId(null);
        fetchDetails();
        onGoalMutated();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Handle goal deletion
  const handleDeleteGoal = async () => {
    if (!confirmDeleteGoal) {
      setConfirmDeleteGoal(true);
      setTimeout(() => {
        setConfirmDeleteGoal(false);
      }, 5000);
      return;
    }

    try {
      const res = await fetch(`/api/goals/${goalId}`, { method: 'DELETE' });
      if (res.ok) {
        onGoalMutated(goalId);
        onBack();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Run Why Am I At Risk Agent (Risk Explainer)
  const runRiskAgent = async (force = false) => {
    setAgentLoading('risk');
    setError(null);
    try {
      const res = await fetch(`/api/goals/${goalId}/risk-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || json.error || 'Failed to analyze risk');
      setRiskExplanation(json.explanation);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAgentLoading(null);
    }
  };

  // Run Scheduler Agent
  const runSchedulerAgent = async () => {
    setAgentLoading('schedule');
    setError(null);
    try {
      const res = await fetch(`/api/goals/${goalId}/scheduler`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || json.error || 'Scheduler derailed');
      fetchDetails(); // Reload to read the saved output
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAgentLoading(null);
    }
  };

  // Run Recovery Planner Agent
  const runRecoveryAgent = async () => {
    setAgentLoading('recovery');
    setError(null);
    try {
      const res = await fetch(`/api/goals/${goalId}/recovery-plan`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || json.error || 'Recovery plan failed');
      fetchDetails(); // Reload to read the saved output
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAgentLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="bg-white border border-slate-100 rounded-3xl p-16 shadow-xs flex flex-col items-center justify-center">
        <InteractiveThinkingLoader label="Retrieving commitment roadmaps..." />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="max-w-xl mx-auto space-y-6">
        <ErrorStateBlock error={error} onRetry={fetchDetails} />
        <div className="text-center">
          <button 
            onClick={onBack} 
            className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold uppercase tracking-widest transition cursor-pointer"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { goal, metrics, tasks, aiOutputs } = data;

  // Colors based on risk level
  const statusColor = metrics.riskLevel === 'green' 
    ? 'text-emerald-600 bg-emerald-50 border-emerald-100' 
    : metrics.riskLevel === 'yellow'
    ? 'text-amber-600 bg-amber-50 border-amber-100'
    : 'text-rose-600 bg-rose-50 border-rose-100';

  const riskBarColor = metrics.riskLevel === 'green' 
    ? 'bg-emerald-500' 
    : metrics.riskLevel === 'yellow'
    ? 'bg-amber-500'
    : 'bg-rose-500';

  // Group tasks by milestone
  const milestonesMap: Record<string, Task[]> = {};
  tasks.forEach(t => {
    if (!milestonesMap[t.milestone]) {
      milestonesMap[t.milestone] = [];
    }
    milestonesMap[t.milestone].push(t);
  });

  return (
    <div className="space-y-6">
      {/* Back button and decommissioning */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 self-start text-xs font-bold uppercase tracking-widest text-slate-400 hover:text-slate-600 transition cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 text-indigo-500" />
          Back to Dashboard
        </button>

        <button
          onClick={handleDeleteGoal}
          className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-xl self-start transition border cursor-pointer ${
            confirmDeleteGoal 
              ? 'bg-rose-600 text-white border-rose-400 animate-pulse' 
              : 'bg-white hover:bg-rose-50 text-rose-500 border-rose-200'
          }`}
        >
          <Trash2 className="w-3.5 h-3.5" />
          {confirmDeleteGoal ? 'Confirm Delete?' : 'Decommission Goal'}
        </button>
      </div>

      {/* Goal Header details */}
      <div className="bg-white border border-slate-100 rounded-3xl p-6 md:p-8 shadow-[0_4px_25px_rgba(0,0,0,0.02)]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-[9px] font-extrabold px-2.5 py-0.5 rounded-full border ${statusColor}`}>
                {metrics.riskLevel.toUpperCase()} RISK STATE
              </span>
              <span className="text-[9px] font-extrabold bg-slate-50 text-slate-500 border border-slate-200 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                Priority: {goal.priority}
              </span>
            </div>
            <h2 className="text-xl md:text-2xl font-extrabold text-slate-800 tracking-tight font-sans">{goal.name}</h2>
            <p className="text-xs text-slate-500 leading-relaxed max-w-2xl">{goal.description || 'No detailed objectives specified.'}</p>
          </div>

          {/* Probability card */}
          <div className="bg-gradient-to-br from-indigo-50/40 to-purple-50/45 border border-slate-100 rounded-2xl px-5 py-4 shrink-0 flex items-center gap-4 shadow-xs">
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest font-extrabold">Pacing Stability</p>
              <h4 className="text-3xl font-black text-slate-800 mt-1 tracking-tight font-sans">{metrics.successProbability}%</h4>
            </div>
            <div className="w-12 h-12 rounded-full border border-slate-200/60 flex items-center justify-center relative overflow-hidden bg-white shrink-0 shadow-xs">
              <div 
                className="absolute bottom-0 left-0 w-full bg-indigo-50/80 transition-all duration-500" 
                style={{ height: `${metrics.successProbability}%` }}
              ></div>
              <Zap className={`w-5 h-5 relative z-10 ${metrics.riskLevel === 'green' ? 'text-emerald-500' : metrics.riskLevel === 'yellow' ? 'text-amber-500' : 'text-rose-500'}`} />
            </div>
          </div>
        </div>

        {/* Daily Goal Allocation editable controller */}
        <div className="bg-indigo-50/20 border border-indigo-100/40 rounded-2xl p-5 mt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-[10px] font-extrabold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full uppercase tracking-wider">
              Daily Goal Allocation
            </span>
            <p className="text-xs text-slate-550 font-medium leading-relaxed">
              This is the amount of time you plan to dedicate to this goal each day. Range: 0.5 – 12 hours/day.
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center bg-white border border-slate-200 rounded-xl px-2 py-1.5 shadow-xs">
              <button
                type="button"
                onClick={() => handleUpdateAllocation(Math.max(0.5, (goal.dailyGoalAllocation ?? 2) - 0.5))}
                className="w-8 h-8 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-600 font-black text-sm flex items-center justify-center transition cursor-pointer select-none"
              >
                -
              </button>
              
              <input
                type="number"
                min="0.5"
                max="12"
                step="0.5"
                value={goal.dailyGoalAllocation ?? 2}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (!isNaN(val)) {
                    handleUpdateAllocation(Math.min(12, Math.max(0.5, val)));
                  }
                }}
                className="w-16 text-center font-bold font-mono text-slate-800 text-sm focus:outline-hidden"
              />

              <button
                type="button"
                onClick={() => handleUpdateAllocation(Math.min(12, (goal.dailyGoalAllocation ?? 2) + 0.5))}
                className="w-8 h-8 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-600 font-black text-sm flex items-center justify-center transition cursor-pointer select-none"
              >
                +
              </button>
            </div>

            <div className="text-right">
              <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">Allocation</span>
              <span className="font-extrabold text-indigo-600 text-sm font-mono">
                {(goal.dailyGoalAllocation ?? 2).toFixed(1)} hrs/day
              </span>
            </div>
          </div>
        </div>

        {/* Local math summary block */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-slate-100 text-xs text-slate-550">
          <div>
            <span className="text-slate-400 uppercase text-[9px] block mb-1 font-bold tracking-wider">Timeline Window</span>
            <span className="text-slate-800 font-bold flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-slate-450" />
              {metrics.daysRemaining > 0 ? `${metrics.daysRemaining} days remaining` : metrics.daysRemaining === 0 ? 'Due Today' : 'Overdue'}
            </span>
          </div>
          <div>
            <span className="text-slate-400 uppercase text-[9px] block mb-1 font-bold tracking-wider">Required Velocity</span>
            <span className="text-slate-800 font-bold flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-indigo-500" />
              {metrics.requiredDailyHours}h / day
            </span>
          </div>
          <div>
            <span className="text-slate-400 uppercase text-[9px] block mb-1 font-bold tracking-wider">Allocated Capacity</span>
            <span className="text-slate-800 font-bold flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-emerald-500" />
              {(goal.dailyGoalAllocation ?? 2)}h / day limit
            </span>
          </div>
          <div>
            <span className="text-slate-400 uppercase text-[9px] block mb-1 font-bold tracking-wider">Capacity Stress</span>
            <span className={`font-bold flex items-center gap-1.5 ${metrics.requiredDailyHours > (goal.dailyGoalAllocation ?? 2) ? 'text-rose-500' : 'text-emerald-500'}`}>
              <Zap className="w-4 h-4 shrink-0" />
              {(metrics.requiredDailyHours / (goal.dailyGoalAllocation ?? 2)).toFixed(1)}x Load factor
            </span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-6">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2 font-bold tracking-wider uppercase">
            <span>Pacing completeness: {metrics.progressPercentage}%</span>
            <span>{metrics.completedHours}/{metrics.totalHours} Estimated hours</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
            <div 
              className={`h-2.5 rounded-full transition-all duration-500 ${riskBarColor}`}
              style={{ width: `${metrics.progressPercentage}%` }}
            ></div>
          </div>
        </div>
        {metrics.progressPercentage === 100 && (
          <div className="mt-5 p-5 bg-emerald-50/20 border border-emerald-100 rounded-2xl flex items-center gap-4 text-left shadow-2xs">
            <span className="text-3xl shrink-0">🏆</span>
            <div>
              <h4 className="text-sm font-extrabold text-emerald-800 font-display">Goal Completed!</h4>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed font-sans">
                You turned a plan into reality. Consistency wins.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Navigation tabs for Agents */}
      <div className="flex border-b border-slate-200 gap-2 overflow-x-auto scrollbar-none">
        <button
          onClick={() => setActiveTab('tasks')}
          className={`px-5 py-3 text-xs font-bold uppercase tracking-widest border-b-2 whitespace-nowrap transition cursor-pointer ${
            activeTab === 'tasks' 
              ? 'border-indigo-600 text-indigo-600' 
              : 'border-transparent text-slate-400 hover:text-slate-650'
          }`}
        >
          Roadmap Checklist ({tasks.length})
        </button>

        <button
          onClick={() => {
            setActiveTab('risk');
            if (!riskExplanation) runRiskAgent();
          }}
          className={`px-5 py-3 text-xs font-bold uppercase tracking-widest border-b-2 whitespace-nowrap flex items-center gap-1.5 transition cursor-pointer ${
            activeTab === 'risk' 
              ? 'border-indigo-600 text-indigo-600' 
              : 'border-transparent text-slate-400 hover:text-slate-650'
          }`}
        >
          Diagnostics Insights
        </button>

        <button
          onClick={() => {
            setActiveTab('schedule');
          }}
          className={`px-5 py-3 text-xs font-bold uppercase tracking-widest border-b-2 whitespace-nowrap flex items-center gap-1.5 transition cursor-pointer ${
            activeTab === 'schedule' 
              ? 'border-indigo-600 text-indigo-600' 
              : 'border-transparent text-slate-400 hover:text-slate-650'
          }`}
        >
          AI Daily Scheduler
        </button>

        <button
          onClick={() => {
            setActiveTab('recovery');
          }}
          className={`px-5 py-3 text-xs font-bold uppercase tracking-widest border-b-2 whitespace-nowrap flex items-center gap-1.5 transition cursor-pointer ${
            activeTab === 'recovery' 
              ? 'border-indigo-600 text-indigo-600' 
              : 'border-transparent text-slate-400 hover:text-slate-650'
          }`}
        >
          Recovery Center
        </button>
      </div>

      {/* Main Tab Panels */}
      <div className="space-y-4">
        {/* TAB 1: ROADMAP & TASKS (Interactive Checklist) */}
        {activeTab === 'tasks' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Sub-Tasks Breakdown</h3>
              <button
                onClick={() => setShowAddTask(!showAddTask)}
                className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-700 transition cursor-pointer"
              >
                <PlusCircle className="w-4 h-4" /> Add Task Box
              </button>
            </div>

            {/* Quick add manual task form */}
            {showAddTask && (
              <form onSubmit={handleAddTaskSubmit} className="bg-white border border-slate-100 rounded-2xl p-5 grid grid-cols-1 sm:grid-cols-3 gap-4 shadow-sm">
                <div className="sm:col-span-1">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Task Title</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Set up auth schemas"
                    value={newTaskName}
                    onChange={(e) => setNewTaskName(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 transition-all duration-200"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Estimated Hours</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={newTaskHours}
                    onChange={(e) => setNewTaskHours(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 transition-all duration-200 font-sans"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Milestone Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Milestone 1: Setup"
                    value={newTaskMilestone}
                    onChange={(e) => setNewTaskMilestone(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 transition-all duration-200"
                  />
                </div>
                <div className="sm:col-span-3 flex justify-end gap-3 mt-1">
                  <button
                    type="button"
                    onClick={() => setShowAddTask(false)}
                    className="px-3.5 py-2 bg-transparent text-[10px] text-slate-400 hover:text-slate-600 font-bold uppercase tracking-wider transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-[10px] text-white font-bold tracking-widest uppercase rounded-xl transition cursor-pointer shadow-xs"
                  >
                    Add Task Block
                  </button>
                </div>
              </form>
            )}

            {/* Render Task checklists grouped by Milestones */}
            {tasks.length === 0 ? (
              <div className="bg-white border border-slate-100 rounded-3xl p-12 text-center text-slate-400 text-xs">
                No tasks logged on this roadmap yet. Add a task above to start tracking.
              </div>
            ) : (
              <div className="space-y-5">
                {Object.keys(milestonesMap).map((milestoneName) => (
                  <div key={milestoneName} className="bg-white/90 border border-slate-100/80 rounded-2xl p-5 shadow-xs">
                    <h4 className="text-xs font-bold text-indigo-600 uppercase tracking-widest border-b border-slate-50 pb-3 mb-4">
                      {milestoneName}
                    </h4>
                    <div className="space-y-3">
                      {milestonesMap[milestoneName].map((task) => (
                        <div 
                          key={task.id}
                          className={`flex items-center justify-between gap-4 p-4 rounded-xl border transition ${
                            task.completed 
                              ? 'bg-slate-50/50 border-slate-100 text-slate-400' 
                              : 'bg-white border-slate-100 text-slate-700 hover:border-slate-200'
                          }`}
                        >
                          <div className="flex items-start gap-3 min-w-0">
                            <button
                              onClick={() => toggleTask(task.id, task.completed)}
                              className="mt-0.5 shrink-0 focus:outline-none transition cursor-pointer"
                            >
                              {task.completed ? (
                                <CheckSquare className="w-5 h-5 text-emerald-500" />
                              ) : (
                                <Square className="w-5 h-5 text-slate-300 hover:text-slate-400" />
                              )}
                            </button>
                            <div className="min-w-0">
                              <p className={`text-xs md:text-sm font-semibold leading-normal ${task.completed ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                                {task.name}
                              </p>
                              {task.description && (
                                <p className="text-[10px] text-slate-400 mt-0.5">{task.description}</p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-4 shrink-0 text-xs text-slate-400">
                            <span className="flex items-center gap-1 bg-slate-50 border border-slate-100 px-2.5 py-1 rounded-lg font-bold">
                              <Clock className="w-3.5 h-3.5 text-slate-400" /> {task.estimatedHours}h
                            </span>
                            <button
                              onClick={() => handleDeleteTask(task.id)}
                              className={`p-1.5 rounded-lg transition border cursor-pointer ${
                                confirmDeleteTaskId === task.id
                                  ? 'text-rose-500 bg-rose-50 border-rose-200 animate-pulse'
                                  : 'text-slate-300 hover:text-rose-500 hover:bg-slate-50 border-transparent'
                              }`}
                              title={confirmDeleteTaskId === task.id ? "Click again to confirm task deletion" : "Delete task"}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: INSIGHTS (RISK ANALYZER) */}
        {activeTab === 'risk' && (
          <div className="space-y-4">
            {metrics.riskLevel === 'green' && (
              <div className="p-5 bg-emerald-50/20 border border-emerald-100 rounded-2xl flex items-start gap-3.5 text-left shadow-2xs">
                <span className="text-2xl shrink-0 mt-0.5">🌿</span>
                <div>
                  <h4 className="text-xs font-black text-emerald-800 uppercase tracking-wider font-display">Nice recovery!</h4>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed font-sans">
                    Your recent progress has significantly improved your chances of success.
                  </p>
                </div>
              </div>
            )}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Commitment Diagnostics Insights</h3>
                <p className="text-[10px] text-slate-400 font-bold tracking-wider">GEMINI RISK INTERPRETATION</p>
              </div>
              <button
                onClick={() => runRiskAgent(true)}
                disabled={agentLoading === 'risk'}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 disabled:opacity-40 transition cursor-pointer shadow-xs"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${agentLoading === 'risk' ? 'animate-spin text-indigo-500' : 'text-slate-400'}`} />
                Re-analyze Risk
              </button>
            </div>

            {agentLoading === 'risk' ? (
              <InteractiveThinkingLoader label="Running Risk Matrix Analyzer..." />
            ) : riskExplanation ? (
              <div className="bg-white border border-slate-100 rounded-3xl p-6 md:p-8 shadow-sm">
                <MarkdownView content={riskExplanation} />
              </div>
            ) : (
              <div className="bg-white border border-slate-100 rounded-3xl p-10 text-center space-y-4 shadow-sm">
                <AlertCircle className="w-8 h-8 text-amber-500 mx-auto" />
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-widest">Awaiting Risk Diagnostics</h4>
                <p className="text-xs text-slate-450 max-w-sm mx-auto leading-relaxed">
                  Analyze your task breakdown, deadlines, and daily capacity allocation to spot real bottleneck risks.
                </p>
                <button
                  onClick={() => runRiskAgent(true)}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold uppercase tracking-widest transition cursor-pointer shadow-xs"
                >
                  Initiate Diagnostics
                </button>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: SCHEDULER AGENT */}
        {activeTab === 'schedule' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">AI Generated Schedule</h3>
                <p className="text-[10px] text-slate-400 font-bold tracking-wider">GEMINI SCHEDULER ALIGNMENT</p>
              </div>
              <button
                onClick={runSchedulerAgent}
                disabled={agentLoading === 'schedule'}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 disabled:opacity-40 transition cursor-pointer shadow-xs"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${agentLoading === 'schedule' ? 'animate-spin text-indigo-500' : 'text-slate-400'}`} />
                {aiOutputs.scheduler ? 'Re-schedule Blocks' : 'Generate Schedule'}
              </button>
            </div>

            {agentLoading === 'schedule' ? (
              <InteractiveThinkingLoader label="Distributing blocks based on daily capacity limits..." />
            ) : aiOutputs.scheduler ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
                {/* Daily blocks */}
                <div className="lg:col-span-1 bg-white border border-slate-100 rounded-2xl p-5 shadow-xs">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></span>
                    Today's Schedule Slots
                  </h4>
                  {aiOutputs.scheduler.daily.length === 0 ? (
                    <p className="text-xs text-slate-400 py-6 italic text-center">No focus blocks assigned for today.</p>
                  ) : (
                    <div className="space-y-3">
                      {aiOutputs.scheduler.daily.map((slot, idx) => (
                        <div key={idx} className="bg-slate-50 border border-slate-100/50 p-3 rounded-xl flex items-center justify-between text-xs">
                          <div>
                            <span className="text-indigo-600 font-bold font-sans">{slot.time}</span>
                            <p className="text-slate-700 font-bold mt-0.5 truncate max-w-[150px]">{slot.taskName}</p>
                          </div>
                          <span className="bg-white border border-slate-200 text-slate-500 px-2.5 py-1 rounded-lg text-[10px] font-bold">
                            {slot.durationHours}h
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Weekly Strategy blocks */}
                <div className="lg:col-span-2 space-y-4">
                  <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs">
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-indigo-500" />
                      Weekly Allocation Map
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                      {aiOutputs.scheduler.weekly.map((day, idx) => {
                        const hasTasks = day.tasks.length > 0;
                        return (
                          <div 
                            key={idx} 
                            onClick={() => setSelectedWeeklyDay(day)}
                            className="bg-slate-50/50 hover:bg-white hover:shadow-md hover:border-indigo-300 border border-slate-100 p-3.5 rounded-xl transition-all duration-250 cursor-pointer group relative overflow-hidden"
                            title="Click to view full daily schedule details"
                          >
                            {/* Accent indicator line on hover */}
                            <div className="absolute top-0 left-0 right-0 h-1 bg-indigo-500 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-250 origin-left" />
                            
                            <div className="flex items-center justify-between border-b border-slate-100 pb-1.5 mb-2">
                              <span className="font-bold text-slate-700">{day.day}</span>
                              <span className="text-[10px] text-indigo-500 font-bold opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                                View Details →
                              </span>
                            </div>
                            {!hasTasks ? (
                              <span className="text-[11px] text-slate-400 block italic py-1">Buffer / Re-sync Day</span>
                            ) : (
                              <ul className="list-disc pl-3.5 text-[11px] text-slate-500 space-y-1">
                                {day.tasks.map((t, tIdx) => (
                                  <li key={tIdx} className="truncate group-hover:text-slate-700 transition-colors">{t}</li>
                                ))}
                              </ul>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Notes */}
                  {aiOutputs.scheduler.schedulerNotes && (
                    <div className="bg-indigo-50/30 border border-indigo-100/60 rounded-2xl p-5 flex gap-3 items-start text-xs leading-relaxed">
                      <Compass className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
                      <div>
                        <span className="text-indigo-600 font-bold uppercase tracking-wider text-[10px] block mb-1">Coach Scheduling Remarks</span>
                        <p className="text-slate-650">{aiOutputs.scheduler.schedulerNotes}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-white border border-slate-100 rounded-3xl p-10 text-center space-y-4 shadow-sm">
                <Calendar className="w-8 h-8 text-indigo-500 mx-auto" />
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-widest">No Time Blocks Allocated</h4>
                <p className="text-xs text-slate-450 max-w-sm mx-auto leading-relaxed">
                  Trigger the AI scheduler to automatically distribute tasks into logical daily focus blocks and weekly check-in slots.
                </p>
                <button
                  onClick={runSchedulerAgent}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold uppercase tracking-widest transition cursor-pointer shadow-xs"
                >
                  Generate Focus Schedule
                </button>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: RECOVERY PLAN */}
        {activeTab === 'recovery' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Roadmap Recovery Control</h3>
                <p className="text-[10px] text-slate-400 font-bold tracking-wider">AI CAPACITATIVE TRIM STRATEGIES</p>
              </div>
              <button
                onClick={runRecoveryAgent}
                disabled={agentLoading === 'recovery'}
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-xs font-bold uppercase tracking-widest text-white rounded-xl disabled:opacity-40 transition cursor-pointer shadow-xs"
              >
                <Zap className="w-3.5 h-3.5" />
                {aiOutputs.recoveryPlan ? 'Re-calculate Recovery Plan' : 'Trigger Recovery Agent'}
              </button>
            </div>

            {agentLoading === 'recovery' ? (
              <InteractiveThinkingLoader label="Calculating scope trim adjustments and milestone corrections..." />
            ) : aiOutputs.recoveryPlan ? (
              <div className="space-y-6">
                
                {/* ADVANCED THREE STRATEGY CARDS SECTION */}
                <div className="space-y-3">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-450 block px-1">Choose Recovery Vector</span>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    
                    {/* Strategy 1: Balanced Plan */}
                    <div 
                      onClick={() => setSelectedRecoveryStrategy('balanced')}
                      className={`border rounded-3xl p-6 shadow-xs cursor-pointer transition-all duration-300 relative overflow-hidden flex flex-col justify-between h-72 ${
                        selectedRecoveryStrategy === 'balanced'
                          ? 'bg-indigo-50/50 border-indigo-300 ring-2 ring-indigo-500/15 scale-[1.01]'
                          : 'bg-white border-slate-100 hover:border-slate-200'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-4">
                          <span className="bg-indigo-50 text-indigo-700 font-extrabold text-[9px] px-2.5 py-0.5 rounded-full uppercase tracking-widest font-display">
                            Balanced Plan
                          </span>
                          <Shield className={`w-4 h-4 ${selectedRecoveryStrategy === 'balanced' ? 'text-indigo-600' : 'text-slate-300'}`} />
                        </div>
                        
                        <div className="space-y-1">
                          <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">Success %</span>
                          <span className="text-2xl font-extrabold text-emerald-600 font-display">88%</span>
                        </div>
                        
                        <div className="space-y-1 mt-3">
                          <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">Hours / Day</span>
                          <span className="text-lg font-extrabold text-slate-850 font-mono">{(metrics.requiredDailyHours * 0.9).toFixed(1)}h</span>
                        </div>
                      </div>
                      
                      <div className="border-t border-slate-100 mt-4 pt-4">
                        <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Trade-offs</span>
                        <p className="text-[11px] text-slate-500 leading-relaxed mt-1 line-clamp-2">
                          Extends timeline boundaries by 15-20% to prevent overloads and preserve quality.
                        </p>
                      </div>
                    </div>

                    {/* Strategy 2: Aggressive Plan */}
                    <div 
                      onClick={() => setSelectedRecoveryStrategy('aggressive')}
                      className={`border rounded-3xl p-6 shadow-xs cursor-pointer transition-all duration-300 relative overflow-hidden flex flex-col justify-between h-72 ${
                        selectedRecoveryStrategy === 'aggressive'
                          ? 'bg-amber-50/50 border-amber-300 ring-2 ring-amber-500/15 scale-[1.01]'
                          : 'bg-white border-slate-100 hover:border-slate-200'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-4">
                          <span className="bg-amber-50 text-amber-700 font-extrabold text-[9px] px-2.5 py-0.5 rounded-full uppercase tracking-widest font-display">
                            Aggressive Plan
                          </span>
                          <Flame className={`w-4 h-4 ${selectedRecoveryStrategy === 'aggressive' ? 'text-amber-600' : 'text-slate-300'}`} />
                        </div>
                        
                        <div className="space-y-1">
                          <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">Success %</span>
                          <span className="text-2xl font-extrabold text-amber-600 font-display">75%</span>
                        </div>
                        
                        <div className="space-y-1 mt-3">
                          <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">Hours / Day</span>
                          <span className="text-lg font-extrabold text-slate-850 font-mono">{(metrics.requiredDailyHours * 1.2).toFixed(1)}h</span>
                        </div>
                      </div>
                      
                      <div className="border-t border-slate-100 mt-4 pt-4">
                        <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Trade-offs</span>
                        <p className="text-[11px] text-slate-500 leading-relaxed mt-1 line-clamp-2">
                          Maintains deadline but requires larger, highly focused distraction-free focus slots.
                        </p>
                      </div>
                    </div>

                    {/* Strategy 3: Scope Cut Plan */}
                    <div 
                      onClick={() => setSelectedRecoveryStrategy('scope')}
                      className={`border rounded-3xl p-6 shadow-xs cursor-pointer transition-all duration-300 relative overflow-hidden flex flex-col justify-between h-72 ${
                        selectedRecoveryStrategy === 'scope'
                          ? 'bg-rose-50/50 border-rose-300 ring-2 ring-rose-500/15 scale-[1.01]'
                          : 'bg-white border-slate-100 hover:border-slate-200'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-4">
                          <span className="bg-rose-50 text-rose-700 font-extrabold text-[9px] px-2.5 py-0.5 rounded-full uppercase tracking-widest font-display">
                            Scope Reduction
                          </span>
                          <Scissors className={`w-4 h-4 ${selectedRecoveryStrategy === 'scope' ? 'text-rose-600' : 'text-slate-300'}`} />
                        </div>
                        
                        <div className="space-y-1">
                          <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">Success %</span>
                          <span className="text-2xl font-extrabold text-emerald-600 font-display">96%</span>
                        </div>
                        
                        <div className="space-y-1 mt-3">
                          <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">Hours / Day</span>
                          <span className="text-lg font-extrabold text-slate-850 font-mono">{(metrics.requiredDailyHours * 0.65).toFixed(1)}h</span>
                        </div>
                      </div>
                      
                      <div className="border-t border-slate-100 mt-4 pt-4">
                        <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Trade-offs</span>
                        <p className="text-[11px] text-slate-500 leading-relaxed mt-1 line-clamp-2">
                          Trims non-essential details to protect the core beta milestones and reduce stress ratios.
                        </p>
                      </div>
                    </div>

                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-3">
                  {/* Left Column: Diagnostics */}
                  <div className="space-y-4">
                    {/* Reasons */}
                    <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs">
                      <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <AlertOctagon className="w-4 h-4 text-rose-500 shrink-0" />
                        Delay Diagnostics
                      </h4>
                      <div className="space-y-2 text-xs">
                        {aiOutputs.recoveryPlan.reasons.map((reason, idx) => (
                          <div key={idx} className="p-3 bg-slate-50 border border-slate-100 rounded-xl text-slate-650 leading-relaxed">
                            {reason}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Adjustments */}
                    <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs flex gap-3 items-start text-xs leading-relaxed">
                      <Compass className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
                      <div>
                        <span className="text-indigo-600 font-bold uppercase tracking-widest text-[9px] block mb-1">Recommended Adjustments</span>
                        <p className="text-slate-650 font-sans">
                          {selectedRecoveryStrategy === 'balanced' 
                            ? `[Balanced Pacing]: We recommend adopting a pace of ${(metrics.requiredDailyHours * 0.9).toFixed(1)}h per day. ${aiOutputs.recoveryPlan.timelineAdjustments}`
                            : selectedRecoveryStrategy === 'aggressive'
                            ? `[Aggressive Sprint]: Work at high intensity to match a velocity of ${(metrics.requiredDailyHours * 1.2).toFixed(1)}h per day to force completion before deadlines.`
                            : `[Essential Focus Cuts]: Reduce scope, pruning secondary details. Pacing target down to ${(metrics.requiredDailyHours * 0.65).toFixed(1)}h per day.`
                          }
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Steps & Advice */}
                  <div className="space-y-4">
                    {/* Action Steps Checklist */}
                    <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs">
                      <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                        <Zap className="w-4 h-4 text-indigo-500" />
                        Priority Recovery Steps
                      </h4>
                      <div className="space-y-3 text-xs">
                        {aiOutputs.recoveryPlan.actionSteps.map((step, idx) => (
                          <div key={idx} className="flex gap-3 items-start p-3 bg-slate-50 border border-slate-100 rounded-xl">
                            <span className="bg-indigo-100 text-indigo-600 font-bold font-sans text-xs w-5 h-5 rounded-full flex items-center justify-center shrink-0">
                              {idx + 1}
                            </span>
                            <p className="text-slate-750 leading-relaxed font-medium">{step}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Encouragement message */}
                    <div className="bg-emerald-50/40 border border-emerald-100/50 rounded-2xl p-5 font-sans text-xs italic text-slate-600 leading-relaxed relative overflow-hidden">
                      <span className="absolute -right-3 -bottom-3 text-emerald-500/10 text-7xl font-serif select-none pointer-events-none">“</span>
                      <p className="font-extrabold text-emerald-700 uppercase tracking-widest text-[9px] mb-2 not-italic">Coach's Advice</p>
                      {aiOutputs.recoveryPlan.coachingEncouragement}
                    </div>
                  </div>
                </div>

              </div>
            ) : metrics.riskLevel === 'green' ? (
              <div className="bg-emerald-50/20 border border-emerald-100/50 rounded-3xl p-12 text-center space-y-4 shadow-xs">
                <div className="text-3xl">🚀</div>
                <h4 className="text-sm font-extrabold text-slate-800 font-display">You're currently on track</h4>
                <p className="text-xs text-slate-550 max-w-sm mx-auto leading-relaxed">
                  No recovery plan is needed today. Keep maintaining your steady velocity to stay ahead of the schedule curve!
                </p>
                <div className="pt-2">
                  <button
                    onClick={runRecoveryAgent}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-650 rounded-xl text-[10px] font-bold uppercase tracking-wider transition cursor-pointer shadow-2xs border border-slate-200"
                  >
                    Run AI Diagnostics Anyway
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-white border border-slate-100 rounded-3xl p-10 text-center space-y-4 shadow-sm">
                <Zap className="w-8 h-8 text-indigo-500 mx-auto animate-pulse" />
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-widest">Emergency Recovery Plan</h4>
                <p className="text-xs text-slate-450 max-w-sm mx-auto leading-relaxed">
                  If required daily velocity is creeping past your allocated capacity limits, trigger the recovery plan assistant to assemble a structured action plan.
                </p>
                <button
                  onClick={runRecoveryAgent}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold uppercase tracking-widest transition cursor-pointer shadow-xs"
                >
                  Generate Recovery Plan
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modern Day Details Modal for Weekly Allocation Map */}
      <AnimatePresence>
        {selectedWeeklyDay && (() => {
          const dayName = selectedWeeklyDay.day;
          
          // Calculate total allocated hours and gather full details
          let totalHours = 0;
          const tasksWithDetails = selectedWeeklyDay.tasks.map((taskName) => {
            const matchedTask = data?.tasks?.find(t => 
              t.name.toLowerCase().trim() === taskName.toLowerCase().trim() ||
              t.name.toLowerCase().includes(taskName.toLowerCase().trim()) ||
              taskName.toLowerCase().includes(t.name.toLowerCase().trim())
            );
            const hours = matchedTask?.estimatedHours ?? 1.5;
            totalHours += hours;
            return {
              name: taskName,
              hours,
              milestone: matchedTask?.milestone || 'Flexible Target',
              completed: matchedTask?.completed || false,
              description: matchedTask?.description || 'Daily tactical scheduled assignment.'
            };
          });

          // Calculate chronological focus blocks starting at 09:00 AM
          let currentHour = 9.0;
          const timeFormattedTasks = tasksWithDetails.map((task) => {
            const duration = task.hours;
            const startDecimal = currentHour;
            const endDecimal = startDecimal + duration;
            
            // update currentHour with a 30-min break
            currentHour = endDecimal + 0.5;

            const formatHour = (dec: number) => {
              const h = Math.floor(dec);
              const m = Math.round((dec - h) * 60);
              const ampm = h >= 12 ? 'PM' : 'AM';
              const displayHour = h % 12 === 0 ? 12 : h % 12;
              const displayMin = m < 10 ? `0${m}` : m;
              return `${displayHour}:${displayMin} ${ampm}`;
            };

            return {
              ...task,
              timeString: `${formatHour(startDecimal)} - ${formatHour(endDecimal)}`
            };
          });

          const hasTasks = selectedWeeklyDay.tasks.length > 0;
          const dailyCapacity = data?.goal?.availableHoursPerDay || 2;
          const isOverCapacity = totalHours > dailyCapacity;

          return (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedWeeklyDay(null)}
              className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50"
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0, y: 15 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 15 }}
                transition={{ type: "spring", duration: 0.4 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-lg w-full overflow-hidden flex flex-col max-h-[85vh] relative"
              >
                {/* Modal Header */}
                <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50 to-indigo-50/10">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-indigo-50 border border-indigo-100/50 rounded-xl text-indigo-500">
                      <Calendar className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-slate-800 font-display tracking-wide uppercase">
                        {dayName} Schedule
                      </h3>
                      <p className="text-[10px] text-slate-400 font-bold tracking-wider uppercase font-sans">
                        Personalized Allocation Plan
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedWeeklyDay(null)}
                    className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-650 transition cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Scrollable Modal Content */}
                <div className="px-6 py-6 overflow-y-auto space-y-6 flex-1 max-h-[60vh] scrollbar-thin">
                  
                  {/* Capacity Indicator Banner */}
                  <div className="bg-slate-50 border border-slate-100/80 rounded-2xl p-4 flex items-center justify-between text-xs">
                    <div>
                      <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px] block mb-0.5">Total Focus Block</span>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-lg font-black text-slate-800">{totalHours.toFixed(1)} hrs</span>
                        <span className="text-slate-400 text-[10px]">allocated</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px] block mb-0.5">Daily Budget Limit</span>
                      <div className="flex items-center gap-1.5 justify-end">
                        <span className={`font-bold ${isOverCapacity ? 'text-rose-500' : 'text-emerald-500'}`}>
                          {dailyCapacity} hrs max
                        </span>
                        {isOverCapacity && (
                          <span className="bg-rose-50 border border-rose-100 text-rose-600 px-2 py-0.5 rounded text-[9px] font-bold">
                            Overloaded
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Timeline of Tasks */}
                  <div className="space-y-4">
                    <span className="text-slate-400 font-extrabold uppercase tracking-widest text-[9px] block">
                      Focus Task Sequence
                    </span>

                    {!hasTasks ? (
                      <div className="text-center py-8 bg-slate-50/50 border border-dashed border-slate-200 rounded-2xl space-y-2">
                        <span className="text-xl">🌿</span>
                        <h4 className="text-xs font-bold text-slate-700">Buffer / Re-sync Day</h4>
                        <p className="text-[11px] text-slate-450 max-w-xs mx-auto">
                          No rigorous milestones scheduled. Perfect for catching up on backlog items, reviewing strategy, or tactical recovery.
                        </p>
                      </div>
                    ) : (
                      <div className="relative border-l border-slate-100 pl-4.5 ml-2 space-y-5">
                        {timeFormattedTasks.map((task, idx) => (
                          <div key={idx} className="relative group/task">
                            {/* Connector dot */}
                            <div className={`absolute -left-[24px] top-1.5 w-2.5 h-2.5 rounded-full border-2 ${
                              task.completed 
                                ? 'bg-emerald-500 border-white ring-4 ring-emerald-100' 
                                : 'bg-white border-indigo-400 ring-4 ring-indigo-50'
                            }`} />
                            
                            <div className="space-y-1">
                              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                                <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest bg-indigo-50 border border-indigo-100/50 px-2 py-0.5 rounded-md self-start">
                                  ⏱️ {task.timeString} ({task.hours.toFixed(1)}h)
                                </span>
                                <span className="text-[10px] font-bold text-slate-400 italic">
                                  {task.milestone}
                                </span>
                              </div>
                              <h4 className="text-xs font-black text-slate-800 leading-tight">
                                {task.name}
                              </h4>
                              <p className="text-[11px] text-slate-500 leading-relaxed font-sans">
                                {task.description}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* AI scheduling remarks for that day (if available) */}
                  {aiOutputs.scheduler?.schedulerNotes && (
                    <div className="bg-indigo-50/30 border border-indigo-100/50 rounded-2xl p-4 flex gap-3 items-start text-xs leading-relaxed">
                      <Compass className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                      <div>
                        <span className="text-indigo-600 font-extrabold uppercase tracking-widest text-[9px] block mb-1">
                          Scheduling Guidance & Advice
                        </span>
                        <p className="text-slate-650 font-sans leading-relaxed text-[11px]">
                          {aiOutputs.scheduler.schedulerNotes}
                        </p>
                      </div>
                    </div>
                  )}

                </div>

                {/* Modal Footer */}
                <div className="px-6 py-4.5 bg-slate-50 border-t border-slate-100 flex justify-end">
                  <button
                    onClick={() => setSelectedWeeklyDay(null)}
                    className="px-4.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition cursor-pointer shadow-sm hover:shadow"
                  >
                    Acknowledge & Close
                  </button>
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
}
