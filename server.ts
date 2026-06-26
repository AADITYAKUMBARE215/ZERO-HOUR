import express, { Request, Response } from 'express';
import path from 'path';
import 'dotenv/config';
import { createServer as createViteServer } from 'vite';
import { db, getGoalMetrics, getDashboardStats, getGoalConflicts } from './src/server/db.ts';
import {
  generatePlanner,
  generateScheduler,
  generateRiskExplanation,
  generateMissionCommander,
  generateRecoveryPlan,
  generateCoachMessage
} from './src/server/gemini.ts';
import { Goal, Task, AIOutput } from './src/types.ts';

const app = express();
const PORT = 3000;

app.use(express.json());

// --- BACKEND REST API ENDPOINTS ---

// 1. GET ALL GOALS WITH COMPUTED METRICS
app.get('/api/goals', (req: Request, res: Response) => {
  try {
    const goals = db.getGoals();
    const tasks = db.getTasks();
    const goalsWithMetrics = goals.map(goal => {
      const metrics = getGoalMetrics(goal, tasks);
      return {
        ...goal,
        metrics
      };
    });
    res.json(goalsWithMetrics);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve goals', message: err.message });
  }
});

// 2. GET SINGLE GOAL WITH METRICS AND DISPATCHED TASKS
app.get('/api/goals/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const goal = db.getGoal(id);
    if (!goal) {
      res.status(404).json({ error: 'Goal not found' });
      return;
    }
    const tasks = db.getTasks(id);
    const metrics = getGoalMetrics(goal, tasks);
    const plannerOutput = db.getAIOutputByType(id, 'planner');
    const schedulerOutput = db.getAIOutputByType(id, 'scheduler');
    const recoveryOutput = db.getAIOutputByType(id, 'recovery_plan');

    res.json({
      goal,
      metrics,
      tasks,
      aiOutputs: {
        planner: plannerOutput ? JSON.parse(plannerOutput.content) : null,
        scheduler: schedulerOutput ? JSON.parse(schedulerOutput.content) : null,
        recoveryPlan: recoveryOutput ? JSON.parse(recoveryOutput.content) : null
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve goal details', message: err.message });
  }
});

// 3. CREATE A GOAL (Automatically triggers the AI Planner Agent)
app.post('/api/goals', async (req: Request, res: Response) => {
  try {
    const { name, description, deadline, priority, availableHoursPerDay, dailyGoalAllocation } = req.body;

    if (!name || !deadline || !availableHoursPerDay) {
      res.status(400).json({ error: 'Missing required goal fields (name, deadline, availableHoursPerDay)' });
      return;
    }

    const allocation = dailyGoalAllocation ? Number(dailyGoalAllocation) : Number(availableHoursPerDay);

    const newGoal: Goal = {
      id: 'goal_' + Math.random().toString(36).substring(2, 11),
      name,
      description: description || '',
      deadline,
      priority: priority || 'medium',
      availableHoursPerDay: Number(availableHoursPerDay),
      dailyGoalAllocation: allocation,
      createdAt: new Date().toISOString()
    };

    // Save goal immediately
    db.addGoal(newGoal);

    let aiGeneratedTasks: any[] = [];
    let plannerAdvice = '';
    let aiError = null;

    // Trigger AI Planner Agent to break down tasks
    try {
      const plannerResult = await generatePlanner(
        newGoal.name,
        newGoal.description,
        newGoal.deadline,
        newGoal.priority,
        newGoal.dailyGoalAllocation
      );

      // Create Task objects from the AI breakdown
      const tasksToCreate: Task[] = plannerResult.tasks.map((t: any) => ({
        id: 'task_' + Math.random().toString(36).substring(2, 11),
        goalId: newGoal.id,
        name: t.name,
        description: t.description || '',
        estimatedHours: Number(t.estimatedHours) || 2,
        completed: false,
        milestone: t.milestone || 'General Tasks',
        dueDate: t.dueDate || newGoal.deadline
      }));

      // Store tasks in DB
      db.addTasks(tasksToCreate);
      aiGeneratedTasks = tasksToCreate;
      plannerAdvice = plannerResult.executionPlanSummary;

      // Save planner AI advice in ai_outputs
      const aiOutput: AIOutput = {
        id: 'out_' + Math.random().toString(36).substring(2, 11),
        goalId: newGoal.id,
        type: 'planner',
        content: JSON.stringify(plannerResult),
        createdAt: new Date().toISOString()
      };
      db.addAIOutput(aiOutput);

    } catch (err: any) {
      console.warn('AI Planner agent failed, saving goal only:', err.message);
      aiError = err.message;
    }

    res.json({
      success: true,
      goal: newGoal,
      tasks: aiGeneratedTasks,
      advisorAdvice: plannerAdvice,
      aiError: aiError // If present, the UI can warn the user that the goal was created but tasks must be created manually because of API key missing
    });

  } catch (err: any) {
    res.status(500).json({ error: 'Failed to create goal', message: err.message });
  }
});

// 4. DELETE A GOAL
app.delete('/api/goals/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    db.deleteGoal(id);
    res.json({ success: true, message: 'Goal deleted successfully' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to delete goal', message: err.message });
  }
});

// 5. GET ALL TASKS (OPTIONAL FILTER BY GOAL)
app.get('/api/tasks', (req: Request, res: Response) => {
  try {
    const { goalId } = req.query;
    const tasks = db.getTasks(goalId as string);
    res.json(tasks);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve tasks', message: err.message });
  }
});

// 6. ADD A MANUAL TASK TO A GOAL
app.post('/api/tasks', (req: Request, res: Response) => {
  try {
    const { goalId, name, description, estimatedHours, milestone, dueDate } = req.body;
    if (!goalId || !name || !estimatedHours) {
      res.status(400).json({ error: 'Missing required task fields (goalId, name, estimatedHours)' });
      return;
    }

    const newTask: Task = {
      id: 'task_' + Math.random().toString(36).substring(2, 11),
      goalId,
      name,
      description: description || '',
      estimatedHours: Number(estimatedHours),
      completed: false,
      milestone: milestone || 'General Tasks',
      dueDate: dueDate || new Date().toISOString().split('T')[0]
    };

    db.addTask(newTask);
    res.json({ success: true, task: newTask });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to add task', message: err.message });
  }
});

// 7. UPDATE A TASK (Completed state, estimation, details)
app.put('/api/tasks/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const fieldsToUpdate = req.body;
    db.updateTask(id, fieldsToUpdate);
    res.json({ success: true, message: 'Task updated successfully' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update task', message: err.message });
  }
});

// 8. DELETE A SINGLE TASK
app.delete('/api/tasks/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    db.deleteTask(id);
    res.json({ success: true, message: 'Task deleted successfully' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to delete task', message: err.message });
  }
});

// 9. DASHBOARD STATS (Calculated locally)
app.get('/api/dashboard/stats', (req: Request, res: Response) => {
  try {
    const goals = db.getGoals();
    const tasks = db.getTasks();
    const stats = getDashboardStats(goals, tasks);
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to calculate stats', message: err.message });
  }
});

// 10. GOAL CONFLICTS DETECTOR (Calculated locally)
app.get('/api/dashboard/conflicts', (req: Request, res: Response) => {
  try {
    const goals = db.getGoals();
    const tasks = db.getTasks();
    const workspaceCapacity = req.query.workspaceCapacity ? Number(req.query.workspaceCapacity) : 8.0;
    const conflicts = getGoalConflicts(goals, tasks, workspaceCapacity);
    res.json(conflicts);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to identify conflicts', message: err.message });
  }
});

// 10b. UPDATE GOAL (Supports Daily Goal Allocation and other properties)
app.put('/api/goals/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, deadline, priority, dailyGoalAllocation } = req.body;

    const goal = db.getGoal(id);
    if (!goal) {
      res.status(404).json({ error: 'Goal not found' });
      return;
    }

    const updatedFields: Partial<Goal> = {};
    if (name !== undefined) updatedFields.name = name;
    if (description !== undefined) updatedFields.description = description;
    if (deadline !== undefined) updatedFields.deadline = deadline;
    if (priority !== undefined) updatedFields.priority = priority;
    if (dailyGoalAllocation !== undefined) {
      updatedFields.dailyGoalAllocation = Number(dailyGoalAllocation);
      updatedFields.availableHoursPerDay = Number(dailyGoalAllocation); // Maintain backwards compatibility
    }

    db.updateGoal(id, updatedFields);

    // Invalidate cached AI output because parameters/allocation has changed
    db.deleteAIOutputByType(id, 'risk_analysis');
    db.deleteAIOutputByType(id, 'scheduler');
    db.deleteAIOutputByType(id, 'recovery_plan');

    res.json({ success: true, goal: db.getGoal(id) });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update goal', message: err.message });
  }
});

