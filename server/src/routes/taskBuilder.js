const express = require('express');
const router = express.Router();

const notionService = require('../lib/notionService');
const taskGrouper = require('../lib/taskGrouper');
const telegramService = require('../lib/telegramService');
const conversationState = require('../lib/conversationState');
const agentSpawner = require('../lib/agentSpawner');
const { createPR } = require('../lib/prCreator');

// States for conversation flow
const FLOW_STATES = {
  INITIAL: 'initial',
  SELECT_SCOPE: 'select_scope',
  CONFIRM_TASKS: 'confirm_tasks',
  SPAWNING: 'spawning',
  COMPLETE: 'complete'
};

// Handle incoming Telegram message
router.post('/telegram', async (req, res) => {
  try {
    const update = req.body;
    const message = telegramService.parseIncomingMessage(update);

    if (!message) {
      return res.json({ ok: true });
    }

    const { userId, chatId, text, command } = message;

    // Handle /build command
    if (command && command.command === 'build') {
      return handleBuildCommand(userId, chatId, command.args);
    }

    // Handle conversation responses
    const activeConvId = conversationState.getActiveConversation(userId);
    if (activeConvId) {
      return handleConversationMessage(userId, chatId, activeConvId, text);
    }

    // Unknown message - do nothing
    return res.json({ ok: true });
  } catch (error) {
    console.error(`Telegram message error: ${error.message}`);
    return res.status(500).json({ error: error.message });
  }
});

async function handleBuildCommand(userId, chatId, args) {
  try {
    // Check if user already has active conversation
    const existingConv = conversationState.getActiveConversation(userId);
    if (existingConv) {
      await telegramService.sendMessage(
        '🔄 You already have an active build session.\n\nFinish that one first or wait 30 minutes.',
        { chatId }
      );
      return res.json({ ok: true });
    }

    // Get tasks
    const tasks = await notionService.getAllActiveTasks();

    if (tasks.length === 0) {
      await telegramService.sendMessage(
        '📭 No active tasks found.\n\nAdd some tasks to your Notion to-do list and flag them!',
        { chatId }
      );
      return res.json({ ok: true });
    }

    // Create conversation
    const convId = conversationState.createConversation(userId, {
      chatId,
      tasks,
      groups: taskGrouper.groupTasks(tasks)
    });

    // Group tasks
    const groups = taskGrouper.groupTasks(tasks);
    const groupNames = Object.keys(groups);
    const flaggedTasks = tasks.filter(t => t.flagged);

    // Send initial message with options
    let message = '🚀 <b>Task Builder Started</b>\n\n';
    message += 'Which tasks should we work on?\n\n';

    message += '1️⃣ <b>All flagged items</b> (';
    message += `${flaggedTasks.length} tasks)\n`;

    message += '2️⃣ <b>By category</b>:\n';
    for (const [i, group] of groupNames.entries()) {
      message += `  ${i + 1}. ${group} (${groups[group].length})\n`;
    }

    message += '\n3️⃣ <b>Specific tasks</b> (reply with task names)\n\n';
    message += '👉 Reply with a number or task names';

    await telegramService.sendMessage(message, { chatId });

    // Store flow state
    conversationState.updateContext(convId, {
      flowState: FLOW_STATES.SELECT_SCOPE,
      groupNames
    });

    return res.json({ ok: true, conversationId: convId });
  } catch (error) {
    console.error(`Build command error: ${error.message}`);
    await telegramService.sendMessage(
      `❌ <b>Error</b> starting build\n\n<code>${error.message}</code>`,
      { chatId }
    );
    return res.json({ ok: true });
  }
}

