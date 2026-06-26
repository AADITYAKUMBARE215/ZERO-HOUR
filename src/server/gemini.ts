import { GoogleGenAI, Type } from '@google/genai';
import { PlannerResult, SchedulerResult, RecoveryPlanResult, Goal, Task } from '../types.js';

let aiInstance: GoogleGenAI | null = null;

// Lazy initialization of the GoogleGenAI client to avoid crashes on startup if key is missing
export function getAI(): GoogleGenAI {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        'GEMINI_API_KEY is not defined. Please add your Gemini API key in the Settings > Secrets panel of Google AI Studio.'
      );
    }
    aiInstance = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiInstance;
}

/**
 * Executes a Gemini API function with built-in retry logic (exponential backoff)
 * and automatic fallback to a lighter model in case of transient 503 "Service Unavailable"
 * or other high demand / overload errors.
 */
async function callGeminiWithRetry<T>(
  apiCall: (modelName: string) => Promise<T>,
  preferredModel: string = 'gemini-3.5-flash',
  fallbackModel: string = 'gemini-3.1-flash-lite'
): Promise<T> {
  let lastError: any = null;
  const modelsToTry = [preferredModel, fallbackModel];

  for (const model of modelsToTry) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        return await apiCall(model);
      } catch (err: any) {
        lastError = err;

        const isQuotaExceeded = 
          err.status === 429 || 
          (err.message && (
            err.message.includes('429') || 
            err.message.includes('Quota exceeded') || 
            err.message.includes('Resource has been exhausted') ||
            err.message.includes('quota')
          ));

        const isTransient = 
          err.status === 503 || 
          (err.message && (
            err.message.includes('503') || 
            err.message.includes('UNAVAILABLE') || 
            err.message.includes('high demand') ||
            err.message.includes('temporary') ||
            err.message.includes('service is currently unavailable')
          ));

        if (isQuotaExceeded || isTransient) {
          console.log(`Gemini rate-limit or high-demand (${err.status || '503/429'}) encountered for model ${model}. Switching to next model...`);
          break; // Break the attempt loop immediately to try the next model
        }

        // For other potential issues (e.g. timeout, network glitch), do a normal retry
        console.log(`Gemini call failed with model ${model} (attempt ${attempt}/3). Retrying...`, err.message || err);
        const delay = Math.pow(2, attempt) * 500; // 1000ms, 2000ms, 4000ms
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error('Gemini API call failed after multiple retry attempts and model fallback.');
}

// 1. Planner Agent: Generate Task Breakdown, Milestones, and an Execution Plan
export async function generatePlanner(
  goalName: string,
  description: string,
  deadline: string,
  priority: string,
  availableHoursPerDay: number
): Promise<PlannerResult> {
  try {
    const ai = getAI();
    const prompt = `You are the Planner Agent of ZERO HOUR, a high-intensity productivity system.
Break down this goal into a realistic, sequential step-by-step task execution plan:
- Goal: "${goalName}"
- Description: "${description}"
- Target Deadline: ${deadline}
- Priority: ${priority}
- Daily Work Capacity: ${availableHoursPerDay} hours/day

Create 4 to 8 concrete tasks. For each task, estimate realistic hours (make sure the total estimated hours across all tasks is achievable within the deadline and daily capacity). Group these tasks into 2 to 4 major high-level milestones. Provide a brief high-level execution summary.
`;

    return await callGeminiWithRetry(async (modelName) => {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          systemInstruction: 'You are an elite productivity planner that creates practical, structured, zero-fluff execution plans.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              tasks: {
                type: Type.ARRAY,
                description: 'The step-by-step task breakdown',
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING, description: 'Task title, action-oriented (e.g. Write core routing tests)' },
                    description: { type: Type.STRING, description: 'Quick detail on what needs to be done' },
                    estimatedHours: { type: Type.NUMBER, description: 'Estimated hours to complete (between 1 and 12)' },
                    milestone: { type: Type.STRING, description: 'The milestone this task belongs to (e.g. Milestone 1: Core Setup)' },
                    dueDate: { type: Type.STRING, description: 'Recommended target completion date (YYYY-MM-DD)' }
                  },
                  required: ['name', 'description', 'estimatedHours', 'milestone', 'dueDate']
                }
              },
              milestones: {
                type: Type.ARRAY,
                description: 'High-level phases/milestones of the plan in chronological order',
                items: { type: Type.STRING }
              },
              executionPlanSummary: {
                type: Type.STRING,
                description: 'Strategic commander advice on how to execute this plan under time constraints'
              }
            },
            required: ['tasks', 'milestones', 'executionPlanSummary']
          }
        }
      });

      const text = response.text;
      if (!text) {
        throw new Error('Planner Agent failed to generate content');
      }
      return JSON.parse(text) as PlannerResult;
    });
  } catch (err: any) {
    console.log('Gemini generatePlanner failed or key is missing. Deploying local execution plan fallback...', err.message || err);
    return getLocalPlannerFallback(goalName, description, deadline, priority, availableHoursPerDay);
  }
}

// 2. Scheduler Agent: Generate Daily & Weekly Schedule slots
export async function generateScheduler(
  goalName: string,
  tasks: { name: string; estimatedHours: number }[],
  availableHoursPerDay: number
): Promise<SchedulerResult> {
  try {
    const ai = getAI();
    const tasksListStr = tasks.map(t => `- ${t.name} (Estimated: ${t.estimatedHours} hours)`).join('\n');
    const prompt = `You are the Scheduler Agent of ZERO HOUR.
Map the following pending tasks for goal "${goalName}" into a daily and weekly timeline based on an available daily capacity of ${availableHoursPerDay} hours/day.

Pending Tasks:
${tasksListStr}

Generate:
1. Daily schedule: allocate specific time blocks (e.g., "09:00 - 11:00", "14:00 - 15:00") for today's focus tasks.
2. Weekly breakdown: schedule which tasks should be tackled on which day of the week (Monday through Sunday).
3. Strategic scheduler notes.
`;

    return await callGeminiWithRetry(async (modelName) => {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          systemInstruction: 'You are a scheduling intelligence agent that optimizes time blocks to prevent overload and maximize momentum.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              daily: {
                type: Type.ARRAY,
                description: 'Optimized hour-by-hour schedule slots for today',
                items: {
                  type: Type.OBJECT,
                  properties: {
                    time: { type: Type.STRING, description: 'Time range, e.g. 08:00 - 10:00' },
                    taskName: { type: Type.STRING, description: 'Task name' },
                    durationHours: { type: Type.NUMBER, description: 'Duration allocated in hours' },
                    goalName: { type: Type.STRING, description: 'The goal this belongs to' }
                  },
                  required: ['time', 'taskName', 'durationHours', 'goalName']
                }
              },
              weekly: {
                type: Type.ARRAY,
                description: 'Day-by-day task mapping for the upcoming week',
                items: {
                  type: Type.OBJECT,
                  properties: {
                    day: { type: Type.STRING, description: 'Day name (e.g. Monday)' },
                    tasks: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING }
                    }
                  },
                  required: ['day', 'tasks']
                }
              },
              schedulerNotes: {
                type: Type.STRING,
                description: 'Tips for staying on schedule and managing energy blocks'
              }
            },
            required: ['daily', 'weekly', 'schedulerNotes']
          }
        }
      });

      const text = response.text;
      if (!text) {
        throw new Error('Scheduler Agent failed to generate schedule');
      }
      return JSON.parse(text) as SchedulerResult;
    });
  } catch (err: any) {
    console.log('Gemini generateScheduler failed or key is missing. Deploying local schedule generator fallback...', err.message || err);
    return getLocalSchedulerFallback(goalName, tasks, availableHoursPerDay);
  }
}

