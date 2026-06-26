import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, Clock, Calendar, CheckCircle, 
  ChevronRight, Target, AlertCircle, Plus, Info,
  LayoutDashboard, FolderKanban, ShieldAlert, MessageSquareCode,
  CalendarDays, Settings, Zap, ArrowRight, User, PlusCircle, CheckSquare, Square, RefreshCw, X
} from 'lucide-react';

import DashboardStatsPanel from './components/DashboardStatsPanel.tsx';
import ConflictsPanel from './components/ConflictsPanel.tsx';
import MissionCommanderPanel from './components/MissionCommanderPanel.tsx';
import DailyCoachPanel from './components/DailyCoachPanel.tsx';
import GoalCreatorPanel from './components/GoalCreatorPanel.tsx';
import GoalDetailPanel from './components/GoalDetailPanel.tsx';
import ExecutiveInsightsPanel from './components/ExecutiveInsightsPanel.tsx';
import { Goal, GoalMetrics, DashboardStats, GoalConflict, Task } from './types.js';

interface GoalWithMetrics extends Goal {
  metrics: GoalMetrics;
}

const CURATED_QUOTES = [
  { text: "Professionals execute on schedule; amateurs execute on mood. Protect your blocks.", author: "Execution Axiom" },
  { text: "You do not rise to the level of your goals. You fall to the level of your systems.", author: "James Clear" },
  { text: "Action is the only antidote to anxiety. Select the smallest pending task, and take action.", author: "Zero Hour Principle" },
  { text: "Discipline is choosing between what you want now and what you want most.", author: "Abraham Lincoln" },
  { text: "Concentrate all thoughts upon the work at hand. The sun's rays do not burn until brought to a focus.", author: "Alexander Graham Bell" },
  { text: "Discipline equals freedom. It is the catalyst that converts aspiration into reality.", author: "Jocko Willink" },
  { text: "Focus is a matter of deciding what things you're not going to do.", author: "John Carmack" },
  { text: "It is not that we have a short time to live, but that we waste a lot of it.", author: "Seneca" },
  { text: "Consistency beats intensity. A small, focused effort repeated daily wins over time.", author: "Consistency Rule" },
  { text: "Amateurs wait for inspiration. The rest of us just get up and go to work.", author: "Chuck Close" },
  { text: "The best way to predict the future is to create it. Begin execution today.", author: "Peter Drucker" },
  { text: "If you commit to nothing, you're distracted by everything. Establish your single daily priority.", author: "Priority Axiom" },
  { text: "Be strict with yourself, but gentle with the world. Execute with quiet consistency.", author: "Marcus Aurelius" },
  { text: "Simplicity is the ultimate sophistication. Trim the scope, amplify the focus, and execute.", author: "Leonardo da Vinci" },
  { text: "Real progress is incremental. Win the next hour, and the day will take care of itself.", author: "Incremental Axiom" }
];

