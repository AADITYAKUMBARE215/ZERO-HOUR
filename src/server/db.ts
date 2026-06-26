import fs from 'fs';
import path from 'path';
import { Goal, Task, AIOutput, GoalMetrics, GoalConflict, DashboardStats, PriorityType, RiskLevelType } from '../types.js';

const DB_FILE = path.join(process.cwd(), 'sqlite_db.json');

interface DatabaseSchema {
  goals: Goal[];
  tasks: Task[];
  ai_outputs: AIOutput[];
}

// Initial default database structure
const initialDb: DatabaseSchema = {
  goals: [],
  tasks: [],
  ai_outputs: []
};

// Helper to ensure database file exists and load it
function loadDb(): DatabaseSchema {
  try {
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify(initialDb, null, 2), 'utf-8');
      return initialDb;
    }
    const data = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error loading database, returning defaults:', err);
    return initialDb;
  }
}

// Helper to save database file
function saveDb(db: DatabaseSchema): void {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving database to file:', err);
  }
}

// Relational DB Store implementation
export const db = {
  // --- GOALS TABLE OPERATIONS ---
  getGoals(): Goal[] {
    const data = loadDb();
    return data.goals.map(g => ({
      ...g,
      dailyGoalAllocation: g.dailyGoalAllocation ?? g.availableHoursPerDay ?? 2
    }));
  },

  getGoal(id: string): Goal | undefined {
    const data = loadDb();
    const g = data.goals.find(g => g.id === id);
    if (!g) return undefined;
    return {
      ...g,
      dailyGoalAllocation: g.dailyGoalAllocation ?? g.availableHoursPerDay ?? 2
    };
  },

  addGoal(goal: Goal): void {
    const data = loadDb();
    const goalWithAllocation = {
      ...goal,
      dailyGoalAllocation: goal.dailyGoalAllocation ?? goal.availableHoursPerDay ?? 2
    };
    data.goals.push(goalWithAllocation);
    saveDb(data);
  },

  updateGoal(id: string, updatedFields: Partial<Goal>): void {
    const data = loadDb();
    const index = data.goals.findIndex(g => g.id === id);
    if (index !== -1) {
      const currentGoal = data.goals[index];
      const newDailyGoalAllocation = updatedFields.dailyGoalAllocation ?? currentGoal.dailyGoalAllocation ?? currentGoal.availableHoursPerDay ?? 2;
      data.goals[index] = { 
        ...currentGoal, 
        ...updatedFields,
        dailyGoalAllocation: newDailyGoalAllocation
      };
      saveDb(data);
    }
  },

  deleteGoal(id: string): void {
    const data = loadDb();
    // Cascade delete tasks and ai_outputs
    data.goals = data.goals.filter(g => g.id !== id);
    data.tasks = data.tasks.filter(t => t.goalId !== id);
    data.ai_outputs = data.ai_outputs.filter(o => o.goalId !== id);
    saveDb(data);
  },

  // --- TASKS TABLE OPERATIONS ---
  getTasks(goalId?: string): Task[] {
    const data = loadDb();
    if (goalId) {
      return data.tasks.filter(t => t.goalId === goalId);
    }
    return data.tasks;
  },

  getTask(id: string): Task | undefined {
    const data = loadDb();
    return data.tasks.find(t => t.id === id);
  },

  addTask(task: Task): void {
    const data = loadDb();
    data.tasks.push(task);
    saveDb(data);
  },

  addTasks(tasks: Task[]): void {
    const data = loadDb();
    data.tasks.push(...tasks);
    saveDb(data);
  },

  updateTask(id: string, updatedFields: Partial<Task>): void {
    const data = loadDb();
    const index = data.tasks.findIndex(t => t.id === id);
    if (index !== -1) {
      data.tasks[index] = { ...data.tasks[index], ...updatedFields };
      saveDb(data);
    }
  },

  deleteTasksByGoal(goalId: string): void {
    const data = loadDb();
    data.tasks = data.tasks.filter(t => t.goalId !== goalId);
    saveDb(data);
  },

  deleteTask(id: string): void {
    const data = loadDb();
    data.tasks = data.tasks.filter(t => t.id !== id);
    saveDb(data);
  },

  // --- AI_OUTPUTS TABLE OPERATIONS ---
  getAIOutputs(goalId?: string): AIOutput[] {
    const data = loadDb();
    if (goalId) {
      return data.ai_outputs.filter(o => o.goalId === goalId);
    }
    return data.ai_outputs;
  },

  getAIOutputByType(goalId: string, type: string): AIOutput | undefined {
    const data = loadDb();
    return data.ai_outputs.find(o => o.goalId === goalId && o.type === type);
  },

  addAIOutput(output: AIOutput): void {
    const data = loadDb();
    // Replace if same type and goalId already exists
    data.ai_outputs = data.ai_outputs.filter(o => !(o.goalId === output.goalId && o.type === output.type));
    data.ai_outputs.push(output);
    saveDb(data);
  },

  deleteAIOutputByType(goalId: string, type: string): void {
    const data = loadDb();
    data.ai_outputs = data.ai_outputs.filter(o => !(o.goalId === goalId && o.type === type));
    saveDb(data);
  }
};

