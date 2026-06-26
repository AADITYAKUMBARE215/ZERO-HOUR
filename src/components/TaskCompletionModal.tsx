import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, X, Search, Award, Flag, Loader2, AlertCircle, Sparkles } from 'lucide-react';
import { Goal, Task } from '../types.js';

interface GoalWithMetrics extends Goal {
  metrics: {
    daysRemaining: number;
    totalHours: number;
    completedHours: number;
    progressPercentage: number;
    requiredDailyHours: number;
    riskScore: number;
    riskLevel: 'green' | 'yellow' | 'red';
    successProbability: number;
  };
}

interface TaskCompletionModalProps {
  isOpen: boolean;
  onClose: () => void;
  goals: GoalWithMetrics[];
  triggerRefreshStats: () => void;
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
  onCompleted?: () => void;
}

export default function TaskCompletionModal({
  isOpen,
  onClose,
  goals,
  triggerRefreshStats,
  showToast,
  onCompleted
}: TaskCompletionModalProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch incomplete tasks for active goals when modal opens
  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      setSearchQuery('');
      setSelectedTaskIds(new Set());
      
      fetch('/api/tasks')
        .then((res) => {
          if (res.ok) return res.json();
          throw new Error('Failed to load tasks');
        })
        .then((data: Task[]) => {
          const activeGoalIds = new Set(goals.map(g => g.id));
          // Filter incomplete tasks belonging to current active commitments
          const filtered = data.filter(t => !t.completed && activeGoalIds.has(t.goalId));
          setTasks(filtered);
        })
        .catch((err) => {
          console.error(err);
          showToast('Failed to load tasks for selection.', 'error');
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [isOpen, goals]);

  if (!isOpen) return null;

  // Toggle single task selection
  const toggleTask = (taskId: string) => {
    const next = new Set(selectedTaskIds);
    if (next.has(taskId)) {
      next.delete(taskId);
    } else {
      next.add(taskId);
    }
    setSelectedTaskIds(next);
  };

  // Toggle all visible tasks
  const toggleSelectAllVisible = (visibleTasks: Task[]) => {
    const allSelected = visibleTasks.every(t => selectedTaskIds.has(t.id));
    const next = new Set(selectedTaskIds);
    visibleTasks.forEach(t => {
      if (allSelected) {
        next.delete(t.id);
      } else {
        next.add(t.id);
      }
    });
    setSelectedTaskIds(next);
  };

  // Submit complete tasks
  const handleMarkComplete = async () => {
    if (selectedTaskIds.size === 0) {
      showToast('Select at least one task to mark complete.', 'info');
      return;
    }

    setSubmitting(true);
    try {
      const promises = Array.from(selectedTaskIds).map(taskId =>
        fetch(`/api/tasks/${taskId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ completed: true })
        })
      );

      const responses = await Promise.all(promises);
      const failed = responses.filter(r => !r.ok);

      if (failed.length > 0) {
        showToast(`Failed to update ${failed.length} task(s).`, 'error');
      } else {
        showToast(`Success! Marked ${selectedTaskIds.size} task(s) complete.`, 'success');
        if (onCompleted) {
          onCompleted();
        }
        triggerRefreshStats();
        onClose();
      }
    } catch (err) {
      console.error(err);
      showToast('Error saving completed tasks.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Filter tasks based on search
  const filteredTasks = tasks.filter(task => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      task.name.toLowerCase().includes(query) ||
      task.milestone.toLowerCase().includes(query) ||
      (task.description && task.description.toLowerCase().includes(query))
    );
  });

  // Group tasks: goalId -> milestone -> Task[]
  const groupedStructure: { [goalId: string]: { [milestone: string]: Task[] } } = {};
  filteredTasks.forEach(task => {
    if (!groupedStructure[task.goalId]) {
      groupedStructure[task.goalId] = {};
    }
    if (!groupedStructure[task.goalId][task.milestone]) {
      groupedStructure[task.goalId][task.milestone] = [];
    }
    groupedStructure[task.goalId][task.milestone].push(task);
  });

  // Find active goals that actually have pending tasks matching the search
  const goalsWithTasks = goals.filter(g => groupedStructure[g.id] !== undefined);

  return (
    <AnimatePresence>
      <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 cursor-default"
        />

        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 15 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 15 }}
          transition={{ type: 'spring', duration: 0.4 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-2xl w-full overflow-hidden flex flex-col max-h-[85vh] relative z-10"
        >
          {/* Modal Header */}
          <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50 to-indigo-50/10">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-indigo-50 border border-indigo-100/50 rounded-xl text-indigo-500">
                <Award className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-800 font-display tracking-wide uppercase">
                  Verify Focus Progress
                </h3>
                <p className="text-[10px] text-slate-400 font-bold tracking-wider uppercase font-sans">
                  Select the milestones you completed
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-650 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Search bar */}
          <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search active tasks, milestones..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 focus:border-indigo-500 rounded-xl text-xs font-medium placeholder-slate-400 outline-none transition shadow-2xs"
              />
            </div>
            {filteredTasks.length > 0 && (
              <button
                type="button"
                onClick={() => toggleSelectAllVisible(filteredTasks)}
                className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-650 rounded-xl text-[10px] font-black uppercase tracking-wider transition cursor-pointer shrink-0"
              >
                {filteredTasks.every(t => selectedTaskIds.has(t.id)) ? 'Deselect All' : 'Select All'}
              </button>
            )}
          </div>

          {/* Modal Content / Task Grouped Lists */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-16 space-y-3">
                <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider animate-pulse">
                  Querying Commitment Roadmaps...
                </p>
              </div>
            ) : tasks.length === 0 ? (
              <div className="text-center py-12 space-y-4 max-w-sm mx-auto">
                <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center text-xl mx-auto shadow-inner">
                  🎉
                </div>
                <div className="space-y-1">
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest font-display">No Pending Tasks</h4>
                  <p className="text-xs text-slate-400 font-medium leading-relaxed">
                    You have cleared all scheduled tasks! Add more tasks or register a new commitment to keep the pacing momentum going.
                  </p>
                </div>
              </div>
            ) : goalsWithTasks.length === 0 ? (
              <div className="text-center py-12 space-y-4 max-w-sm mx-auto">
                <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center text-amber-600 mx-auto border border-amber-100">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest font-display">No Search Matches</h4>
                  <p className="text-xs text-slate-400 font-medium leading-relaxed">
                    No active tasks match your search query "{searchQuery}". Try refining your keywords.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-8">
                {goalsWithTasks.map((goal) => {
                  const milestones = groupedStructure[goal.id];
                  return (
                    <div key={goal.id} className="space-y-4 border-l-2 border-indigo-100/60 pl-4">
                      {/* Commitment Title block */}
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="space-y-0.5">
                          <h4 className="text-xs font-black text-indigo-950 uppercase tracking-widest font-display">
                            {goal.name}
                          </h4>
                          <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider font-sans">
                            {goal.priority} Priority Commitment
                          </p>
                        </div>
                        {goal.metrics && (
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest">
                              Progress: {Math.round(goal.metrics.progressPercentage)}%
                            </span>
                            <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200/50">
                              <div
                                className="h-full bg-indigo-500"
                                style={{ width: `${goal.metrics.progressPercentage}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Milestones and Tasks */}
                      <div className="space-y-5">
                        {Object.keys(milestones).map((milestoneName) => {
                          const milestoneTasks = milestones[milestoneName];
                          return (
                            <div key={milestoneName} className="space-y-2.5">
                              {/* Milestone Header */}
                              <div className="flex items-center gap-2 bg-slate-50 border border-slate-150/40 rounded-xl px-3 py-1.5 w-fit">
                                <Flag className="w-3 h-3 text-slate-400 shrink-0" />
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
                                  {milestoneName}
                                </span>
                              </div>

                              {/* Task checkbox items */}
                              <div className="grid grid-cols-1 gap-2 pl-1">
                                {milestoneTasks.map((task) => {
                                  const isChecked = selectedTaskIds.has(task.id);
                                  return (
                                    <div
                                      key={task.id}
                                      onClick={() => toggleTask(task.id)}
                                      className={`flex items-center gap-3.5 p-3 rounded-2xl border transition-all duration-200 cursor-pointer select-none group ${
                                        isChecked
                                          ? 'bg-indigo-50/40 border-indigo-150 text-slate-800 hover:bg-indigo-50 shadow-xs'
                                          : 'bg-white border-slate-100 hover:border-slate-200 hover:bg-slate-50/50'
                                      }`}
                                    >
                                      {/* Checkbox circle/square */}
                                      <div
                                        className={`w-5 h-5 rounded-lg border flex items-center justify-center shrink-0 transition-all duration-200 ${
                                          isChecked
                                            ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs'
                                            : 'border-slate-350 bg-white group-hover:border-slate-400'
                                        }`}
                                      >
                                        {isChecked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                                      </div>

                                      {/* Task details */}
                                      <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                        <div className="min-w-0">
                                          <p className="text-xs font-semibold text-slate-800 leading-snug group-hover:text-slate-900 transition truncate">
                                            {task.name}
                                          </p>
                                          {task.description && (
                                            <p className="text-[10px] text-slate-450 font-medium leading-relaxed truncate mt-0.5 max-w-md">
                                              {task.description}
                                            </p>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-1.5 shrink-0 self-start sm:self-center">
                                          <span className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-slate-50 border border-slate-100 rounded-md text-[9px] font-extrabold text-slate-400 font-mono tracking-wider uppercase">
                                            ⏳ {task.estimatedHours} {task.estimatedHours === 1 ? 'hr' : 'hrs'}
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Modal Footer */}
          <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest font-sans">
              {selectedTaskIds.size} {selectedTaskIds.size === 1 ? 'task' : 'tasks'} selected for completion
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 sm:flex-initial px-5 py-3 border border-slate-200 hover:bg-slate-100 text-slate-650 rounded-2xl text-xs font-black uppercase tracking-wider transition cursor-pointer select-none text-center"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting || selectedTaskIds.size === 0}
                onClick={handleMarkComplete}
                className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition cursor-pointer select-none text-center text-white ${
                  selectedTaskIds.size === 0
                    ? 'bg-slate-300 cursor-not-allowed shadow-none'
                    : submitting
                    ? 'bg-indigo-500 cursor-wait shadow-none'
                    : 'bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-500/10 hover:shadow-indigo-500/20 active:scale-98'
                }`}
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Completing...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>Mark Selected Complete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
