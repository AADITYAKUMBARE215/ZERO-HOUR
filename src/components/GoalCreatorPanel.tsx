import React, { useState } from 'react';
import { Sparkles, Loader2, Calendar, Clock, BarChart2, ShieldAlert } from 'lucide-react';

interface GoalCreatorPanelProps {
  onGoalCreated: () => void;
}

const LOADING_STEPS = [
  'Initializing Goal Planner...',
  'Analyzing available daily capacity limits...',
  'Structuring milestones and target phases...',
  'Formulating sequential, action-oriented sub-tasks...',
  'Finalizing personalized strategic advisor briefs...',
];

export default function GoalCreatorPanel({ onGoalCreated }: GoalCreatorPanelProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [availableHours, setAvailableHours] = useState('2');
  
  const [loading, setLoading] = useState(false);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);

  // Set default deadline to 7 days from now
  React.useEffect(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    setDeadline(d.toISOString().split('T')[0]);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !deadline || !availableHours) return;

    setLoading(true);
    setWarningMessage(null);
    setCurrentStepIdx(0);

    // Dynamic loading text cycle
    const interval = setInterval(() => {
      setCurrentStepIdx((prev) => (prev < LOADING_STEPS.length - 1 ? prev + 1 : prev));
    }, 1800);

    try {
      const res = await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          deadline,
          priority,
          availableHoursPerDay: Number(availableHours),
          dailyGoalAllocation: Number(availableHours),
        }),
      });

      const data = await res.json();
      clearInterval(interval);

      if (!res.ok) {
        throw new Error(data.message || data.error || 'Failed to initialize goal');
      }

      if (data.aiError) {
        // Goal was created, but AI task breakdown failed (e.g., API key missing)
        setWarningMessage(
          'Goal created successfully, but the Planner was unable to break down tasks automatically. Please set up your GEMINI_API_KEY in the Secrets panel, or add sub-tasks manually below.'
        );
        // We will call the refresh callback so they can see the goal listed
        onGoalCreated();
        setName('');
        setDescription('');
      } else {
        // Successful creation with tasks
        onGoalCreated();
        setName('');
        setDescription('');
        // Reset available hours
        setAvailableHours('2');
        setLoading(false);
      }
    } catch (err: any) {
      clearInterval(interval);
      console.error(err);
      setWarningMessage(err.message || 'Server error occurred while preparing the planner.');
      setLoading(false);
    }
  };

  return (
    <div className="bg-white/90 border border-slate-100 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow duration-300">
      <div className="flex items-center gap-2 mb-6">
        <Sparkles className="w-5 h-5 text-indigo-600" />
        <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest">Add New Commitment</h3>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 space-y-4">
          <Loader2 className="w-9 h-9 text-indigo-600 animate-spin" />
          <div className="text-center space-y-2">
            <h4 className="text-sm font-bold text-slate-800 tracking-wide uppercase font-sans animate-pulse">
              {LOADING_STEPS[currentStepIdx]}
            </h4>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Please wait. Gemini is building your custom step-by-step goal roadmap.
            </p>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          {warningMessage && (
            <div className="bg-amber-50/50 border border-amber-100 rounded-xl p-5 flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold text-amber-800">Goal Creation Notice</h4>
                <p className="text-xs text-slate-650 mt-1 leading-relaxed">{warningMessage}</p>
                <button
                  type="button"
                  onClick={() => {
                    setWarningMessage(null);
                    setLoading(false);
                  }}
                  className="text-xs font-semibold text-amber-600 hover:text-amber-700 mt-3 block underline"
                >
                  Acknowledge and Continue
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Goal Name */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Goal Name</label>
              <input
                type="text"
                required
                placeholder="e.g. Launch Beta Platform"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-white border border-slate-200/85 rounded-xl px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all duration-200"
              />
            </div>

            {/* Target Deadline */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" /> Target Completion Date
              </label>
              <input
                type="date"
                required
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="w-full bg-white border border-slate-200/85 rounded-xl px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all duration-200 font-sans"
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Objectives & Stakes</label>
            <textarea
              placeholder="Describe the core outcomes, stakes, and deliverables of this goal..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full bg-white border border-slate-200/85 rounded-xl px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all duration-200 resize-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Daily Hour Allocation */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-slate-400" /> Daily Capacity Allocation (Hours)
              </label>
              <input
                type="number"
                min="1"
                max="24"
                required
                value={availableHours}
                onChange={(e) => setAvailableHours(e.target.value)}
                className="w-full bg-white border border-slate-200/85 rounded-xl px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all duration-200 font-sans"
              />
            </div>

            {/* Priority */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <BarChart2 className="w-4 h-4 text-slate-400" /> Priority Level
              </label>
              <div className="grid grid-cols-3 gap-2.5">
                {(['low', 'medium', 'high'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    className={`py-2.5 text-xs font-bold capitalize rounded-xl border transition-all duration-200 cursor-pointer ${
                      priority === p
                        ? p === 'high'
                          ? 'bg-rose-50 border-rose-300 text-rose-600 font-extrabold'
                          : p === 'medium'
                          ? 'bg-amber-50 border-amber-300 text-amber-600 font-extrabold'
                          : 'bg-emerald-50 border-emerald-300 text-emerald-600 font-extrabold'
                        : 'bg-white border-slate-200 text-slate-400 hover:text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold uppercase tracking-widest py-3.5 rounded-xl flex items-center justify-center gap-2 shadow-xs hover:shadow-md transition-all duration-200 cursor-pointer"
          >
            <Sparkles className="w-4 h-4" /> Create Goal & Generate Plan
          </button>
        </form>
      )}
    </div>
  );
}
