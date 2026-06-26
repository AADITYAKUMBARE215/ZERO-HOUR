export type PriorityType = 'low' | 'medium' | 'high';
export type RiskLevelType = 'green' | 'yellow' | 'red';
export type AIOutputType = 'planner' | 'scheduler' | 'risk_analysis' | 'recovery_plan' | 'coach_message' | 'mission_commander';

export interface Goal {
  id: string;
  name: string;
  description: string;
  deadline: string; // YYYY-MM-DD
  priority: PriorityType;
  availableHoursPerDay: number;
  dailyGoalAllocation?: number;
  createdAt: string;
  metrics?: any;
}

export interface Task {
  id: string;
  goalId: string;
  name: string;
  description: string;
  estimatedHours: number;
  completed: boolean;
  milestone: string; // milestone name (e.g., "Milestone 1: Core Setup")
  dueDate: string; // YYYY-MM-DD
}

export interface AIOutput {
  id: string;
  goalId: string;
  type: AIOutputType;
  content: string; // Can be JSON-stringified structure or raw text markdown
  createdAt: string;
}

// Interfaces for structured AI responses parsed on client/server
export interface TaskBreakdownItem {
  name: string;
  description: string;
  estimatedHours: number;
  milestone: string;
  dueDate: string;
}

export interface PlannerResult {
  tasks: TaskBreakdownItem[];
  milestones: string[];
  executionPlanSummary: string;
}

export interface ScheduleSlot {
  time: string;
  taskName: string;
  durationHours: number;
  goalName: string;
}

export interface SchedulerResult {
  daily: ScheduleSlot[];
  weekly: { day: string; tasks: string[] }[];
  schedulerNotes: string;
}

export interface RiskAnalysisResult {
  riskScore: number;
  riskLevel: RiskLevelType;
  successProbability: number;
  whyAtRisk: {
    remainingWork: string;
    remainingTime: string;
    bottlenecks: string[];
    missingMilestones: string[];
  };
}

export interface RecoveryPlanResult {
  reasons: string[];
  actionSteps: string[];
  timelineAdjustments: string;
  coachingEncouragement: string;
}

export interface GoalMetrics {
  goalId: string;
  daysRemaining: number;
  totalHours: number;
  completedHours: number;
  progressPercentage: number;
  requiredDailyHours: number;
  riskScore: number; // 0 - 100
  riskLevel: RiskLevelType; // green, yellow, red
  successProbability: number; // 0 - 100
}

export interface GoalConflict {
  id: string;
  goalIds: string[];
  goalNames: string[];
  severity: 'low' | 'medium' | 'high';
  conflictDescription: string;
  totalRequiredDailyHours: number;
  availableDailyHours: number;
  remedyRecommendation: string;
}

export interface DashboardStats {
  activeGoalsCount: number;
  goalsAtRiskCount: number;
  averageProgress: number;
  totalTasksCount: number;
  completedTasksCount: number;
}
