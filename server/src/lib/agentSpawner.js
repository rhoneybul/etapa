const { execSync } = require('child_process');

class AgentSpawner {
  constructor() {
    this.spawnedAgents = new Map();
  }

  async spawnAgent(groupName, tasks, userContext = '') {
    const agentId = `agent_${groupName.replace(/\s+/g, '_')}_${Date.now()}`;

    const taskList = tasks
      .map(t => `- ${t.name} (Status: ${t.status}, Flagged: ${t.flagged ? 'Yes' : 'No'})`)
      .join('\n');

    const systemPrompt = `You are a task executor agent for the Etapa cycling app project.

Your role: Complete the following tasks to the best of your ability.
${userContext ? `\nUser Context: ${userContext}` : ''}

IMPORTANT:
1. Ask clarifying questions BEFORE starting work
2. Break down tasks into smaller subtasks
3. Work systematically and document your progress
4. When done, summarize what was completed
5. Note any blockers or questions for the user

Tasks to complete:
${taskList}

When you complete work or create files, they will be automatically committed as a PR for review.`;

    const spawnConfig = {
      task: systemPrompt,
      runtime: 'subagent',
      mode: 'session',
      model: 'claude-opus-4-7',
      timeoutSeconds: 7200 // 2 hour timeout
    };

    this.spawnedAgents.set(agentId, {
      id: agentId,
      groupName,
      taskCount: tasks.length,
      status: 'spawned',
      createdAt: Date.now(),
      config: spawnConfig
    });

    return {
      agentId,
      groupName,
      taskCount: tasks.length,
      config: spawnConfig
    };
  }

  getAgentStatus(agentId) {
    return this.spawnedAgents.get(agentId) || null;
  }

  updateAgentStatus(agentId, status, updates = {}) {
    const agent = this.spawnedAgents.get(agentId);
    if (!agent) return null;

    agent.status = status;
    agent.lastUpdate = Date.now();
    Object.assign(agent, updates);

    return agent;
  }

  getAllSpawnedAgents() {
    return Array.from(this.spawnedAgents.values());
  }

  getRecentAgents(limit = 10) {
    return Array.from(this.spawnedAgents.values())
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }
}

const spawner = new AgentSpawner();

module.exports = spawner;