// --- LOCAL METRIC CALCULATIONS ---

// Helper to calculate days remaining dynamically (comparing deadline to current local time)
export function getDaysRemaining(deadlineStr: string): number {
  const today = new Date();
  // Clear hours to compare calendar days
  today.setHours(0, 0, 0, 0);
  const deadline = new Date(deadlineStr);
  deadline.setHours(0, 0, 0, 0);
  
  const diffTime = deadline.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays; // Can be negative if overdue
}

// Helper to calculate calendar days between two dates
export function getDaysBetween(dateStrA: string, dateStrB: string): number {
  const d1 = new Date(dateStrA);
  d1.setHours(0, 0, 0, 0);
  const d2 = new Date(dateStrB);
  d2.setHours(0, 0, 0, 0);
  const diffTime = d2.getTime() - d1.getTime();
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

// Calculate precise metrics for a single goal
export function getGoalMetrics(goal: Goal, tasks: Task[]): GoalMetrics {
  const goalTasks = tasks.filter(t => t.goalId === goal.id);
  const daysRemaining = getDaysRemaining(goal.deadline);
  
  let totalHours = 0;
  let completedHours = 0;
  
  goalTasks.forEach(t => {
    totalHours += t.estimatedHours;
    if (t.completed) {
      completedHours += t.estimatedHours;
    }
  });

  const progressPercentage = totalHours > 0 
    ? Math.round((completedHours / totalHours) * 100) 
    : 0;

  const remainingWorkHours = totalHours - completedHours;
  const effectiveDays = Math.max(1, daysRemaining);
  const requiredDailyHours = parseFloat((remainingWorkHours / effectiveDays).toFixed(1));

  // --- RISK SCORE CALCULATION (Refined dynamic multi-factor algorithm) ---
  // If the goal is 100% complete, risk score is 0
  let riskScore = 0;

  if (progressPercentage < 100) {
    if (daysRemaining < 0) {
      // Overdue and incomplete -> absolute maximum risk
      riskScore = 100;
    } else {
      // 1. CAPACITY / CAPACITY OVERLOAD RISK (Up to 40 pts)
      const capacity = goal.dailyGoalAllocation ?? goal.availableHoursPerDay ?? 2;
      const loadRatio = requiredDailyHours / capacity;
      let loadRisk = 0;
      if (loadRatio <= 1.0) {
        // Linear scale for safe region up to 20 pts
        loadRisk = loadRatio * 20;
      } else {
        // Overload region escalates rapidly up to 40 pts
        loadRisk = Math.min(40, 20 + (loadRatio - 1.0) * 20);
      }

      // 2. TIMELINE ELAPSED & VELOCITY DEFICIT RISK (Up to 30 pts)
      // Calculate total duration in days from creation to deadline
      const goalCreatedAt = goal.createdAt || new Date().toISOString();
      const totalDurationDays = Math.max(1, getDaysBetween(goalCreatedAt, goal.deadline));
      const todayStr = new Date().toISOString();
      const daysElapsed = Math.max(0, getDaysBetween(goalCreatedAt, todayStr));
      const timeRatio = Math.min(1.0, daysElapsed / totalDurationDays);

      // Expected progress should roughly match elapsed timeline ratio
      const expectedProgress = timeRatio;
      const actualProgress = progressPercentage / 100;
      
      let velocityRisk = 0;
      if (actualProgress < expectedProgress) {
        const velocityDeficit = expectedProgress - actualProgress;
        // Severe deficit escalates risk up to 30 pts
        velocityRisk = velocityDeficit * 30;
      }

      // 3. DEADLINE PROXIMITY RISK (Up to 15 pts)
      // Escalates as we get closer to the deadline (especially <= 5 days remaining)
      let proximityRisk = 0;
      if (daysRemaining === 0) {
        proximityRisk = 15; // Due today and incomplete
      } else if (daysRemaining <= 5) {
        // High penalty: escalates based on proximity
        proximityRisk = Math.max(0, (6 - daysRemaining) * 2.5);
      }

      // 4. ABSOLUTE WORK VOLUME RISK (Up to 10 pts)
      // Larger workloads carry higher inherent friction and risk
      const volumeRisk = Math.min(10, remainingWorkHours / 4);

      // Combine base risk scores
      riskScore = loadRisk + velocityRisk + proximityRisk + volumeRisk;

      // 5. PRIORITY STAKE ADJUSTMENT (Scale up or down up to 5% / 10 pts)
      // Adjust risk score depending on priority to reflect higher/lower stakes of failure
      if (goal.priority === 'high') {
        if (actualProgress < expectedProgress || loadRatio > 1.0) {
          riskScore = Math.min(100, riskScore + 8);
        }
      } else if (goal.priority === 'low') {
        riskScore = Math.max(0, riskScore - 5);
      }

      // Final sanitization & rounding
      riskScore = Math.max(0, Math.min(100, Math.round(riskScore)));
    }
  }

  const successProbability = 100 - riskScore;

  let riskLevel: RiskLevelType = 'green';
  if (riskScore >= 70) {
    riskLevel = 'red';
  } else if (riskScore >= 35) {
    riskLevel = 'yellow';
  }

  return {
    goalId: goal.id,
    daysRemaining,
    totalHours,
    completedHours,
    progressPercentage,
    requiredDailyHours,
    riskScore,
    riskLevel,
    successProbability
  };
}

// Calculate overall dashboard stats
export function getDashboardStats(goals: Goal[], tasks: Task[]): DashboardStats {
  const activeGoals = goals;
  let totalTasksCount = 0;
  let completedTasksCount = 0;
  let sumProgress = 0;
  let goalsAtRiskCount = 0;

  activeGoals.forEach(g => {
    const metrics = getGoalMetrics(g, tasks);
    sumProgress += metrics.progressPercentage;
    if (metrics.riskLevel === 'red') {
      goalsAtRiskCount++;
    }
  });

  totalTasksCount = tasks.length;
  completedTasksCount = tasks.filter(t => t.completed).length;

  const averageProgress = activeGoals.length > 0 
    ? Math.round(sumProgress / activeGoals.length) 
    : 0;

  return {
    activeGoalsCount: activeGoals.length,
    goalsAtRiskCount,
    averageProgress,
    totalTasksCount,
    completedTasksCount
  };
}

// Detect Conflicts between goals in the schedule
export function getGoalConflicts(goals: Goal[], tasks: Task[], workspaceCapacity: number = 8.0): GoalConflict[] {
  const conflicts: GoalConflict[] = [];
  const activeMetrics = goals.map(g => ({
    goal: g,
    metrics: getGoalMetrics(g, tasks)
  })).filter(m => m.metrics.progressPercentage < 100);

  if (activeMetrics.length === 0) return [];

  // Conflict 1: Total Allocated Daily Goal Allocations exceed workspace daily available capacity
  const totalAllocated = activeMetrics.reduce((sum, am) => sum + am.goal.dailyGoalAllocation, 0);
  if (totalAllocated > workspaceCapacity) {
    const diff = totalAllocated - workspaceCapacity;
    conflicts.push({
      id: 'conflict-allocation-overflow',
      goalIds: activeMetrics.map(am => am.goal.id),
      goalNames: activeMetrics.map(am => am.goal.name),
      severity: diff > 2.0 ? 'high' : 'medium',
      conflictDescription: `You have allocated ${totalAllocated.toFixed(1)} hours/day across your goals, but your available daily capacity is only ${workspaceCapacity.toFixed(1)} hours/day. Consider reducing allocations or increasing available focus time.`,
      totalRequiredDailyHours: totalAllocated,
      availableDailyHours: workspaceCapacity,
      remedyRecommendation: `You are overcommitted by ${diff.toFixed(1)} hours/day. Reduce the daily goal allocation for one of your goals, or increase your Daily Available Focus Capacity in Workspace Settings.`
    });
  }

  // Conflict 2: Overcommitment of total pacing required daily hours across all active goals
  let totalRequiredDailyHours = 0;
  let totalAllocatedDailyHours = 0;
  const contributingGoalIds: string[] = [];
  const contributingGoalNames: string[] = [];

  activeMetrics.forEach(am => {
    totalRequiredDailyHours += am.metrics.requiredDailyHours;
    totalAllocatedDailyHours += am.goal.dailyGoalAllocation;
    contributingGoalIds.push(am.goal.id);
    contributingGoalNames.push(am.goal.name);
  });

  // Safe daily max for standard productivity is 8 hours
  const peakProductivityCap = 8;

  if (totalRequiredDailyHours > totalAllocatedDailyHours) {
    conflicts.push({
      id: 'conflict-capacity',
      goalIds: contributingGoalIds,
      goalNames: contributingGoalNames,
      severity: totalRequiredDailyHours > peakProductivityCap ? 'high' : 'medium',
      conflictDescription: `Your total active commitments require ${totalRequiredDailyHours.toFixed(1)} hours per day of actual task work, which exceeds your planned allocations of ${totalAllocatedDailyHours.toFixed(1)} hours per day.`,
      totalRequiredDailyHours,
      availableDailyHours: totalAllocatedDailyHours,
      remedyRecommendation: 'De-prioritize one of the goals, mark some tasks complete, or extend the deadlines to spread out the required daily effort.'
    });
  }

  // Conflict 3: Individual goals where required hours per day exceed its allocated available hours
  activeMetrics.forEach(am => {
    if (am.metrics.requiredDailyHours > am.goal.dailyGoalAllocation) {
      const overloadAmount = am.metrics.requiredDailyHours - am.goal.dailyGoalAllocation;
      conflicts.push({
        id: `conflict-overload-${am.goal.id}`,
        goalIds: [am.goal.id],
        goalNames: [am.goal.name],
        severity: overloadAmount > 3 ? 'high' : 'medium',
        conflictDescription: `Goal "${am.goal.name}" requires ${am.metrics.requiredDailyHours.toFixed(1)} hours of daily work, but you only allocated ${am.goal.dailyGoalAllocation} hours per day.`,
        totalRequiredDailyHours: am.metrics.requiredDailyHours,
        availableDailyHours: am.goal.dailyGoalAllocation,
        remedyRecommendation: `Increase the daily allocation for "${am.goal.name}", extend its deadline (current remaining days: ${am.metrics.daysRemaining}), or reduce the task scope.`
      });
    }
  });

  // Conflict 4: Double high-priority overlap with immediate deadlines
  const urgentHighGoals = activeMetrics.filter(am => am.goal.priority === 'high' && am.metrics.daysRemaining <= 4);
  if (urgentHighGoals.length > 1) {
    conflicts.push({
      id: 'conflict-double-urgent',
      goalIds: urgentHighGoals.map(u => u.goal.id),
      goalNames: urgentHighGoals.map(u => u.goal.name),
      severity: 'high',
      conflictDescription: `Critical overlap: You have multiple HIGH priority goals ("${urgentHighGoals.map(u => u.goal.name).join('", "')}") with less than 4 days remaining.`,
      totalRequiredDailyHours: urgentHighGoals.reduce((sum, u) => sum + u.metrics.requiredDailyHours, 0),
      availableDailyHours: urgentHighGoals.reduce((sum, u) => sum + u.goal.dailyGoalAllocation, 0),
      remedyRecommendation: 'Use the Mission Commander panel to isolate the absolute highest-impact single action today and defer other high-priority tasks to the recovery schedule.'
    });
  }

  return conflicts;
}