// Helper to get precise database-driven state signature for cache invalidation
function getBoardStateSignature(): string {
  try {
    const goals = db.getGoals();
    const tasks = db.getTasks();
    const signature = goals.map(g => `${g.id}:${g.priority}:${g.deadline}`).join('|') + 
                      '##' + 
                      tasks.map(t => `${t.id}:${t.completed}`).join('|');
    return signature;
  } catch (err) {
    return String(Date.now());
  }
}

// 11. MISSION COMMANDER AGENT DIRECTIVE (AI Generated based on exact state of commitments)
app.post('/api/dashboard/mission', async (req: Request, res: Response) => {
  try {
    const goals = db.getGoals();
    const tasks = db.getTasks();

    if (goals.length === 0) {
      res.json({ directive: '# MISSION DEBRIEF: NO ACTIVE TARGETS\nRegister a goal to launch the Mission Commander Agent.' });
      return;
    }

    const force = req.body?.force === true;
    const currentSignature = getBoardStateSignature();

    // Check persistent database-level cache
    const cached = db.getAIOutputByType('global', 'mission_commander');
    if (!force && cached) {
      try {
        const payload = JSON.parse(cached.content);
        if (payload && payload.stateSignature && payload.cachedAt) {
          const cacheAgeMs = Date.now() - new Date(payload.cachedAt).getTime();
          const isThrottleValid = cacheAgeMs < 60000; // 60 seconds minimum cooldown
          const isSignatureMatch = payload.stateSignature === currentSignature;

          if (isSignatureMatch || isThrottleValid) {
            res.json({ directive: payload.data });
            return;
          }
        }
      } catch (e) {
        // fallback to live regeneration
      }
    }

    // Filter goals with active tasks
    const activeGoalsBrief = goals.map(g => {
      const m = getGoalMetrics(g, tasks);
      return {
        id: g.id,
        name: g.name,
        priority: g.priority,
        daysRemaining: m.daysRemaining,
        requiredDailyHours: m.requiredDailyHours,
        riskScore: m.riskScore,
        riskLevel: m.riskLevel,
        progressPercentage: m.progressPercentage,
        successProbability: m.successProbability
      };
    });

    const pendingTasksBrief = tasks
      .filter(t => !t.completed)
      .map(t => {
        const goal = goals.find(g => g.id === t.goalId);
        const goalMetric = goal ? getGoalMetrics(goal, tasks) : null;
        return {
          name: t.name,
          description: t.description || '',
          goalName: goal ? goal.name : 'Unknown Goal',
          goalId: t.goalId,
          estimatedHours: t.estimatedHours,
          milestone: t.milestone || 'General Tasks',
          dueDate: t.dueDate || 'No Due Date',
          goalPriority: goal ? goal.priority : 'medium',
          goalRiskScore: goalMetric ? goalMetric.riskScore : 50,
          goalSuccessProbability: goalMetric ? goalMetric.successProbability : 50
        };
      });

    const directive = await generateMissionCommander(activeGoalsBrief, pendingTasksBrief);

    // Save to persistent database cache
    const cachePayload = {
      data: directive,
      stateSignature: currentSignature,
      cachedAt: new Date().toISOString()
    };

    db.addAIOutput({
      id: 'out_' + Math.random().toString(36).substring(2, 11),
      goalId: 'global',
      type: 'mission_commander',
      content: JSON.stringify(cachePayload),
      createdAt: new Date().toISOString()
    });

    res.json({ directive });
  } catch (err: any) {
    res.status(500).json({ error: 'Mission Commander failed', message: err.message });
  }
});