async function handleConversationMessage(userId, chatId, convId, text) {
  try {
    const conv = conversationState.getConversation(convId);
    if (!conv) {
      await telegramService.sendMessage(
        '❌ Conversation expired. Use /build to start a new session.',
        { chatId }
      );
      return res.json({ ok: true });
    }

    const { flowState, groups, groupNames } = conv.context;

    if (flowState === FLOW_STATES.SELECT_SCOPE) {
      return await handleScopeSelection(convId, userId, chatId, text, groups, groupNames);
    } else if (flowState === FLOW_STATES.CONFIRM_TASKS) {
      return await handleTaskConfirmation(convId, userId, chatId, text);
    } else if (flowState === FLOW_STATES.SPAWNING) {
      await telegramService.sendMessage(
        '⏳ Already spawning agents...\n\nPlease wait for the previous spawn to complete.',
        { chatId }
      );
      return res.json({ ok: true });
    }

    return res.json({ ok: true });
  } catch (error) {
    console.error(`Conversation message error: ${error.message}`);
    await telegramService.sendMessage(
      `❌ <b>Error</b> processing message\n\n<code>${error.message}</code>`,
      { chatId }
    );
    return res.json({ ok: true });
  }
}

async function handleScopeSelection(convId, userId, chatId, text, groups, groupNames) {
  let selectedTasks = [];

  if (text === '1' || text.toLowerCase() === 'flagged') {
    // All flagged items
    selectedTasks = conversationState.getConversation(convId).context.tasks.filter(t => t.flagged);
  } else if (!isNaN(text) && parseInt(text) > 1 && parseInt(text) <= groupNames.length + 1) {
    // Specific category
    const groupIndex = parseInt(text) - 2;
    const selectedGroup = groupNames[groupIndex];
    selectedTasks = groups[selectedGroup];
  } else if (text === '3' || text.toLowerCase() === 'specific') {
    // Will ask for specific tasks in next message
    await telegramService.sendMessage(
      '📝 <b>Enter specific tasks</b>\n\nEnter task names (comma-separated) or "all" for all tasks:\n\n<i>Example: "Coach check-in, Blog"</i>',
      { chatId }
    );

    conversationState.updateContext(convId, {
      flowState: FLOW_STATES.SELECT_SCOPE, // Stay in same state, wait for next message
      waitingForTaskNames: true
    });

    return res.json({ ok: true });
  } else if (conversationState.getConversation(convId).context.waitingForTaskNames) {
    // Process task names
    const allTasks = conversationState.getConversation(convId).context.tasks;

    if (text.toLowerCase() === 'all') {
      selectedTasks = allTasks;
    } else {
      const names = text.split(',').map(n => n.trim().toLowerCase());
      selectedTasks = allTasks.filter(t => names.some(n => t.name.toLowerCase().includes(n)));
    }
  } else {
    await telegramService.sendMessage(
      '❌ Invalid selection. Reply with:\n1️⃣ for flagged\n2️⃣ for category\n3️⃣ for specific tasks',
      { chatId }
    );
    return res.json({ ok: true });
  }

  if (selectedTasks.length === 0) {
    await telegramService.sendMessage(
      '❌ No tasks selected. Try again.',
      { chatId }
    );
    return res.json({ ok: true });
  }

  // Confirm selection
  let confirmMessage = `✅ <b>Selected Tasks (${selectedTasks.length})</b>\n\n`;
  for (const task of selectedTasks.slice(0, 10)) {
    confirmMessage += `• ${task.name}\n`;
  }

  if (selectedTasks.length > 10) {
    confirmMessage += `... and ${selectedTasks.length - 10} more\n`;
  }

  confirmMessage += '\n👉 Reply "yes" to proceed or "no" to cancel';

  await telegramService.sendMessage(confirmMessage, { chatId });

  conversationState.selectTasks(convId, selectedTasks.map(t => t.id));
  conversationState.updateContext(convId, {
    flowState: FLOW_STATES.CONFIRM_TASKS,
    waitingForTaskNames: false
  });

  return res.json({ ok: true });
}