export default function App() {
  const [goals, setGoals] = useState<GoalWithMetrics[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    activeGoalsCount: 0,
    goalsAtRiskCount: 0,
    averageProgress: 0,
    totalTasksCount: 0,
    completedTasksCount: 0,
  });
  const [conflicts, setConflicts] = useState<GoalConflict[]>([]);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [showCreator, setShowCreator] = useState(false);

  // Sidebar navigation state
  const [activeTab, setActiveTab] = useState<'dashboard' | 'goals' | 'conflicts' | 'coach' | 'calendar' | 'settings'>('dashboard');

  // Dynamic Workspace State Mockups (Tuned by the user)
  const [workspaceCapacity, setWorkspaceCapacity] = useState(8.0);
  const [userName, setUserName] = useState('Aaditya');
  const [workspaceName, setWorkspaceName] = useState('Personal Zero Hour Command Center');

  // Unified non-blocking toast state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToast({ message, type });
  };

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  // Load all initial board metrics from Express API
  const loadDashboardData = async () => {
    try {
      const goalsRes = await fetch('/api/goals');
      const statsRes = await fetch('/api/dashboard/stats');
      const conflictsRes = await fetch(`/api/dashboard/conflicts?workspaceCapacity=${workspaceCapacity}`);

      if (goalsRes.ok && statsRes.ok && conflictsRes.ok) {
        const goalsData = await goalsRes.json();
        const statsData = await statsRes.json();
        const conflictsData = await conflictsRes.json();

        setGoals(goalsData);
        setStats(statsData);
        setConflicts(conflictsData);

        // Batch load all tasks for calendar and schedule mapping
        if (goalsData.length > 0) {
          const promises = goalsData.map((g: Goal) => 
            fetch(`/api/tasks?goalId=${g.id}`).then((r) => r.ok ? r.json() : [])
          );
          const results = await Promise.all(promises);
          const flatTasks = results.flat().filter(t => t && t.id);
          setAllTasks(flatTasks);
        } else {
          setAllTasks([]);
        }
      }
    } catch (err) {
      console.error('Failed to reload command board:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, [refreshTrigger, workspaceCapacity]);

  const triggerRefresh = (deletedGoalId?: string) => {
    if (deletedGoalId && typeof deletedGoalId === 'string') {
      setGoals((prev) => prev.filter((g) => g.id !== deletedGoalId));
    }
    setRefreshTrigger((prev) => prev + 1);
  };

  // Toggle tasks check states from calendar/planner dashboard views
  const toggleTaskFromApp = async (taskId: string, completed: boolean) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: !completed })
      });
      if (res.ok) {
        triggerRefresh();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Get dynamic seed for Quote of the Day
  const today = new Date();
  const quoteIndex = (today.getDate() + today.getMonth()) % CURATED_QUOTES.length;
  const quoteOfTheDay = CURATED_QUOTES[quoteIndex];

  // Helper date lists for Calendar View starting Thursday June 25, 2026
  const getCalendarDays = () => {
    const start = new Date(2026, 5, 25); // Thursday June 25, 2026
    const days = [];
    const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (let i = 0; i < 7; i++) {
      const next = new Date(start);
      next.setDate(start.getDate() + i);
      days.push({
        date: next,
        label: weekdayNames[next.getDay()],
        dayNum: next.getDate(),
        fullStr: next.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      });
    }
    return days;
  };
  const calendarDays = getCalendarDays();
  const [selectedCalendarDayIdx, setSelectedCalendarDayIdx] = useState(0);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fafafb] flex flex-col items-center justify-center space-y-4">
        <div className="relative">
          <div className="w-10 h-10 border-2 border-indigo-500/10 border-t-indigo-500 rounded-full animate-spin"></div>
        </div>
        <div className="text-center space-y-1.5">
          <h2 className="text-xs font-black tracking-[0.2em] text-slate-400 uppercase font-sans">ZERO HOUR</h2>
          <p className="text-[10px] text-slate-400 font-bold tracking-wide animate-pulse uppercase">Syncing commitments and calibration plans...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fafafc] text-slate-800 font-sans relative overflow-x-hidden selection:bg-indigo-500 selection:text-white">
      
      {/* Dynamic blurred ambient light gradients */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] right-[-10%] w-[55%] h-[55%] rounded-full bg-indigo-200/25 blur-[140px] animate-[pulse_10s_ease-in-out_infinite]"></div>
        <div className="absolute bottom-[5%] left-[-15%] w-[65%] h-[65%] rounded-full bg-purple-200/20 blur-[160px] animate-[pulse_15s_ease-in-out_infinite_2s]"></div>
        <div className="absolute top-[30%] left-[25%] w-[35%] h-[35%] rounded-full bg-amber-100/15 blur-[120px] animate-[pulse_12s_ease-in-out_infinite_1s]"></div>
        <div className="absolute bottom-[20%] right-[10%] w-[45%] h-[45%] rounded-full bg-emerald-100/15 blur-[140px] animate-[pulse_11s_ease-in-out_infinite_3s]"></div>
      </div>

      <div className="flex relative z-10 min-h-screen">
        
        {/* DESKTOP SIDEBAR NAVIGATION PANEL */}
        <aside className="hidden lg:flex w-64 border-r border-slate-100/80 bg-white/70 backdrop-blur-md flex-col justify-between p-5 shrink-0 fixed h-screen">
          <div className="space-y-8">
            {/* Logo area */}
            <div className="flex items-center gap-3 px-2">
              <div className="bg-indigo-600 p-2 rounded-xl text-white shadow-md shadow-indigo-600/15">
                <Target className="w-4 h-4" />
              </div>
              <div>
                <h1 className="text-sm font-black tracking-wider text-slate-900 leading-none">ZERO HOUR</h1>
                <p className="text-[9px] font-bold tracking-widest text-indigo-500 uppercase mt-1">AI EXECUTION PARTNER</p>
              </div>
            </div>

            {/* Nav List */}
            <nav className="space-y-1.5">
              <button 
                onClick={() => { setSelectedGoalId(null); setActiveTab('dashboard'); }}
                className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer ${
                  activeTab === 'dashboard' && !selectedGoalId
                    ? 'bg-indigo-50 text-indigo-600' 
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                }`}
              >
                <LayoutDashboard className="w-4 h-4" />
                Executive Board
              </button>

              <button 
                onClick={() => { setSelectedGoalId(null); setActiveTab('goals'); }}
                className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer ${
                  activeTab === 'goals' && !selectedGoalId
                    ? 'bg-indigo-50 text-indigo-600' 
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                }`}
              >
                <FolderKanban className="w-4 h-4" />
                Commitment Center
              </button>

              <button 
                onClick={() => { setSelectedGoalId(null); setActiveTab('conflicts'); }}
                className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer ${
                  activeTab === 'conflicts' && !selectedGoalId
                    ? 'bg-indigo-50 text-indigo-600' 
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                }`}
              >
                <span className="flex items-center gap-3">
                  <ShieldAlert className="w-4 h-4" />
                  Capacity Alerts
                </span>
                {conflicts.length > 0 && (
                  <span className="bg-rose-100 text-rose-600 text-[10px] px-2 py-0.5 rounded-full font-black">
                    {conflicts.length}
                  </span>
                )}
              </button>

              <button 
                onClick={() => { setSelectedGoalId(null); setActiveTab('coach'); }}
                className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer ${
                  activeTab === 'coach' && !selectedGoalId
                    ? 'bg-indigo-50 text-indigo-600' 
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                }`}
              >
                <MessageSquareCode className="w-4 h-4" />
                AI Executive Coach
              </button>

              <button 
                onClick={() => { setSelectedGoalId(null); setActiveTab('calendar'); }}
                className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer ${
                  activeTab === 'calendar' && !selectedGoalId
                    ? 'bg-indigo-50 text-indigo-600' 
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                }`}
              >
                <CalendarDays className="w-4 h-4" />
                Weekly Planner
              </button>

              <button 
                onClick={() => { setSelectedGoalId(null); setActiveTab('settings'); }}
                className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer ${
                  activeTab === 'settings' && !selectedGoalId
                    ? 'bg-indigo-50 text-indigo-600' 
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                }`}
              >
                <Settings className="w-4 h-4" />
                Settings
              </button>
            </nav>
          </div>

          {/* Quick Mini User details card */}
          <div className="bg-slate-50/70 border border-slate-150/50 p-4 rounded-2xl flex items-center gap-3">
            <div className="bg-indigo-100 text-indigo-600 p-2.5 rounded-xl">
              <User className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-850 truncate">{userName}</p>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider truncate">Daily Cap: {workspaceCapacity}h</p>
            </div>
          </div>
        </aside>

        {/* CONTAINER ON THE RIGHT */}
        <div className="flex-1 lg:pl-64 flex flex-col min-h-screen">
          
          {/* RESPONSIVE HEADER BAR FOR PHONE / MOBILE */}
          <header className="border-b border-slate-100 bg-white/80 backdrop-blur-md sticky top-0 z-40 lg:hidden">
            <div className="px-4 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="bg-indigo-600 p-2 rounded-xl text-white shadow-xs">
                  <Target className="w-4 h-4" />
                </div>
                <div>
                  <h1 className="text-sm font-black text-slate-900 leading-none">ZERO HOUR</h1>
                  <p className="text-[9px] font-bold text-indigo-500 uppercase tracking-widest mt-1">AI EXECUTION PARTNER</p>
                </div>
              </div>

              {/* Quick tab switcher selector for mobile */}
              <select 
                value={selectedGoalId ? 'details' : activeTab}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'details') return;
                  setSelectedGoalId(null);
                  setActiveTab(val as any);
                }}
                className="bg-slate-50 border border-slate-200 text-xs font-bold rounded-xl px-2.5 py-1.5 focus:outline-none"
              >
                {selectedGoalId && <option value="details">Active Plan Details</option>}
                <option value="dashboard">Executive Board</option>
                <option value="goals">Commitments</option>
                <option value="conflicts">Capacity Checks</option>
                <option value="coach">AI Coach</option>
                <option value="calendar">Planner</option>
                <option value="settings">Settings</option>
              </select>
            </div>
          </header>

          {/* MAIN PAGE CONTAINER */}
          <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <AnimatePresence mode="wait">
              {selectedGoalId ? (
                /* DETAILED VIEW ROADMAP ROUTE */
                <motion.div
                  key="detail"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  transition={{ duration: 0.25 }}
                >
                  <GoalDetailPanel
                    goalId={selectedGoalId}
                    onBack={() => setSelectedGoalId(null)}
                    onGoalMutated={triggerRefresh}
                  />
                </motion.div>
              ) : (
                /* REDESIGNED MASTER HOME ROUTE */
                <motion.div
                  key="dashboard-tab"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-8"
                >
                  
                  {/* TAB 1: EXECUTIVE BOARD */}
                  {activeTab === 'dashboard' && (
                    <div className="space-y-8">
                      {goals.length === 0 ? (
                        /* Beautiful onboarding hero section */
                        <div className="space-y-10">
                          {/* Hero banner */}
                          <div className="bg-gradient-to-br from-indigo-50/50 via-purple-50/30 to-indigo-50/10 border border-slate-150/60 rounded-3xl p-8 md:p-12 relative overflow-hidden text-center space-y-6 shadow-xs">
                            <div className="absolute right-[-10%] top-[-10%] w-[50%] h-[120%] rounded-full bg-indigo-300/10 blur-3xl pointer-events-none"></div>
                            <div className="absolute left-[-10%] bottom-[-20%] w-[40%] h-[100%] rounded-full bg-purple-300/10 blur-3xl pointer-events-none"></div>
                            
                            <div className="relative z-10 max-w-2xl mx-auto space-y-5">
                              <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-100/60 border border-indigo-200/40 rounded-full text-[10px] font-black text-indigo-600 uppercase tracking-widest">
                                🚀 Mission Onboarding
                              </div>
                              
                              <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-slate-850 font-display leading-tight">
                                👋 Welcome to <span className="bg-gradient-to-r from-indigo-600 to-indigo-500 bg-clip-text text-transparent">ZERO HOUR</span>
                              </h2>
                              
                              <p className="text-xs md:text-sm font-extrabold text-indigo-600 tracking-wider uppercase">
                                Your AI Execution Partner.
                              </p>
                              
                              <p className="text-sm md:text-base text-slate-500 font-medium leading-relaxed max-w-lg mx-auto">
                                Turn overwhelming goals into clear daily actions, stay ahead of deadlines, and make consistent progress every day.
                              </p>
                            </div>
                          </div>

                          {/* How it works */}
                          <div className="space-y-6">
                            <div className="text-center">
                              <h3 className="text-xs font-black tracking-widest text-slate-400 uppercase font-display">How It Works</h3>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-stretch relative">
                              {[
                                {
                                  icon: '🎯',
                                  title: 'Create Goal',
                                  desc: 'Describe your objective, deadline, available time, and priority.',
                                },
                                {
                                  icon: '🧠',
                                  title: 'AI Builds Your Plan',
                                  desc: 'ZERO HOUR automatically creates milestones, subtasks, and a realistic schedule.',
                                },
                                {
                                  icon: '📈',
                                  title: 'Track Progress',
                                  desc: 'Complete tasks, monitor risk, and stay on top of every goal.',
                                },
                                {
                                  icon: '🏆',
                                  title: 'Achieve Your Goal',
                                  desc: 'Receive coaching, recover from setbacks, and finish on time.',
                                }
                              ].map((step, idx) => (
                                <div key={idx} className="relative flex flex-col items-stretch">
                                  {/* Step Card */}
                                  <div className="h-full w-full bg-white border border-slate-100 hover:border-slate-200 hover:shadow-lg hover:shadow-indigo-500/[0.02] transition-all duration-300 rounded-3xl p-6 flex flex-col items-center text-center space-y-4 shadow-[0_4px_20px_rgba(0,0,0,0.01)] relative z-10 group">
                                    <div className="w-12 h-12 rounded-2xl bg-slate-50 group-hover:bg-indigo-50 group-hover:scale-105 transition-all duration-300 flex items-center justify-center text-2xl shrink-0 shadow-xs">
                                      {step.icon}
                                    </div>
                                    <div className="space-y-1.5">
                                      <h4 className="text-xs font-black text-slate-850 uppercase tracking-widest font-display">{step.title}</h4>
                                      <p className="text-xs text-slate-500 font-medium leading-relaxed">{step.desc}</p>
                                    </div>
                                  </div>

                                  {/* Connecting Arrow */}
                                  {idx < 3 && (
                                    <div className="flex items-center justify-center my-3 md:my-0 md:absolute md:top-1/2 md:-right-6 md:-translate-y-1/2 md:translate-x-1/2 z-20 text-slate-300">
                                      {/* Desktop Right Arrow */}
                                      <ArrowRight className="hidden md:block w-5 h-5 text-slate-300 animate-[pulse_2s_infinite]" />
                                      {/* Mobile Down Arrow */}
                                      <span className="block md:hidden text-lg font-black text-slate-300 animate-[pulse_2s_infinite]">↓</span>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* CTA Button */}
                          <div className="flex justify-center pt-6">
                            <motion.button
                              whileHover={{ scale: 1.02, y: -2 }}
                              whileTap={{ scale: 0.98 }}
                              onClick={() => {
                                setActiveTab('goals');
                                setShowCreator(true);
                                setTimeout(() => {
                                  const el = document.getElementById('goal-creator-section');
                                  if (el) {
                                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                  }
                                }, 150);
                              }}
                              className="flex items-center gap-2.5 px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all duration-300 shadow-md hover:shadow-indigo-500/20 cursor-pointer"
                            >
                              <span>✨</span> Create Your First Goal
                            </motion.button>
                          </div>
                        </div>
                      ) : (
                        /* NORMAL EXECUTIVE BOARD DASHBOARD */
                        <div className="space-y-8">
                          {/* GREETING BANNER WITH Abstract Landscape Gradient */}
                          <div className="bg-gradient-to-r from-indigo-50 via-purple-50 to-indigo-50/30 border border-slate-100/60 rounded-3xl p-6 md:p-8 relative overflow-hidden grid grid-cols-1 md:grid-cols-3 gap-6 items-center shadow-xs">
                            <div className="absolute right-[-10%] top-[-10%] w-[45%] h-[110%] rounded-full bg-gradient-to-br from-indigo-300/10 to-emerald-300/10 blur-3xl pointer-events-none"></div>
                            <div className="absolute left-[30%] bottom-[-20%] w-[35%] h-[80%] rounded-full bg-purple-300/10 blur-2xl pointer-events-none"></div>

                            <div className="md:col-span-2 space-y-5 relative z-10 flex flex-col justify-between h-full">
                              <div className="space-y-1.5">
                                <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-800 font-display">
                                  Good Morning, {userName} 👋
                                </h2>
                                <p className="text-xs md:text-sm text-slate-500 font-medium leading-relaxed">
                                  Let's make meaningful, stress-free progress today on your goals.
                                </p>
                              </div>

                              {/* Integrated Curated Daily Quote of the Day */}
                              <div className="bg-white/80 backdrop-blur-md border border-slate-150/40 p-4 rounded-2xl flex items-start gap-3.5 relative overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.015)]">
                                <div className="bg-indigo-50 text-indigo-600 p-2 rounded-xl shrink-0">
                                  <Sparkles className="w-3.5 h-3.5" />
                                </div>
                                <div className="space-y-1 min-w-0 pr-6">
                                  <p className="text-[11px] text-slate-650 italic leading-relaxed font-semibold truncate md:whitespace-normal">
                                    "{quoteOfTheDay.text}"
                                  </p>
                                  <p className="text-[10px] text-slate-400 font-bold">— {quoteOfTheDay.author}</p>
                                </div>
                                <div className="absolute right-3 top-2.5 text-slate-100 font-serif text-5xl select-none pointer-events-none">“</div>
                              </div>
                            </div>

                            {/* Floating Code-Generated Decorative Banner */}
                            <div className="hidden md:block h-40 relative z-10 w-full overflow-hidden rounded-2xl border border-slate-200/65 shadow-xs hover:shadow-md transition-all duration-300 bg-white/40 backdrop-blur-md">
                              <svg viewBox="0 0 400 240" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full select-none">
                                {/* Defs for gradients */}
                                <defs>
                                  <linearGradient id="skyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" stopColor="#F5F3FF" />
                                    <stop offset="60%" stopColor="#EEF2FF" />
                                    <stop offset="100%" stopColor="#E0E7FF" />
                                  </linearGradient>
                                  <linearGradient id="sunGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" stopColor="#818CF8" stopOpacity="0.85" />
                                    <stop offset="100%" stopColor="#C084FC" stopOpacity="0.4" />
                                  </linearGradient>
                                  <linearGradient id="wave1" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" stopColor="#6366F1" stopOpacity="0.3" />
                                    <stop offset="100%" stopColor="#4F46E5" stopOpacity="0.05" />
                                  </linearGradient>
                                  <linearGradient id="wave2" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" stopColor="#10B981" stopOpacity="0.2" />
                                    <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.05" />
                                  </linearGradient>
                                  <linearGradient id="wave3" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" stopColor="#4F46E5" stopOpacity="0.4" />
                                    <stop offset="100%" stopColor="#312E81" stopOpacity="0.25" />
                                  </linearGradient>
                                </defs>

                                {/* Background layer */}
                                <rect width="100%" height="100%" fill="url(#skyGrad)" />

                                {/* Grid of Focus Lines */}
                                <g opacity="0.12">
                                  <line x1="80" y1="0" x2="80" y2="240" stroke="#4F46E5" strokeWidth="0.5" strokeDasharray="3 3" />
                                  <line x1="160" y1="0" x2="160" y2="240" stroke="#4F46E5" strokeWidth="0.5" strokeDasharray="3 3" />
                                  <line x1="240" y1="0" x2="240" y2="240" stroke="#4F46E5" strokeWidth="0.5" strokeDasharray="3 3" />
                                  <line x1="320" y1="0" x2="320" y2="240" stroke="#4F46E5" strokeWidth="0.5" strokeDasharray="3 3" />
                                  <line x1="0" y1="60" x2="400" y2="60" stroke="#4F46E5" strokeWidth="0.5" strokeDasharray="3 3" />
                                  <line x1="0" y1="120" x2="400" y2="120" stroke="#4F46E5" strokeWidth="0.5" strokeDasharray="3 3" />
                                  <line x1="0" y1="180" x2="400" y2="180" stroke="#4F46E5" strokeWidth="0.5" strokeDasharray="3 3" />
                                </g>

                                {/* Glowing Orb of Focus */}
                                <circle cx="310" cy="90" r="48" fill="url(#sunGrad)" />

                                {/* Abstract Hills/Waves of Workload/Progress */}
                                <path d="M-20,240 C80,130 180,210 420,120 L420,240 Z" fill="url(#wave1)" />
                                <path d="M-20,240 C120,170 240,110 420,180 L420,240 Z" fill="url(#wave2)" />
                                <path d="M-20,240 C100,200 280,140 420,140 L420,240 Z" fill="url(#wave3)" />

                                {/* Decorative Stars/Particles */}
                                <g opacity="0.85">
                                  {/* Little twinkling diamonds */}
                                  <path d="M 120,60 L 123,65 L 128,66 L 123,67 L 120,72 L 117,67 L 112,66 L 117,65 Z" fill="#6366F1" />
                                  <path d="M 220,40 L 221.5,43 L 224.5,44 L 221.5,45 L 220,48 L 218.5,45 L 215.5,44 L 218.5,43 Z" fill="#10B981" opacity="0.75" />
                                  <path d="M 70,110 L 71.5,113 L 74.5,114 L 71.5,115 L 70,118 L 68.5,115 L 65.5,114 L 68.5,113 Z" fill="#818CF8" opacity="0.6" />
                                </g>

                                {/* Productivity concentric rings */}
                                <circle cx="310" cy="90" r="66" fill="none" stroke="#6366F1" strokeWidth="0.5" strokeDasharray="2 6" opacity="0.4" />
                                <circle cx="310" cy="90" r="84" fill="none" stroke="#10B981" strokeWidth="0.5" strokeDasharray="1 8" opacity="0.3" />
                              </svg>
                            </div>
                          </div>

                          {/* STATS PANELS */}
                          <div className="space-y-3.5">
                            <div className="flex items-center gap-2 px-1">
                              <h3 className="text-xs font-black tracking-widest text-slate-400 uppercase">Insights Metrics</h3>
                              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></span>
                            </div>
                            <DashboardStatsPanel stats={stats} />
                          </div>

                          {/* TODAY'S FOCUS (LARGEST CARD ON MASTER BOARD) */}
                          <div className="space-y-3.5">
                            <div className="flex items-center gap-2 px-1">
                              <h3 className="text-xs font-black tracking-widest text-slate-400 uppercase">Primary Focus Area</h3>
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                            </div>
                            <MissionCommanderPanel 
                              goals={goals}
                              goalsCount={goals.length} 
                              triggerRefreshStats={loadDashboardData} 
                              showToast={showToast}
                            />
                          </div>

                          {/* ADVISOR BRIEF, CAPACITY DETECTIONS, AND EXECUTIVE METRICS */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-6 flex flex-col">
                              <div className="space-y-3">
                                <h3 className="text-xs font-black tracking-widest text-slate-400 uppercase px-1">System Capacity</h3>
                                <ConflictsPanel conflicts={conflicts} workspaceCapacity={workspaceCapacity} goals={goals} />
                              </div>
                              <div className="space-y-3 flex-1 flex flex-col">
                                <h3 className="text-xs font-black tracking-widest text-slate-400 uppercase px-1">Executive Insights</h3>
                                <ExecutiveInsightsPanel stats={stats} goals={goals} conflictsCount={conflicts.length} />
                              </div>
                            </div>
                            <div className="space-y-3 flex flex-col justify-between">
                              <div className="space-y-3 flex-1 flex flex-col">
                                <h3 className="text-xs font-black tracking-widest text-slate-400 uppercase px-1">Coach Insight</h3>
                                <DailyCoachPanel goalsCount={goals.length} />
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 2: COMMITMENT CENTER (GOALS LIST & FORM) */}
                  {activeTab === 'goals' && (
                    <div className="space-y-6">
                      <div className="flex items-center justify-between px-1">
                        <div>
                          <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider">Active Commitments</h3>
                          <p className="text-xs text-slate-400 font-medium">Track your goals, required velocities, and roadmaps</p>
                        </div>
                        <button
                          onClick={() => setShowCreator(!showCreator)}
                          className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white border border-transparent rounded-2xl shadow-sm transition duration-250 cursor-pointer"
                        >
                          <Plus className="w-4 h-4" />
                          {showCreator ? 'Hide Commitment Panel' : 'Register Commitment'}
                        </button>
                      </div>

                      {/* Collapsible Creator Panel */}
                      <AnimatePresence>
                        {showCreator && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="pb-4" id="goal-creator-section">
                              <GoalCreatorPanel onGoalCreated={() => {
                                triggerRefresh();
                                setShowCreator(false);
                              }} />
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Goal Cards Grid */}
                      {goals.length === 0 ? (
                        <div className="bg-white border border-slate-100 rounded-3xl p-16 text-center space-y-4 shadow-xs relative overflow-hidden">
                          <div className="bg-indigo-50/60 text-indigo-500 p-4 rounded-full w-14 h-14 flex items-center justify-center mx-auto">
                            <span className="text-2xl">🎯</span>
                          </div>
                          <div className="space-y-2">
                            <h4 className="text-sm font-extrabold text-slate-800 font-display">Ready to achieve something great?</h4>
                            <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                              Create your first goal and let <strong className="text-indigo-600">ZERO HOUR</strong> build a personalized execution plan.
                            </p>
                          </div>
                          <button
                            onClick={() => setShowCreator(true)}
                            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold uppercase tracking-widest transition cursor-pointer shadow-xs"
                          >
                            Add Your First Goal
                          </button>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {goals
                            .sort((a, b) => b.metrics.riskScore - a.metrics.riskScore) // High risk to top
                            .map((goal) => {
                              const m = goal.metrics;
                              const isHigh = m.riskLevel === 'red';
                              const isMed = m.riskLevel === 'yellow';

                              const priorityColor = goal.priority === 'high' 
                                ? 'text-rose-600 bg-rose-50 border-rose-100/60' 
                                : goal.priority === 'medium'
                                ? 'text-amber-600 bg-amber-50 border-amber-100/60'
                                : 'text-emerald-600 bg-emerald-50 border-emerald-100/60';

                              const riskLabel = isHigh 
                                ? 'Action Needed' 
                                : isMed
                                ? 'Monitor Pace'
                                : 'Healthy Pace';

                              const riskColor = isHigh 
                                ? 'text-rose-600 bg-rose-50 border-rose-100/40' 
                                : isMed
                                ? 'text-amber-600 bg-amber-50 border-amber-100/40'
                                : 'text-emerald-600 bg-emerald-50 border-emerald-100/40';

                              return (
                                <motion.div
                                  key={goal.id}
                                  layoutId={`card-${goal.id}`}
                                  onClick={() => setSelectedGoalId(goal.id)}
                                  className="bg-white border border-slate-100 rounded-3xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.02)] hover:shadow-[0_12px_35px_rgba(79,70,229,0.06)] hover:border-slate-200 cursor-pointer transition-all duration-300 relative overflow-hidden flex flex-col justify-between group"
                                  whileHover={{ y: -3 }}
                                >
                                  {/* Subtle background gradient glow */}
                                  <div className="absolute right-0 top-0 w-32 h-32 bg-indigo-50/20 rounded-full blur-3xl pointer-events-none group-hover:bg-indigo-50/30 transition-all duration-500" />

                                  <div className="space-y-4">
                                    <div className="flex items-start justify-between gap-4">
                                      <div className="space-y-2.5">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <span className={`text-[9px] font-extrabold uppercase px-2.5 py-0.5 rounded-full border ${priorityColor} font-display tracking-widest`}>
                                            {goal.priority} priority
                                          </span>
                                          <span className={`text-[9px] font-extrabold uppercase px-2.5 py-0.5 rounded-full border ${riskColor} font-display tracking-widest`}>
                                            {riskLabel}
                                          </span>
                                          <span className="text-[10px] font-bold text-slate-400">
                                            {m.daysRemaining > 0 ? `${m.daysRemaining} days remaining` : 'Due today'}
                                          </span>
                                        </div>
                                        <h4 className="text-base font-extrabold text-slate-850 group-hover:text-indigo-600 transition tracking-tight leading-tight">
                                          {goal.name}
                                        </h4>
                                        <p className="text-xs text-slate-450 line-clamp-2 leading-relaxed">
                                          {goal.description || 'No detailed objectives provided.'}
                                        </p>
                                      </div>

                                      {/* PROGRESS RING */}
                                      <div className="relative w-12 h-12 flex items-center justify-center shrink-0">
                                        <svg className="w-12 h-12" viewBox="0 0 36 36">
                                          {/* Circle track */}
                                          <circle cx="18" cy="18" r="16" fill="none" stroke="#F8FAFC" strokeWidth="2.5" />
                                          {/* Circle progress bar */}
                                          <circle 
                                            cx="18" 
                                            cy="18" 
                                            r="16" 
                                            fill="none" 
                                            stroke={isHigh ? '#F43F5E' : isMed ? '#F59E0B' : '#10B981'} 
                                            strokeWidth="2.5" 
                                            strokeDasharray="100.5 100" 
                                            strokeDashoffset={100 - m.progressPercentage} 
                                            strokeLinecap="round"
                                            transform="rotate(-90 18 18)"
                                            className="transition-all duration-700 ease-out"
                                          />
                                        </svg>
                                        <span className="absolute text-[10px] font-bold font-mono text-slate-700">
                                          {m.progressPercentage}%
                                        </span>
                                      </div>
                                    </div>

                                    {/* Progress details line */}
                                    <div className="space-y-1.5 pt-1.5">
                                      <div className="flex justify-between text-[10px] text-slate-400 font-bold uppercase tracking-widest font-display">
                                        <span>Goal Completion Progress</span>
                                        <span>{m.completedHours}/{m.totalHours} hours</span>
                                      </div>
                                      <div className="w-full bg-slate-50 border border-slate-100 rounded-full h-2 overflow-hidden">
                                        <div 
                                          className={`h-2 rounded-full transition-all duration-500 ${
                                            isHigh ? 'bg-rose-500' : isMed ? 'bg-amber-500' : 'bg-emerald-500'
                                          }`}
                                          style={{ width: `${m.progressPercentage}%` }}
                                        ></div>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Bottom Details panel */}
                                  <div className="border-t border-slate-50 mt-5 pt-3.5 flex items-center justify-between text-[10px] text-slate-450">
                                    <div className="flex gap-4">
                                      <div>
                                        <span className="text-slate-400 font-bold block uppercase text-[8px] tracking-widest font-display">Daily Pace</span>
                                        <span className="text-slate-700 font-extrabold font-mono mt-0.5 block">{m.requiredDailyHours.toFixed(1)}h/day</span>
                                      </div>
                                      <div>
                                        <span className="text-slate-400 font-bold block uppercase text-[8px] tracking-widest font-display">Confidence Score</span>
                                        <span className="text-indigo-600 font-black font-mono mt-0.5 block">{m.successProbability}%</span>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-1 font-extrabold text-indigo-600 uppercase tracking-widest text-[9px] font-display group-hover:translate-x-1 transition-all">
                                      Quick View <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                                    </div>
                                  </div>

                                </motion.div>
                              );
                            })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 3: SYSTEMIC CAPACITY CONFLICT ALERTS */}
                  {activeTab === 'conflicts' && (
                    <div className="space-y-6">
                      <div className="px-1">
                        <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider">System Balance & Conflicts</h3>
                        <p className="text-xs text-slate-400 font-medium">Verify daily available capacity thresholds and pacing overload blocks</p>
                      </div>
                      <ConflictsPanel conflicts={conflicts} workspaceCapacity={workspaceCapacity} goals={goals} />
                    </div>
                  )}

                  {/* TAB 4: AI COACH FEEDBACK */}
                  {activeTab === 'coach' && (
                    <div className="space-y-6">
                      <div className="px-1">
                        <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider">AI Executive Coach</h3>
                        <p className="text-xs text-slate-400 font-medium">Accountability mentoring, streak diagnostics, and motivational checklists</p>
                      </div>
                      <DailyCoachPanel goalsCount={goals.length} />
                    </div>
                  )}

                  {/* TAB 5: WEEKLY CALENDAR PLANNER (MAGNIFICENT GRID!) */}
                  {activeTab === 'calendar' && (
                    <div className="space-y-6">
                      <div className="px-1">
                        <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider">Aggregated Task Schedule</h3>
                        <p className="text-xs text-slate-400 font-medium">Interactive timeline mapping of tasks distributed from active commitments</p>
                      </div>

                      {goals.length === 0 ? (
                        <div className="bg-white border border-slate-100 rounded-3xl p-16 text-center space-y-4 shadow-xs">
                          <div className="text-3xl">🎯</div>
                          <h4 className="text-sm font-extrabold text-slate-800 font-display">Ready to achieve something great?</h4>
                          <p className="text-xs text-slate-550 max-w-sm mx-auto leading-relaxed">
                            Create your first goal and let <strong className="text-indigo-600">ZERO HOUR</strong> build a personalized execution plan.
                          </p>
                        </div>
                      ) : (
                        <div className="bg-white border border-slate-100 rounded-3xl p-6 md:p-8 space-y-6 shadow-xs">
                          
                          {/* Calendar Days strip header */}
                          <div className="grid grid-cols-7 gap-2">
                            {calendarDays.map((day, idx) => {
                              const isSelected = selectedCalendarDayIdx === idx;
                              // Filter tasks for this specific mock day of focus
                              const dayTasksCount = allTasks.filter((t, tIdx) => (tIdx % 7) === idx && !t.completed).length;

                              return (
                                <div
                                  key={idx}
                                  onClick={() => setSelectedCalendarDayIdx(idx)}
                                  className={`p-3 rounded-2xl text-center cursor-pointer transition-all duration-300 border ${
                                    isSelected
                                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-600/15'
                                      : 'bg-slate-50/50 hover:bg-slate-50 border-slate-100/80 text-slate-600'
                                  }`}
                                >
                                  <span className={`text-[10px] block font-bold uppercase tracking-wider ${isSelected ? 'text-indigo-200' : 'text-slate-400'}`}>
                                    {day.label}
                                  </span>
                                  <span className="text-lg font-black block mt-1 leading-none">{day.dayNum}</span>
                                  {dayTasksCount > 0 && (
                                    <span className={`inline-block w-1.5 h-1.5 rounded-full mt-2 ${isSelected ? 'bg-white animate-pulse' : 'bg-indigo-500'}`}></span>
                                  )}
                                </div>
                              );
                            })}
                          </div>

                          {/* Selected Day Task Allocation slot list */}
                          <div className="border-t border-slate-100 pt-6 space-y-4">
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest">
                                Focus Slots: {calendarDays[selectedCalendarDayIdx].fullStr}
                              </h4>
                              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-xl">
                                <Clock className="w-3.5 h-3.5" />
                                <span>Pacing Capacity: <strong className="text-slate-700">{workspaceCapacity}h max</strong></span>
                              </div>
                            </div>

                            {/* Dynamically slice tasks to fill daily view based on index */}
                            {allTasks.filter((t, tIdx) => (tIdx % 7) === selectedCalendarDayIdx).length === 0 ? (
                              <div className="bg-slate-50/40 border border-slate-100/60 p-12 rounded-2xl text-center space-y-3">
                                <div className="text-2xl">🌱</div>
                                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider font-display">A fresh day begins</h4>
                                <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                                  Create a goal or continue an existing one to track your commitments.
                                </p>
                              </div>
                            ) : (
                              <div className="space-y-3">
                                {allTasks.filter((t, tIdx) => (tIdx % 7) === selectedCalendarDayIdx).every(t => t.completed) && (
                                  <div className="p-5 bg-emerald-50/20 border border-emerald-100 rounded-2xl flex items-center gap-4 text-left shadow-2xs mb-4">
                                    <span className="text-3xl shrink-0">🎉</span>
                                    <div>
                                      <h4 className="text-sm font-extrabold text-emerald-800 font-display">Great work!</h4>
                                      <p className="text-xs text-slate-650 mt-1 leading-relaxed">
                                        Today's focus is complete. Keep the momentum going tomorrow.
                                      </p>
                                    </div>
                                  </div>
                                )}
                                {allTasks
                                  .filter((t, tIdx) => (tIdx % 7) === selectedCalendarDayIdx)
                                  .map((task) => (
                                    <div 
                                      key={task.id}
                                      className={`flex items-center justify-between p-4 rounded-xl border transition ${
                                        task.completed 
                                          ? 'bg-slate-50/50 border-slate-100/60 text-slate-400' 
                                          : 'bg-white border-slate-100 text-slate-700 hover:border-slate-200 shadow-xs'
                                      }`}
                                    >
                                      <div className="flex items-center gap-3 min-w-0">
                                        <button 
                                          onClick={() => toggleTaskFromApp(task.id, task.completed)}
                                          className="shrink-0 transition cursor-pointer"
                                        >
                                          {task.completed ? (
                                            <CheckSquare className="w-5 h-5 text-emerald-500" />
                                          ) : (
                                            <Square className="w-5 h-5 text-slate-300" />
                                          )}
                                        </button>
                                        <div className="min-w-0">
                                          <p className={`text-xs md:text-sm font-bold truncate leading-normal ${task.completed ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                                            {task.name}
                                          </p>
                                          <span className="text-[10px] text-slate-400 font-bold block mt-0.5 truncate uppercase">
                                            Milestone: {task.milestone}
                                          </span>
                                        </div>
                                      </div>

                                      <span className="bg-slate-50 border border-slate-100 font-bold text-[10px] font-mono text-slate-500 px-2.5 py-1 rounded-lg">
                                        {task.estimatedHours}h slot
                                      </span>
                                    </div>
                                  ))}
                              </div>
                            )}

                          </div>

                        </div>
                      )}

                    </div>
                  )}

                  {/* TAB 6: SETTINGS & TUNING */}
                  {activeTab === 'settings' && (
                    <div className="space-y-6">
                      <div className="px-1">
                        <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider">Workspace Calibration</h3>
                        <p className="text-xs text-slate-400 font-medium">Fine-tune username, capacity limits, and AI coaching parameter thresholds</p>
                      </div>

                      <div className="bg-white border border-slate-100 rounded-3xl p-6 md:p-8 space-y-6 shadow-xs">
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          
                          {/* Workspace Name */}
                          <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Personal Identifier</label>
                            <input
                              type="text"
                              value={userName}
                              onChange={(e) => setUserName(e.target.value)}
                              className="w-full bg-white border border-slate-200/85 rounded-xl px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition font-medium"
                            />
                          </div>

                          {/* Workspace Name text */}
                          <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Workspace Name</label>
                            <input
                              type="text"
                              value={workspaceName}
                              onChange={(e) => setWorkspaceName(e.target.value)}
                              className="w-full bg-white border border-slate-200/85 rounded-xl px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition font-medium"
                            />
                          </div>

                          {/* Daily available capacity hours */}
                          <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Daily Available Focus Capacity</label>
                            <div className="flex items-center gap-3">
                              <button 
                                onClick={() => setWorkspaceCapacity(Math.max(1, workspaceCapacity - 0.5))}
                                className="px-3.5 py-2 bg-slate-50 border border-slate-250 hover:bg-slate-100 font-bold rounded-xl text-slate-700 text-xs transition cursor-pointer"
                              >
                                -0.5h
                              </button>
                              <div className="flex-1 bg-slate-50 border border-slate-100 rounded-xl py-2 px-4 text-center">
                                <span className="text-base font-extrabold font-mono text-indigo-600">{workspaceCapacity.toFixed(1)}h</span>
                                <span className="text-slate-400 text-xs font-normal"> / day max</span>
                              </div>
                              <button 
                                onClick={() => setWorkspaceCapacity(Math.min(24, workspaceCapacity + 0.5))}
                                className="px-3.5 py-2 bg-slate-50 border border-slate-250 hover:bg-slate-100 font-bold rounded-xl text-slate-700 text-xs transition cursor-pointer"
                              >
                                +0.5h
                              </button>
                            </div>
                          </div>

                          {/* Coach severity mode */}
                          <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Coach Severity Tone</label>
                            <div className="grid grid-cols-2 gap-3">
                              <span className="py-2.5 px-4 bg-indigo-50 border border-indigo-200 text-indigo-600 text-xs font-extrabold text-center rounded-xl block cursor-default">
                                High-Performing Mentor
                              </span>
                              <span className="py-2.5 px-4 bg-slate-50 text-slate-450 border border-slate-200/80 text-xs font-bold text-center rounded-xl block cursor-not-allowed opacity-50 select-none">
                                Tactical Commander (Locked)
                              </span>
                            </div>
                          </div>

                        </div>

                        <div className="border-t border-slate-100 pt-6 flex items-center justify-between text-xs text-slate-450">
                          <span className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            <span>Calibration variables synced locally.</span>
                          </span>
                          <button
                            onClick={() => showToast('Calibration preferences locked in workspace configuration.', 'success')}
                            className="px-5 py-3 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold uppercase tracking-widest rounded-xl shadow-xs transition"
                          >
                            Save Settings
                          </button>
                        </div>

                      </div>
                    </div>
                  )}

                </motion.div>
              )}
            </AnimatePresence>
          </main>

        </div>

      </div>

      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-6 right-6 z-[99999] max-w-sm w-full bg-slate-900 text-white rounded-2xl p-4 shadow-2xl border border-slate-800 flex items-center gap-3"
          >
            <div className={`p-2 rounded-xl shrink-0 ${
              toast.type === 'error' ? 'bg-rose-500/20 text-rose-400' :
              toast.type === 'info' ? 'bg-indigo-500/20 text-indigo-400' :
              'bg-emerald-500/20 text-emerald-400'
            }`}>
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold leading-normal text-slate-100">{toast.message}</p>
            </div>
            <button
              onClick={() => setToast(null)}
              className="text-slate-500 hover:text-slate-350 p-1 rounded-lg cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