// 12. DAILY COACH GUIDANCE AGENT (AI Generated based on exact state)
app.post('/api/dashboard/coach', async (req: Request, res: Response) => {
  try {
    const goals = db.getGoals();
    const tasks = db.getTasks();

    if (goals.length === 0) {
      res.json({ message: 'Welcome to **ZERO HOUR**. I am your Daily Coach. Register your first high-stakes goal above to begin. Clarity begins when you commit.' });
      return;
    }

    const force = req.body?.force === true;
    const currentSignature = getBoardStateSignature();

    // Check persistent database-level cache
    const cached = db.getAIOutputByType('global', 'coach_message');
    if (!force && cached) {
      try {
        const payload = JSON.parse(cached.content);
        if (payload && payload.stateSignature && payload.cachedAt) {
          const cacheAgeMs = Date.now() - new Date(payload.cachedAt).getTime();
          const isThrottleValid = cacheAgeMs < 60000; // 60 seconds minimum cooldown
          const isSignatureMatch = payload.stateSignature === currentSignature;

          if (isSignatureMatch || isThrottleValid) {
            res.json({ message: payload.data });
            return;
          }
        }
      } catch (e) {
        // fallback to live regeneration
      }
    }

    const activeBrief = goals.map(g => {
      const m = getGoalMetrics(g, tasks);
      return {
        name: g.name,
        progressPercentage: m.progressPercentage,
        riskLevel: m.riskLevel,
        riskScore: m.riskScore,
        requiredDailyHours: m.requiredDailyHours,
        priority: g.priority,
        daysRemaining: m.daysRemaining,
        totalHours: m.totalHours,
        completedHours: m.completedHours,
        deadline: g.deadline
      };
    });

    const completedCount = tasks.filter(t => t.completed).length;
    const pendingCount = tasks.filter(t => !t.completed).length;

    const message = await generateCoachMessage(activeBrief, completedCount, pendingCount);

    // Save to persistent database cache
    const cachePayload = {
      data: message,
      stateSignature: currentSignature,
      cachedAt: new Date().toISOString()
    };

    db.addAIOutput({
      id: 'out_' + Math.random().toString(36).substring(2, 11),
      goalId: 'global',
      type: 'coach_message',
      content: JSON.stringify(cachePayload),
      createdAt: new Date().toISOString()
    });

    res.json({ message });
  } catch (err: any) {
    res.status(500).json({ error: 'Daily Coach failed', message: err.message });
  }
});