async function handleTaskConfirmation(convId, userId, chatId, text) {
  const conv = conversationState.getConversation(convId);

  if (text.toLowerCase() === 'yes') {
    await spawnAgents(convId, userId, chatId);
  } else if (text.toLowerCase() === 'no') {
    conversationState.closeConversation(convId);
    await telegramService.sendMessage(
      '❌ Cancelled.\n\nUse /build to start over.',
      { chatId }
    );
  } else {
    await telegramService.sendMessage(
      '❓ Reply "yes" to proceed or "no" to cancel',
      { chatId }
    );
  }

  return res.json({ ok: true });
}

async function spawnAgents(convId, userId, chatId) {
  try {
    const conv = conversationState.getConversation(convId);
    const allTasks = conv.context.tasks;
    const selectedTaskIds = conv.selectedTasks;

    // Get selected task objects
    const selectedTasks = allTasks.filter(t => selectedTaskIds.includes(t.id));

    // Group by category
    const groups = taskGrouper.groupTasks(selectedTasks);

    conversationState.updateContext(convId, {
      flowState: FLOW_STATES.SPAWNING
    });

    await telegramService.sendMessage(
      `🤖 <b>Spawning ${Object.keys(groups).length} agent(s)...</b>\n\nThis may take a moment.`,
      { chatId }
    );

    const spawnedAgentIds = [];
    const prResults = [];

    // Spawn one agent per group
    for (const [groupName, groupTasks] of Object.entries(groups)) {
      try {
        // Spawn agent
        const { agentId } = await agentSpawner.spawnAgent(
          groupName,
          groupTasks,
          'You are working on the Etapa cycling training app. Ask clarifying questions before starting work.'
        );

        spawnedAgentIds.push(agentId);

        // Create PR
        const prResult = await createPR(groupName, groupTasks, [agentId]);
        prResults.push(prResult);

        await telegramService.sendMessage(
          `✅ <b>${groupName}</b>\n\n🤖 Agent spawned\n🔗 PR created\n\nWorking on ${groupTasks.length} task${groupTasks.length > 1 ? 's' : ''}...`,
          { chatId }
        );
      } catch (error) {
        console.error(`Error spawning agent for ${groupName}: ${error.message}`);
        await telegramService.sendMessage(
          `❌ <b>${groupName}</b>\n\nFailed to spawn agent: ${error.message}`,
          { chatId }
        );
      }
    }

    // Final summary
    const successful = prResults.filter(r => r.success).length;
    let summary = `\n🎉 <b>Complete</b>\n\n`;
    summary += `${successful}/${Object.keys(groups).length} agent(s) spawned successfully\n`;
    summary += `Check your PRs for progress!\n\n`;
    summary += '💡 Agents will ask clarifying questions. Reply in the PRs when ready.';

    await telegramService.sendMessage(summary, { chatId });

    conversationState.updateContext(convId, {
      flowState: FLOW_STATES.COMPLETE,
      spawnedAgentIds,
      prResults
    });

    // Close conversation after 1 minute (let them see the summary)
    setTimeout(() => {
      conversationState.closeConversation(convId);
    }, 60000);

    return res.json({ ok: true });
  } catch (error) {
    console.error(`Spawn agents error: ${error.message}`);
    await telegramService.sendMessage(
      `❌ <b>Error</b> spawning agents\n\n<code>${error.message}</code>`,
      { chatId }
    );
    return res.json({ ok: true });
  }
}

// Admin endpoint to manually trigger summary
router.post('/summary', async (req, res) => {
  try {
    const { timeOfDay = 'manual' } = req.body;
    const { sendDailySummary } = require('../lib/taskBuilderScheduler');

    await sendDailySummary(timeOfDay);
    res.json({ ok: true, message: 'Summary sent' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Status endpoint
router.get('/status', (req, res) => {
  const stats = conversationState.getStats();
  const agents = agentSpawner.getRecentAgents(5);

  res.json({
    ok: true,
    conversations: stats,
    recentAgents: agents
  });
});

module.exports = router;