// Helper to parse dates and calculate days between them
function getDaysBetweenDatesLocal(dateStrA: string, dateStrB: string): number {
  const d1 = new Date(dateStrA);
  d1.setHours(0, 0, 0, 0);
  const d2 = new Date(dateStrB);
  d2.setHours(0, 0, 0, 0);
  const diffTime = d2.getTime() - d1.getTime();
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

// 3. Why Am I At Risk: Detailed markdown explanation combining metrics and AI reasoning
export async function generateRiskExplanation(
  goal: Goal,
  metrics: {
    daysRemaining: number;
    totalHours: number;
    completedHours: number;
    progressPercentage: number;
    requiredDailyHours: number;
    riskScore: number;
    riskLevel: string;
    successProbability: number;
  },
  completedTasks: Task[],
  pendingTasks: Task[]
): Promise<string> {
  try {
    const ai = getAI();
    
    // Calculate custom PM risk metrics
    const todayStr = new Date().toISOString();
    const totalDurationDays = Math.max(1, getDaysBetweenDatesLocal(goal.createdAt, goal.deadline));
    const daysElapsed = Math.max(0, getDaysBetweenDatesLocal(goal.createdAt, todayStr));
    const expectedProgress = Math.min(100, Math.max(0, Math.round((daysElapsed / totalDurationDays) * 100)));
    const progressDeficit = Math.max(0, expectedProgress - metrics.progressPercentage);
    
    const remainingHours = metrics.totalHours - metrics.completedHours;
    const totalAvailableCapacity = goal.availableHoursPerDay * Math.max(0, metrics.daysRemaining);
    const capacityDeficit = parseFloat((metrics.requiredDailyHours - goal.availableHoursPerDay).toFixed(1));

    // Overdue tasks
    const overdueTasks = pendingTasks.filter(t => {
      if (!t.dueDate) return false;
      return getDaysBetweenDatesLocal(t.dueDate, todayStr) > 0;
    });
    const uniqueMissedMilestones = Array.from(new Set(overdueTasks.map(t => t.milestone).filter(Boolean)));

    const prompt = `You are an elite, battle-tested project manager and risk control officer.
Your task is to analyze the execution health of the goal "${goal.name}" and provide an unvarnished, highly realistic, and expert-level Risk Assessment Report.

Core Objective:
Diagnose project health precisely, detail mathematical gaps, list real bottlenecks, and offer highly practical recommendations.

Goal Metadata & Dynamic Risk Inputs:
- **Priority Stakes**: ${goal.priority.toUpperCase()} Priority Commitment
- **Available Daily Capacity**: ${goal.availableHoursPerDay} hours/day
- **Timeline Budget**: Created on ${goal.createdAt.split('T')[0]}, Target Deadline is ${goal.deadline} (${metrics.daysRemaining} days remaining)
- **Workload vs Capacity**:
  - Total Estimated Work: ${metrics.totalHours} hours
  - Completed Work: ${metrics.completedHours} hours
  - Remaining Work: ${remainingHours} hours
  - Total Leftover Capacity: ${totalAvailableCapacity} hours total
  - Required Daily Velocity: ${metrics.requiredDailyHours} hours/day needed to meet target
  - Capacity Balance: ${capacityDeficit > 0 ? `DEFICIT of ${capacityDeficit} hours/day` : `SURPLUS of ${Math.abs(capacityDeficit)} hours/day`}
- **Timeline Progress & Deficit**:
  - Current Project Age: ${daysElapsed} days elapsed out of ${totalDurationDays} days total duration
  - Expected Progress at this point: ${expectedProgress}%
  - Actual Progress: ${metrics.progressPercentage}%
  - Velocity Deficit: ${progressDeficit}% behind schedule
- **Missed Milestones / Overdue items**:
  - Overdue Pending Tasks: ${overdueTasks.length} tasks are past their due dates
  - Overdue Milestones: ${uniqueMissedMilestones.join(', ') || 'None'}
- **Current System Assessment**:
  - Risk Score: ${metrics.riskScore}/100
  - Risk Level: ${metrics.riskLevel.toUpperCase()}
  - Success Probability: ${metrics.successProbability}%

Pending Backlog Items:
${pendingTasks.map(t => `- "${t.name}" [Hours: ${t.estimatedHours}h, Milestone: "${t.milestone || 'General'}", Due: ${t.dueDate || 'No due date'}]`).join('\n') || 'None'}

Completed Backlog Items:
${completedTasks.map(t => `- "${t.name}" [Hours: ${t.estimatedHours}h, Milestone: "${t.milestone || 'General'}]`).join('\n') || 'None'}

Structure your response EXACTLY with these 4 markdown sections. Write like an experienced project leader—urgent, logical, mathematically precise, and commanding:

### 1. Key Problems
[Write a professional, highly specific assessment of the key problems. Incorporate:
- Capacity Balance: Compare remaining work (${remainingHours} hours) against available daily capacity (${goal.availableHoursPerDay} hours/day) and detail the deficit.
- Velocity Gap: Address how the actual progress (${metrics.progressPercentage}%) compares with the expected progress (${expectedProgress}%) for this point in time.
- Overdue Milestones: Specify any missed milestones or overdue tasks and how they increase risk.
- Priority & Deadline Pressure: Assess the combined pressure of a ${metrics.daysRemaining}-day remaining timeline on a ${goal.priority.toUpperCase()} priority commitment.]

### 2. Root Causes
[Detail why execution is lagging. Address:
- Initial scheduling bottlenecks (specific heavy tasks blocking downstream progress).
- Capacity underestimation or lack of execution discipline.
- Priority dilution or task-switching overload.]

### 3. Immediate Actions
[List 3-4 highly actionable, urgent, concrete steps to execute in the next 24-48 hours. Focus on:
- Eliminating current bottlenecks (which specific tasks to target).
- Buffering daily focus hours.
- Direct path to reduce risk score and increase success probability.]

### 4. Long-Term Recommendations
[List 3-4 strategic recommendations for the remainder of this goal. Focus on:
- Best practices in planning, task sizing, and scheduling.
- Milestone pacing and discipline.
- Sustainable resource/capacity management to avoid burnout.]

Maintain an extremely professional, expert tone. Avoid introductory remarks, generic placeholders, or meta-commentary. Start directly with the headings.
`;

    return await callGeminiWithRetry(async (modelName) => {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          systemInstruction: 'You are an experienced, elite project manager who analyzes execution risks with absolute realism and zero fluff.'
        }
      });

      return response.text || 'Failed to analyze risk factors.';
    });
  } catch (err: any) {
    console.log('Gemini generateRiskExplanation failed or key is missing. Deploying local risk analysis fallback...', err.message || err);
    return getLocalRiskExplanationFallback(goal, metrics, completedTasks, pendingTasks);
  }
}

// 4. Mission Commander: Determine the single highest-impact action for today
export async function generateMissionCommander(
  activeGoalsBrief: { 
    id: string;
    name: string; 
    priority: string; 
    daysRemaining: number; 
    requiredDailyHours: number; 
    riskScore: number;
    riskLevel: string;
    progressPercentage: number;
    successProbability: number;
  }[],
  pendingTasksBrief: { 
    name: string; 
    description: string;
    goalName: string; 
    goalId: string;
    estimatedHours: number; 
    milestone: string;
    dueDate: string;
    goalPriority: string;
    goalRiskScore: number;
    goalSuccessProbability: number;
  }[]
): Promise<string> {
  try {
    const ai = getAI();
    const goalsStr = activeGoalsBrief.map(g => 
      `- **${g.name}** [ID: ${g.id}]: Priority: ${g.priority.toUpperCase()}, Days left: ${g.daysRemaining}, Risk Score: ${g.riskScore}/100 (${g.riskLevel}), Progress: ${g.progressPercentage}%, Success Prob: ${g.successProbability}%, Required Daily Effort: ${g.requiredDailyHours}h/day`
    ).join('\n');
    
    const tasksStr = pendingTasksBrief.map(t => 
      `- "${t.name}" (Estimate: ${t.estimatedHours}h) for Goal "${t.goalName}" [Goal ID: ${t.goalId}, Milestone: "${t.milestone}", Target Due: ${t.dueDate}, Goal Priority: ${t.goalPriority.toUpperCase()}, Goal Risk Score: ${t.goalRiskScore}/100, Goal Success Prob: ${t.goalSuccessProbability}%]`
    ).join('\n');

    const prompt = `You are the MISSION COMMANDER of ZERO HOUR.
Your objective is to cut through the noise, overwhelm, and panic, and issue a SINGLE, authoritative, absolute highest-impact tactical directive for today.

Your selection of today's mission MUST be logically determined by evaluating the following critical factors:
1. **Risk Score**: Prioritize tasks for goals with higher risk scores.
2. **Deadline Proximity**: Prioritize tasks with imminent due dates and goals with fewer days remaining.
3. **Task Dependencies**: Honor chronological progression (e.g., tasks in Milestone 1 must precede Milestone 2, earlier due dates unlock later phases).
4. **Progress Percentage**: Consider how far behind a goal is relative to its elapsed timeline.
5. **Goal Priority**: High-priority commitments demand attention before low-priority ones.
6. **Expected Impact on Success Probability**: Prioritize tasks that mathematically reduce the required daily effort (hours/day) of high-stakes goals the most.

Active Commitments:
${goalsStr}

Available Actions:
${tasksStr || 'No pending tasks found.'}

Determine which SINGLE task is the bottleneck breaker. Your output MUST be in markdown format.

Structure your markdown output EXACTLY like this:

# TODAY'S TACTICAL DIRECTIVE: [Task Name] (Goal: [Goal Name])

### 1. WHY THIS MISSION WAS CHOSEN
[Provide a clear, analytical justification detailing how this task was selected using the priority, risk score, and deadline proximity factors.]

### 2. WHAT RISK IT REDUCES
[Detail how completing this specific estimated-hour task reduces daily workload, alleviates capacity overload, and brings down the goal's risk score.]

### 3. WHAT FUTURE TASKS IT UNLOCKS
[Explain the logical dependency path. Describe how finishing this milestone/precursor task unlocks subsequent project phases.]

### 4. HOW IT IMPROVES SUCCESS PROBABILITY
[Explain the expected impact on success probability. Show how this execution boosts the current success probability from its current % toward green, recovering momentum.]

### COMMANDER'S TACTICAL INTEL
[2-3 sentences of exact, specific advice on how to lock in and get this done with zero distractions.]

### CONSEQUENCE OF FAILURE
[One chilling, motivating sentence about what happens if this is deferred today.]

Make it extremely focused, sharp, and commanding. Use high-contrast headings. Do not output anything other than the markdown text.
`;

    return await callGeminiWithRetry(async (modelName) => {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          systemInstruction: 'You are a seasoned battle commander of execution. You eliminate multitasking and force laser-focus on the primary bottleneck.'
        }
      });

      return response.text || 'Commander is offline. Select your highest priority task and execute.';
    });
  } catch (err: any) {
    console.log('Gemini generateMissionCommander failed or key is missing. Deploying local mission commander fallback...', err.message || err);
    return getLocalMissionCommanderFallback(activeGoalsBrief, pendingTasksBrief);
  }
}

// 5. Recovery Planner: Generate recovery plans when users fall behind
export async function generateRecoveryPlan(
  goal: Goal,
  metrics: {
    daysRemaining: number;
    totalHours: number;
    completedHours: number;
    progressPercentage: number;
    requiredDailyHours: number;
    riskScore: number;
    riskLevel: string;
    successProbability: number;
  },
  pendingTasks: Task[]
): Promise<RecoveryPlanResult> {
  try {
    const ai = getAI();
    
    // Compute PM values for prompt context
    const todayStr = new Date().toISOString();
    const totalDurationDays = Math.max(1, getDaysBetweenDatesLocal(goal.createdAt, goal.deadline));
    const daysElapsed = Math.max(0, getDaysBetweenDatesLocal(goal.createdAt, todayStr));
    const expectedProgress = Math.min(100, Math.max(0, Math.round((daysElapsed / totalDurationDays) * 100)));
    const progressDeficit = Math.max(0, expectedProgress - metrics.progressPercentage);
    
    const remainingHours = metrics.totalHours - metrics.completedHours;
    const totalAvailableCapacity = goal.availableHoursPerDay * Math.max(0, metrics.daysRemaining);
    const capacityDeficit = parseFloat((metrics.requiredDailyHours - goal.availableHoursPerDay).toFixed(1));

    const prompt = `You are an elite project manager and turnaround crisis control officer.
Create a comprehensive recovery assessment for the lagging goal "${goal.name}". You must generate exactly 3 recovery strategies: Plan A, Plan B, and Plan C.

Goal Metadata & Dynamic Risk Inputs:
- **Priority Stakes**: ${goal.priority.toUpperCase()} Priority Commitment
- **Available Daily Capacity**: ${goal.availableHoursPerDay} hours/day
- **Timeline Budget**: Created on ${goal.createdAt.split('T')[0]}, Target Deadline is ${goal.deadline} (${metrics.daysRemaining} days remaining)
- **Workload vs Capacity**:
  - Total Estimated Work: ${metrics.totalHours} hours
  - Completed Work: ${metrics.completedHours} hours
  - Remaining Work: ${remainingHours} hours
  - Total Leftover Capacity: ${totalAvailableCapacity} hours total
  - Required Daily Velocity: ${metrics.requiredDailyHours} hours/day needed to meet target
  - Capacity Balance: ${capacityDeficit > 0 ? `DEFICIT of ${capacityDeficit} hours/day` : `SURPLUS of ${Math.abs(capacityDeficit)} hours/day`}
- **Timeline Progress & Deficit**:
  - Expected Progress at this stage: ${expectedProgress}%
  - Actual Progress: ${metrics.progressPercentage}%
  - Velocity Deficit: ${progressDeficit}% behind schedule
- **Current System Assessment**:
  - Risk Score: ${metrics.riskScore}/100
  - Success Probability: ${metrics.successProbability}%

Pending Backlog Items:
${pendingTasks.map(t => `- "${t.name}" [Hours: ${t.estimatedHours}h, Milestone: "${t.milestone || 'General'}", Due: ${t.dueDate || 'No due date'}]`).join('\n') || 'None'}

Provide:
1. "reasons": Array of strings (3-4 points) detailing why execution lagged, referencing remaining work vs capacity, progress deficits, missed milestones, and deadline pressure.
2. "timelineAdjustments": A professional advice text block on strategic scope management, milestone discipline, and timeline adjustments.
3. "actionSteps": An array of EXACTLY 3 strings, each representing a distinct recovery strategy:
   - Element 1 (Plan A: Balanced Recovery):
     "PLAN A: BALANCED RECOVERY (Moderate Increase & Sustainable)
• Required Daily Hours: [Calculated moderate hours, e.g. 15-20% boost from normal available capacity, but lower than full required velocity] hours/day
• Expected Success Probability: [Estimated value, e.g. 70-80%]
• Trade-offs: [Pros & cons - e.g. sustainable, avoids cognitive fatigue, but extends timeline slightly or leaves low margin for future delays]
• Recommended User Type: [Who this suits, e.g. consistent performers seeking sustainable daily work]
[Add a paragraph describing the strategic approach to balanced recovery.]"

   - Element 2 (Plan B: Aggressive Recovery):
     "PLAN B: AGGRESSIVE RECOVERY (Maximum Effort & Peak Velocity)
• Required Daily Hours: ${metrics.requiredDailyHours.toFixed(1)} hours/day (Full velocity required to meet original target)
• Expected Success Probability: [Estimated value, e.g. 90-95%]
• Trade-offs: [Pros & cons - e.g. intense pressure, high burnout hazard, but guarantees zero-compromise timeline delivery]
• Recommended User Type: [Who this suits, e.g. high-intensity sprinters comfortable under tight crunch periods]
[Add a paragraph describing the strategic approach to aggressive recovery.]"

   - Element 3 (Plan C: Scope Reduction):
     "PLAN C: SCOPE REDUCTION (Trim Non-Essentials & Protect Deadline)
• Required Daily Hours: ${goal.availableHoursPerDay.toFixed(1)} hours/day (Comfortable original pace)
• Expected Success Probability: [Estimated value, e.g. 80-85%] for MVP
• Trade-offs: [Pros & cons - e.g. eliminates fatigue completely, but requires actively postponing or dropping non-essential features/milestones]
• Recommended User Type: [Who this suits, e.g. pragmatists and busy users prioritizing deadline completion over absolute completeness]
[Add a paragraph describing the strategic approach to trimming and focusing on MVP execution.]"

4. "coachingEncouragement": A motivating project manager rally cry to re-engage right now.
`;

    return await callGeminiWithRetry(async (modelName) => {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          systemInstruction: 'You are an experienced, elite project manager who creates multi-pronged recovery plans with absolute realism and tactical detail.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              reasons: {
                type: Type.ARRAY,
                description: 'Why the schedule derailed or hit a bottleneck',
                items: { type: Type.STRING }
              },
              actionSteps: {
                type: Type.ARRAY,
                description: 'Three recovery plans: Plan A, Plan B, and Plan C',
                items: { type: Type.STRING }
              },
              timelineAdjustments: {
                type: Type.STRING,
                description: 'Advice on scoping, trimming non-essentials, or shuffling dates'
              },
              coachingEncouragement: {
                type: Type.STRING,
                description: 'Direct, inspiring rallying cry to break the freeze'
              }
            },
            required: ['reasons', 'actionSteps', 'timelineAdjustments', 'coachingEncouragement']
          }
        }
      });

      const text = response.text;
      if (!text) {
        throw new Error('Recovery Planner failed to generate plan');
      }
      return JSON.parse(text) as RecoveryPlanResult;
    });
  } catch (err: any) {
    console.log('Gemini generateRecoveryPlan failed or key is missing. Deploying local recovery plan fallback...', err.message || err);
    return getLocalRecoveryPlanFallback(goal, metrics, pendingTasks);
  }
}

// 6. Daily Coach: Personalized guidance and accountability messages
export async function generateCoachMessage(
  activeGoalsBrief: {
    name: string;
    progressPercentage: number;
    riskLevel: string;
    riskScore: number;
    requiredDailyHours: number;
    priority: string;
    daysRemaining: number;
    totalHours: number;
    completedHours: number;
    deadline: string;
  }[],
  overallCompletedTasksCount: number,
  overallPendingTasksCount: number
): Promise<string> {
  try {
    const ai = getAI();
    
    const goalsSummary = activeGoalsBrief.length > 0
      ? activeGoalsBrief.map(g => `- Goal: "${g.name}"
  - Priority Stakes: ${g.priority.toUpperCase()} Priority
  - Actual Progress: ${g.progressPercentage}%
  - Risk Level: ${g.riskLevel.toUpperCase()} (Score: ${g.riskScore}/100)
  - Remaining Time: ${g.daysRemaining} days remaining (Target: ${g.deadline})
  - Required Velocity: ${g.requiredDailyHours} hours/day (Total work: ${g.totalHours}h, Completed: ${g.completedHours}h)`).join('\n\n')
      : 'No active goals registered.';

    const totalTasks = overallCompletedTasksCount + overallPendingTasksCount;
    const completionRate = totalTasks > 0 ? Math.round((overallCompletedTasksCount / totalTasks) * 100) : 0;
    
    let completionTrendDescription = 'No task history is available yet.';
    if (totalTasks > 0) {
      if (completionRate > 80) {
        completionTrendDescription = `Highly accelerated completion rate (${completionRate}% overall tasks finished). The user has strong execution momentum.`;
      } else if (completionRate > 50) {
        completionTrendDescription = `Moderate steady completion rate (${completionRate}% overall tasks finished). The user is active but has a looming backlog.`;
      } else {
        completionTrendDescription = `Low completion rate (${completionRate}% overall tasks finished). Sizable backlog accumulation and low execution frequency, risking freeze-state inertia.`;
      }
    }

    const prompt = `You are the Daily Coach of ZERO HOUR, an elite project-turnaround mentor, crisis officer, and strategic productivity master.
Your style is direct, deeply psychological, realistic, and inspired by top-tier project management and high-performance focus mechanics. You are NOT a generic, cheerleading chatbot. You talk like an experienced, highly supportive but zero-fluff mentor who wants the user to succeed on their high-stakes goals.

Review this user's current execution board and generate a custom daily accountability debrief.

Active Goals State:
${goalsSummary}

Board-Level Stats & Completion Trends:
- Tasks Completed: ${overallCompletedTasksCount}
- Tasks Remaining: ${overallPendingTasksCount}
- Overall Task Completion Trend: ${completionTrendDescription}

You MUST structure your response with clean Markdown. Your response MUST contain exactly these four distinct sections:

### 1. Current Situation
[An analytical, high-fidelity synthesis of where the user actually stands today. Assess their risk profile (Low Risk: <35, Medium Risk: 35-69, High Risk: 70+). Urgency level must match:
 - Low Risk: Reinforce momentum, praise discipline, but warn that comfort breeds complacency.
 - Medium Risk: Raise urgency immediately. Point out where buffers are decaying and suggest focus block structures.
 - High Risk: Direct, unfiltered tough-love accountability. Address the overwhelm/freeze loop, strip excuses, and demand rapid corrective action.
Address them professionally as their mentor.]

### 2. What Is Going Well
[A precise analysis of what is working. Point out which goals show stable velocities, consistent completion counts, or healthy scheduling. Avoid superficial praise—focus on the discipline of the system.]

### 3. What Needs Attention
[Identify the single highest exposure point. Call out capacity overloads, milestone delays, priority conflicts, or looming deadlines with the exact metrics provided.]

### 4. One Action To Take Today
[A singular, ultra-concrete, highly tactical task or focus block lockdown they can execute in the next 60 minutes. End this section with a short, bold, memorable "Zero Hour Axiom" (e.g. **Zero Hour Axiom**: *Quote here*).]

Keep it motivating, psychological, professional, and razor-sharp.
`;

    return await callGeminiWithRetry(async (modelName) => {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          systemInstruction: 'You are a elite productivity coach, specializing in turning near-failure projects into swift, streamlined execution victories. Always include all 4 required sections.'
        }
      });

      return response.text || 'Daily Coach is offline. Take action now. Clarity comes from execution.';
    });
  } catch (err: any) {
    console.log('Gemini generateCoachMessage failed or key is missing. Deploying local daily coach fallback...', err.message || err);
    return getLocalCoachMessageFallback(activeGoalsBrief, overallCompletedTasksCount, overallPendingTasksCount);
  }
}

// ==========================================
// HIGH-QUALITY LOCAL HEURISTIC FALLBACKS
// ==========================================

function getLocalPlannerFallback(
  goalName: string,
  description: string,
  deadline: string,
  priority: string,
  availableHoursPerDay: number
): PlannerResult {
  const milestones = [
    'Milestone 1: Foundations & Initial Parameters',
    'Milestone 2: High-Density Core Development',
    'Milestone 3: Deep Audits, Testing & Edge Cases',
    'Milestone 4: Final Polishing & Verification'
  ];

  const tasks = [
    {
      name: `Core Architecture Setup for ${goalName}`,
      description: `Formulate basic structures, resolve initial dependencies, and create the staging workflow for: ${description || goalName}`,
      estimatedHours: Math.min(availableHoursPerDay * 2, 4),
      milestone: milestones[0],
      dueDate: new Date(Date.now() + 2 * 24 * 3600000).toISOString().split('T')[0]
    },
    {
      name: `High-Friction Core Assembly`,
      description: `Build out the main functionality, data pipelines, and interfaces required for "${goalName}".`,
      estimatedHours: Math.min(availableHoursPerDay * 3, 8),
      milestone: milestones[1],
      dueDate: new Date(Date.now() + 5 * 24 * 3600000).toISOString().split('T')[0]
    },
    {
      name: `Integrations & Security Audits`,
      description: `Run system diagnostics, ensure complete validation coverage, and eliminate functional leaks.`,
      estimatedHours: Math.min(availableHoursPerDay * 1.5, 3),
      milestone: milestones[2],
      dueDate: new Date(Date.now() + 7 * 24 * 3600000).toISOString().split('T')[0]
    },
    {
      name: `Release Locking & Documentation`,
      description: `Verify build production integrity, finalize readme blueprints, and log the initial version milestone.`,
      estimatedHours: Math.min(availableHoursPerDay * 1, 2),
      milestone: milestones[3],
      dueDate: deadline
    }
  ];

  return {
    tasks,
    milestones,
    executionPlanSummary: `Zero Hour Local Planner initialized. A streamlined 4-stage operational pathway has been laid out to fit your capacity constraint of ${availableHoursPerDay}h/day, eliminating cognitive overhead and maximizing your execution velocity.`
  };
}

function getLocalSchedulerFallback(
  goalName: string,
  tasks: { name: string; estimatedHours: number }[],
  availableHoursPerDay: number
): SchedulerResult {
  const daily = tasks.slice(0, 2).map((t, idx) => {
    const startHour = 9 + idx * 3;
    const duration = Math.min(t.estimatedHours, availableHoursPerDay);
    const endHour = startHour + duration;
    const pad = (h: number) => String(h).padStart(2, '0');
    return {
      time: `${pad(startHour)}:00 - ${pad(endHour)}:00`,
      taskName: t.name,
      durationHours: duration,
      goalName
    };
  });

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const weekly = days.map((day, idx) => {
    const assignedTasks = tasks[idx % tasks.length] ? [tasks[idx % tasks.length].name] : ['Conduct weekly progress audit'];
    return { day, tasks: assignedTasks };
  });

  return {
    daily,
    weekly,
    schedulerNotes: `Time blocks are structured to prevent cognitive fatigue. Protect your high-energy morning blocks and schedule single-task deep focus sessions of 50 minutes.`
  };
}

function getLocalRiskExplanationFallback(
  goal: Goal,
  metrics: {
    daysRemaining: number;
    totalHours: number;
    completedHours: number;
    progressPercentage: number;
    requiredDailyHours: number;
    riskScore: number;
    riskLevel: string;
    successProbability: number;
  },
  completedTasks: Task[],
  pendingTasks: Task[]
): string {
  const todayStr = new Date().toISOString();
  const totalDurationDays = Math.max(1, getDaysBetweenDatesLocal(goal.createdAt, goal.deadline));
  const daysElapsed = Math.max(0, getDaysBetweenDatesLocal(goal.createdAt, todayStr));
  const expectedProgress = Math.min(100, Math.max(0, Math.round((daysElapsed / totalDurationDays) * 100)));
  const progressDeficit = Math.max(0, expectedProgress - metrics.progressPercentage);
  
  const remainingHours = metrics.totalHours - metrics.completedHours;
  const totalAvailableCapacity = goal.availableHoursPerDay * Math.max(0, metrics.daysRemaining);
  const capacityDeficit = parseFloat((metrics.requiredDailyHours - goal.availableHoursPerDay).toFixed(1));

  const overdueTasks = pendingTasks.filter(t => {
    if (!t.dueDate) return false;
    return getDaysBetweenDatesLocal(t.dueDate, todayStr) > 0;
  });
  const uniqueMissedMilestones = Array.from(new Set(overdueTasks.map(t => t.milestone).filter(Boolean)));
  const missedMilestonesStr = uniqueMissedMilestones.join(', ') || 'None';

  const heavyBottlenecks = pendingTasks
    .filter(t => t.estimatedHours >= 3)
    .slice(0, 2)
    .map(t => `"${t.name}" (${t.estimatedHours} hours)`)
    .join(' and ');

  const topTaskName = pendingTasks[0] ? `"${pendingTasks[0].name}"` : 'your primary pending task';

  return `# PROJECT RISK ASSESSMENT REPORT: ${goal.name.toUpperCase()}
**Risk Assessment Index**: ${metrics.riskScore}/100 (${metrics.riskLevel.toUpperCase()}) | **Success Probability**: ${metrics.successProbability}% | **Priority**: ${goal.priority.toUpperCase()}

### 1. Key Problems
* **Capacity Overload**: The remaining workload of **${remainingHours} hours** exceeds your sustainable available capacity of **${goal.availableHoursPerDay} hours/day** over the remaining **${metrics.daysRemaining} days** (total remaining capacity of **${totalAvailableCapacity} hours**). This has pushed your required velocity to **${metrics.requiredDailyHours.toFixed(1)} hours/day**, representing a net daily capacity deficit of **${capacityDeficit > 0 ? `${capacityDeficit} hours/day` : '0 hours/day (highly constrained)'}**.
* **Progress vs. Expected Timeline**: You have completed **${metrics.progressPercentage}%** of the work, whereas you should ideally be at **${expectedProgress}%** progress based on the ${daysElapsed} days elapsed out of ${totalDurationDays} total timeline days. This leaves you with a critical velocity deficit of **${progressDeficit}%**.
* **Missed Milestones**: There are **${overdueTasks.length}** pending tasks currently overdue. Key milestones that have slipped include: *${missedMilestonesStr !== 'None' ? missedMilestonesStr : 'No milestones have slipped completely, but critical path items are experiencing schedule drift'}*.
* **Deadline Pressure**: With only **${metrics.daysRemaining} days remaining**, deadline proximity is triggering a severe bottleneck, creating substantial pressure on this **${goal.priority.toUpperCase()}** priority commitment.

### 2. Root Causes
* **Initial Estimation Optimism**: Task sizing did not account for realistic complexity and debugging overhead, resulting in an immediate capacity deficit as deadlines near.
* **Schedule Bottlenecks**: High-weight tasks like ${heavyBottlenecks || 'unsorted backlog tasks'} are blocking downstream dependent items, causing task paralysis.
* **Capacity Underestimation**: The daily budget of **${goal.availableHoursPerDay} hours/day** is insufficient to digest the remaining workload without active intervention.

### 3. Immediate Actions
1. **Critical Path Isolation**: Allocate your very next focus block exclusively to resolving the primary bottleneck task: ${topTaskName}. Do not switch tasks until complete.
2. **Temporary Capacity Boost**: Artificially inflate available capacity from **${goal.availableHoursPerDay}h/day** to **${metrics.requiredDailyHours.toFixed(1)}h/day** for the next 48 hours to clear overdue items.
3. **Milestone Focus**: Halt all work on future milestones until overdue items in *"${pendingTasks[0]?.milestone || 'current milestone'}"* are fully closed out.

### 4. Long-Term Recommendations
* **Build Task Estimation Buffers**: Shift to a conservative estimation strategy—inflate future estimates by 30% to handle unexpected technical hurdles.
* **Strict Gate Reviews**: Implement a strict "no-skip" policy for milestones. Unlocking later tasks before completing foundation milestones inevitably leads to late-stage integration failures.
* **Dynamic Scope Allocation**: For future high-priority commitments, keep a 20% "flexible scope" buffer that can be discarded if the timeline enters high-risk boundaries.`;
}

function getLocalMissionCommanderFallback(
  activeGoalsBrief: { 
    id: string;
    name: string; 
    priority: string; 
    daysRemaining: number; 
    requiredDailyHours: number; 
    riskScore: number;
    riskLevel: string;
    progressPercentage: number;
    successProbability: number;
  }[],
  pendingTasksBrief: { 
    name: string; 
    description: string;
    goalName: string; 
    goalId: string;
    estimatedHours: number; 
    milestone: string;
    dueDate: string;
    goalPriority: string;
    goalRiskScore: number;
    goalSuccessProbability: number;
  }[]
): string {
  if (pendingTasksBrief.length === 0) {
    return `# TODAY'S TACTICAL DIRECTIVE: Define Primary High-Stakes Objective\n\n### 1. WHY THIS MISSION WAS CHOSEN\nNo active pending tasks exist in the database. You must register tasks to formulate your target timeline.\n\n### 2. WHAT RISK IT REDUCES\nFailing to establish structured tasks introduces general executive paralysis risk.\n\n### 3. WHAT FUTURE TASKS IT UNLOCKS\nRegistering foundation steps unlocks progress metrics and triggers the scheduler engine.\n\n### 4. HOW IT IMPROVES SUCCESS PROBABILITY\nDefining clear metrics shifts success probability from 0 to actual active benchmarks.\n\n### COMMANDER'S TACTICAL INTEL\nDo not drift. Formulate your primary high-stakes goal immediately.\n\n### CONSEQUENCE OF FAILURE\nDeferred goal registration guarantees total project drift.`;
  }

  // Calculate high-impact heuristic score for each task
  const scoredTasks = pendingTasksBrief.map(t => {
    let score = 0;

    // 1. Priority factor
    if (t.goalPriority === 'high') score += 30;
    else if (t.goalPriority === 'medium') score += 15;
    else score += 5;

    // 2. Risk factor
    score += t.goalRiskScore;

    // 3. Deadline / Proximity factor
    const goalBrief = activeGoalsBrief.find(g => g.id === t.goalId);
    const daysLeft = goalBrief ? goalBrief.daysRemaining : 7;
    if (daysLeft < 0) {
      score += 50; // Overdue tasks get massive booster
    } else {
      score += Math.max(0, 14 - daysLeft) * 3; // Closer to deadline gets higher score
    }

    // 4. Milestone dependency order (Earlier milestones should block later ones)
    const milestoneLower = t.milestone.toLowerCase();
    if (milestoneLower.includes('milestone 1') || milestoneLower.includes('phase 1') || milestoneLower.includes('foundation')) {
      score += 20;
    } else if (milestoneLower.includes('milestone 2') || milestoneLower.includes('phase 2') || milestoneLower.includes('development')) {
      score += 15;
    } else if (milestoneLower.includes('milestone 3') || milestoneLower.includes('phase 3') || milestoneLower.includes('audit')) {
      score += 10;
    } else {
      score += 5;
    }

    // 5. Work volume impact on Success Probability
    score += t.estimatedHours * 1.5;

    return { task: t, score, daysLeft, goalBrief };
  });

  // Sort by score descending
  scoredTasks.sort((a, b) => b.score - a.score);

  const selected = scoredTasks[0];
  const { task, daysLeft, goalBrief } = selected;
  const currentRequired = goalBrief ? goalBrief.requiredDailyHours : 2.0;
  const newRequired = goalBrief ? Math.max(0, parseFloat(((goalBrief.requiredDailyHours * Math.max(1, daysLeft) - task.estimatedHours) / Math.max(1, daysLeft)).toFixed(1))) : 1.5;
  const improvement = Math.min(25, Math.max(5, Math.round(task.estimatedHours * 1.8 + (task.goalRiskScore / 10))));

  return `# TODAY'S TACTICAL DIRECTIVE: ${task.name} (Goal: ${task.goalName})

### 1. WHY THIS MISSION WAS CHOSEN
This objective has been isolated as today's absolute highest bottleneck-breaker. It is associated with the **${task.goalPriority.toUpperCase()}** priority goal "**${task.goalName}**", which currently carries an elevated risk score of **${task.goalRiskScore}/100** with **${daysLeft >= 0 ? `${daysLeft} days` : 'OVERDUE'}** remaining. Chronologically, this task lies in **"${task.milestone}"**, representing a critical path blocker that must be cleared to avoid severe compounding delays.

### 2. WHAT RISK IT REDUCES
Completing this **${task.estimatedHours}-hour** task immediately offsets **capacity overload and timeline friction**. By locking in this completion, the required daily focus hours for "${task.goalName}" will be throttled down from **${currentRequired}h/day** to **${newRequired}h/day**, substantially lowering the risk of execution burnout and schedule overruns.

### 3. WHAT FUTURE TASKS IT UNLOCKS
Finishing this task resolves the current milestone bottleneck within **"${task.milestone}"**. Clearing this foundation unlocks downstream implementation, integrations, and deep verification phases, removing the friction that leads to task freeze and inertia.

### 4. HOW IT IMPROVES SUCCESS PROBABILITY
This single action acts as a direct multiplier for your project metrics. Relieving the timeline velocity deficit is projected to raise the goal's current success probability of **${task.goalSuccessProbability}%** by **+${improvement}%** (bringing it closer to safe thresholds). 

### COMMANDER'S TACTICAL INTEL
Isolate your workspace immediately. Close non-essential tabs, mute all notifications, and commit to a single high-intensity focus block. Do not multitask: complete this specific deliverable before any secondary objectives.

### CONSEQUENCE OF FAILURE
Deferring this directive will mathematically increase your daily required workload tomorrow, triggering a compounding schedule deficit and rapidly pushing "${task.goalName}" into high risk territory.`;
}

function getLocalRecoveryPlanFallback(
  goal: Goal,
  metrics: {
    daysRemaining: number;
    totalHours: number;
    completedHours: number;
    progressPercentage: number;
    requiredDailyHours: number;
    riskScore: number;
    riskLevel: string;
    successProbability: number;
  },
  pendingTasks: Task[]
): RecoveryPlanResult {
  const todayStr = new Date().toISOString();
  const totalDurationDays = Math.max(1, getDaysBetweenDatesLocal(goal.createdAt, goal.deadline));
  const daysElapsed = Math.max(0, getDaysBetweenDatesLocal(goal.createdAt, todayStr));
  const expectedProgress = Math.min(100, Math.max(0, Math.round((daysElapsed / totalDurationDays) * 100)));
  const progressDeficit = Math.max(0, expectedProgress - metrics.progressPercentage);
  const remainingHours = metrics.totalHours - metrics.completedHours;
  const totalAvailableCapacity = goal.availableHoursPerDay * Math.max(0, metrics.daysRemaining);
  const capacityDeficit = parseFloat((metrics.requiredDailyHours - goal.availableHoursPerDay).toFixed(1));

  const overdueTasks = pendingTasks.filter(t => {
    if (!t.dueDate) return false;
    return getDaysBetweenDatesLocal(t.dueDate, todayStr) > 0;
  });
  const uniqueMissedMilestones = Array.from(new Set(overdueTasks.map(t => t.milestone).filter(Boolean)));
  const missedMilestonesStr = uniqueMissedMilestones.join(', ') || 'None';

  // Plans calculations
  const planA_hours = parseFloat(Math.min(goal.availableHoursPerDay * 1.3, metrics.requiredDailyHours).toFixed(1));
  const planA_prob = Math.min(85, Math.max(40, metrics.successProbability + 15));

  const planB_hours = parseFloat(metrics.requiredDailyHours.toFixed(1));
  const planB_prob = Math.min(98, Math.max(60, metrics.successProbability + 35));

  const planC_hours = goal.availableHoursPerDay;
  const planC_prob = Math.min(90, Math.max(50, metrics.successProbability + 25));

  return {
    reasons: [
      `Capacity Overload: Remaining work of ${remainingHours} hours exceeds sustainable available capacity of ${goal.availableHoursPerDay} hours/day over the remaining ${metrics.daysRemaining} days (creating a daily deficit of ${capacityDeficit > 0 ? capacityDeficit : 0} hours/day).`,
      `Progress Deficit: Achieved ${metrics.progressPercentage}% progress vs. expected progress of ${expectedProgress}% at this stage in the timeline (a net scheduling delay of ${progressDeficit}%).`,
      `Milestone Slippage: Slipped on ${overdueTasks.length} critical path task(s). Overdue milestone segments detected: ${missedMilestonesStr}.`,
      `High-Stakes Bottlenecks: Immediate critical dependency blockers are preventing progress on the overall ${goal.priority.toUpperCase()} priority target.`
    ],
    timelineAdjustments: `To secure deadline compliance for this ${goal.priority.toUpperCase()} priority commitment, we recommend an immediate 24-hour freeze on all auxiliary tasks. Transition to a strict gate-review process where no downstream task is started until its foundational precursor milestone is 100% completed. If you choose Plan C, descoping of lower-priority milestones is required.`,
    actionSteps: [
      `PLAN A: BALANCED RECOVERY (Sustainable approach)
• Required Daily Hours: ${planA_hours} hours/day (Moderate increase from ${goal.availableHoursPerDay} hours/day)
• Expected Success Probability: ${planA_prob}%
• Trade-offs: Slower initial risk-reduction velocity; requires long-term execution discipline. Excellent for avoiding cognitive burnout and maintaining high quality.
• Recommended User Type: Steady, consistent performers who value sustainability over quick sprints.`,

      `PLAN B: AGGRESSIVE RECOVERY (Maximum effort)
• Required Daily Hours: ${planB_hours} hours/day (Peak required velocity to meet the original scope)
• Expected Success Probability: ${planB_prob}%
• Trade-offs: Extreme mental and physical fatigue, high burnout risk. However, it guarantees zero-compromise timeline completion with 100% of features intact.
• Recommended User Type: High-intensity sprinters comfortable with multi-hour focus blocks under deadline pressure.`,

      `PLAN C: SCOPE REDUCTION (Trim & postpone)
• Required Daily Hours: ${planC_hours} hours/day (Retains original comfortable daily capacity)
• Expected Success Probability: ${planC_prob}% for MVP
• Trade-offs: Postpones non-essential features and milestones to a secondary release cycle. Zero burnout risk, but requires active negotiation of deliverable boundaries.
• Recommended User Type: Practical operators under severe real-world time constraints prioritizing a solid core release.`
    ],
    coachingEncouragement: `A delayed project is not a failed project—it is a project awaiting a decision. The numbers do not lie, but they are highly manageable if you choose your recovery strategy now. Commit to Plan A, B, or C, and lock in your first focus block today.`
  };
}

function getLocalCoachMessageFallback(
  activeGoalsBrief: {
    name: string;
    progressPercentage: number;
    riskLevel: string;
    riskScore: number;
    requiredDailyHours: number;
    priority: string;
    daysRemaining: number;
    totalHours: number;
    completedHours: number;
    deadline: string;
  }[],
  overallCompletedTasksCount: number,
  overallPendingTasksCount: number
): string {
  if (activeGoalsBrief.length === 0) {
    return `### 1. Current Situation
Your execution board is currently clear of any active goals. Clarity starts with a commitment.

### 2. What Is Going Well
You are in a blank-slate phase. This is the optimal time to plan your next high-stakes operation with zero historical baggage.

### 3. What Needs Attention
You have zero active commitments. The risk is not overload, but inaction.

### 4. One Action To Take Today
Register your first high-stakes goal above. Establish your daily capacity, and commit.

**Zero Hour Axiom**: *Action is the only antidote to anxiety. Initiate now.*`;
  }

  // Sort goals by risk score descending to find the highest-risk commitment
  const sortedGoals = [...activeGoalsBrief].sort((a, b) => b.riskScore - a.riskScore);
  const leadingGoal = sortedGoals[0];
  const maxRiskScore = leadingGoal.riskScore;
  const totalTasks = overallCompletedTasksCount + overallPendingTasksCount;
  const completionRate = totalTasks > 0 ? Math.round((overallCompletedTasksCount / totalTasks) * 100) : 0;

  let currentSituation = '';
  let whatIsGoingWell = '';
  let whatNeedsAttention = '';
  let oneAction = '';

  if (maxRiskScore >= 70) {
    // High Risk Scenario
    currentSituation = `We are in a critical state. Your highest-stakes operation, **"${leadingGoal.name}"** (${leadingGoal.priority.toUpperCase()} priority), has escalated to a risk score of **${leadingGoal.riskScore}/100**. With only **${leadingGoal.daysRemaining} days** remaining and a substantial velocity deficit, you are currently on a trajectory toward project collapse. You require an intense daily commitment of **${leadingGoal.requiredDailyHours} hours/day** to salvage the timeline.`;
    
    whatIsGoingWell = `Despite the severe bottleneck, you have completed **${overallCompletedTasksCount}** tasks overall. You have successfully established the foundational framework of your board. The metrics show that when you actually focus, you have the raw capacity to move the needle—now we must convert that potential into a coordinated rescue campaign.`;

    whatNeedsAttention = `Your primary exposure is **"${leadingGoal.name}"**. The math is unyielding: the gap between your progress (**${leadingGoal.progressPercentage}%**) and your remaining workload (**${leadingGoal.totalHours - leadingGoal.completedHours} hours**) has created a capacity deficit. Complacency, distractions, or treating this as a leisure activity is guaranteed failure.`;

    oneAction = `Execute a total deep-work lockdown today. Select the single most critical pending task for **"${leadingGoal.name}"**, mute all notifications, block a contiguous 90-minute slot on your schedule, and execute until it is done. Do not look at the overall mountain; just win the next 90 minutes.

**Zero Hour Axiom**: *When in survival mode, simplify. Strip the noise and lock in one clean victory today.*`;
  } else if (maxRiskScore >= 35) {
    // Medium Risk Scenario
    currentSituation = `The execution board is in a yellow warning phase. Your leading operation, **"${leadingGoal.name}"** (${leadingGoal.priority.toUpperCase()} priority), is experiencing moderate timeline slippage with a risk score of **${leadingGoal.riskScore}/100**. You currently need to sustain **${leadingGoal.requiredDailyHours} hours/day** over the next **${leadingGoal.daysRemaining} days**. While you are not yet in a crisis, you are losing your buffer and drifting toward danger.`;

    whatIsGoingWell = `Your momentum is active. With **${overallCompletedTasksCount}** completed tasks and a board-wide task completion rate of **${completionRate}%**, you have established a solid baseline of consistency. You have proven that your daily tracking system works; now we just need to scale up your focus blocks to close the remaining progress gaps.`;

    whatNeedsAttention = `We must address the slow degradation of your schedule. **"${leadingGoal.name}"** has **${leadingGoal.daysRemaining} days** remaining, and your required velocity of **${leadingGoal.requiredDailyHours}h/day** is slowly creeping higher than your original planned capacity. If you do not raise your daily commitment now, you will face an unsustainable crunch period in the final days.`;

    oneAction = `Implement a strict time-boxing protocol today. Dedicate your very first hour of work entirely to **"${leadingGoal.name}"**. Use a timer to enforce a single-tasking block, and do not let administrative clutter dilute your peak energy.

**Zero Hour Axiom**: *Urgency is not panic; it is the deliberate elevation of focus. Raise your velocity before the timeline forces you to.*`;
  } else {
    // Low Risk Scenario
    currentSituation = `All operations are running under stable, low-risk conditions. Your primary goal **"${leadingGoal.name}"** is performing exceptionally well with a risk score of **${leadingGoal.riskScore}/100** and **${leadingGoal.daysRemaining} days** left to execute. Your required daily velocity of **${leadingGoal.requiredDailyHours} hours/day** is completely aligned with your available daily capacity.`;

    whatIsGoingWell = `You are demonstrating elite execution discipline. With a board-wide completion rate of **${completionRate}%** (**${overallCompletedTasksCount}** tasks completed), you have built massive momentum. Your milestones are being checked off in sequence, and you are operating in a proactive, calm, ahead-of-schedule posture.`;

    whatNeedsAttention = `Complacency is your primary threat. When things are green, the mind naturally relaxes standards, leading to skipped focus blocks or minor delay accumulation. Guard this momentum fiercely. Treat your low-risk status as an opportunity to build a permanent buffer and finish with absolute elegance.`;

    oneAction = `Use your current momentum to front-load a future task. Look at the upcoming milestones for **"${leadingGoal.name}"**, select a task scheduled for tomorrow, and neutralize it today. Maintain the streak and extend your buffer.

**Zero Hour Axiom**: *The amateur relaxes when ahead; the professional increases the gap. Double down on your momentum.*`;
  }

  return `### 1. Current Situation
${currentSituation}

### 2. What Is Going Well
${whatIsGoingWell}

### 3. What Needs Attention
${whatNeedsAttention}

### 4. One Action To Take Today
${oneAction}`;
}