// 13. WHY AM I AT RISK? (AI Explainer combining local calculations with AI reasoning)
app.post('/api/goals/:id/risk-analysis', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const goal = db.getGoal(id);
    if (!goal) {
      res.status(404).json({ error: 'Goal not found' });
      return;
    }

    const force = req.body?.force === true;
    const currentSignature = getBoardStateSignature();

    // Check persistent database-level cache
    const cached = db.getAIOutputByType(id, 'risk_analysis');
    if (!force && cached) {
      try {
        const payload = JSON.parse(cached.content);
        if (payload && payload.stateSignature && payload.cachedAt) {
          const cacheAgeMs = Date.now() - new Date(payload.cachedAt).getTime();
          const isThrottleValid = cacheAgeMs < 60000; // 60 seconds minimum cooldown
          const isSignatureMatch = payload.stateSignature === currentSignature;

          if (isSignatureMatch || isThrottleValid) {
            res.json({ explanation: payload.data });
            return;
          }
        }
      } catch (e) {
        // fallback to live regeneration
      }
    }

    const tasks = db.getTasks(id);
    const metrics = getGoalMetrics(goal, tasks);

    const completedTasks = tasks.filter(t => t.completed);
    const pendingTasks = tasks.filter(t => !t.completed);

    const explanation = await generateRiskExplanation(
      goal,
      metrics,
      completedTasks,
      pendingTasks
    );

    // Save to persistent database cache
    const cachePayload = {
      data: explanation,
      stateSignature: currentSignature,
      cachedAt: new Date().toISOString()
    };

    db.addAIOutput({
      id: 'out_' + Math.random().toString(36).substring(2, 11),
      goalId: id,
      type: 'risk_analysis',
      content: JSON.stringify(cachePayload),
      createdAt: new Date().toISOString()
    });

    res.json({ explanation });
  } catch (err: any) {
    res.status(500).json({ error: 'Risk explanation agent failed', message: err.message });
  }
});

// 14. RECOVERY PLANNER AGENT
app.post('/api/goals/:id/recovery-plan', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const goal = db.getGoal(id);
    if (!goal) {
      res.status(404).json({ error: 'Goal not found' });
      return;
    }

    const tasks = db.getTasks(id);
    const metrics = getGoalMetrics(goal, tasks);
    const pendingTasks = tasks.filter(t => !t.completed);

    const recoveryPlan = await generateRecoveryPlan(
      goal,
      metrics,
      pendingTasks
    );

    // Save recovery plan to AIOutputs
    const aiOutput: AIOutput = {
      id: 'out_' + Math.random().toString(36).substring(2, 11),
      goalId: goal.id,
      type: 'recovery_plan',
      content: JSON.stringify(recoveryPlan),
      createdAt: new Date().toISOString()
    };
    db.addAIOutput(aiOutput);

    res.json({ success: true, recoveryPlan });
  } catch (err: any) {
    res.status(500).json({ error: 'Recovery planner agent failed', message: err.message });
  }
});

// 15. SCHEDULER AGENT (Generate specific time slot and day mappings)
app.post('/api/goals/:id/scheduler', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const goal = db.getGoal(id);
    if (!goal) {
      res.status(404).json({ error: 'Goal not found' });
      return;
    }

    const tasks = db.getTasks(id).filter(t => !t.completed);
    const availableHours = goal.dailyGoalAllocation ?? goal.availableHoursPerDay ?? 2;

    if (tasks.length === 0) {
      res.json({
        success: true,
        scheduler: {
          daily: [],
          weekly: [],
          schedulerNotes: 'All scheduled tasks are complete. Clear the goal board or add new tasks.'
        }
      });
      return;
    }

    const schedulerResult = await generateScheduler(
      goal.name,
      tasks.map(t => ({ name: t.name, estimatedHours: t.estimatedHours })),
      availableHours
    );

    // Save schedule in ai_outputs
    const aiOutput: AIOutput = {
      id: 'out_' + Math.random().toString(36).substring(2, 11),
      goalId: goal.id,
      type: 'scheduler',
      content: JSON.stringify(schedulerResult),
      createdAt: new Date().toISOString()
    };
    db.addAIOutput(aiOutput);

    res.json({ success: true, scheduler: schedulerResult });
  } catch (err: any) {
    res.status(500).json({ error: 'Scheduler Agent failed', message: err.message });
  }
});

// --- VITE INTERFACE AND STATIC SERVING ---
async function startServer() {
  // Setup Vite development server or production build serving
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    // SPA fallback
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ZERO HOUR full-stack server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
