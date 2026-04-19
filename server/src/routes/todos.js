const express = require('express');
const router = express.Router();
const todoService = require('../lib/todoService');
const telegramService = require('../lib/telegramService');

// States for todo creation flow
const TODO_FLOW_STATES = {
  INIT: 'init',
  TITLE: 'title',
  DESCRIPTION: 'description',
  DUE_DATE: 'due_date',
  PRIORITY: 'priority',
  CONFIRM: 'confirm',
};

// In-memory store for todo creation conversations (30min timeout)
const todoConversations = new Map();

const CONVERSATION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

// Clean up old conversations
setInterval(() => {
  const now = Date.now();
  for (const [userId, conv] of todoConversations.entries()) {
    if (now - conv.startTime > CONVERSATION_TIMEOUT) {
      todoConversations.delete(userId);
    }
  }
}, 5 * 60 * 1000); // Check every 5 minutes

// Handle incoming Telegram message
router.post('/telegram', async (req, res) => {
  try {
    const update = req.body;
    const message = parseIncomingMessage(update);

    if (!message) {
      return res.json({ ok: true });
    }

    const { userId, chatId, text, command } = message;

    // Route to appropriate handler
    if (command) {
      const cmd = command.command;

      if (cmd === 'todo') {
        return handleTodoCommand(userId, chatId, command.args);
      } else if (cmd === 'todos' || cmd === 'todos-today') {
        return handleTodosToday(userId, chatId);
      } else if (cmd === 'next-flagged') {
        return handleNextFlagged(userId, chatId);
      } else if (cmd === 'todo-list') {
        return handleTodoList(userId, chatId);
      } else if (cmd === 'auto-backlog') {
        return handleAutoBacklog(userId, chatId);
      }
    }

    // Check if user is in the middle of creating a todo
    if (todoConversations.has(userId)) {
      return handleTodoCreationMessage(userId, chatId, text);
    }

    return res.json({ ok: true });
  } catch (error) {
    console.error(`Todo message error: ${error.message}`);
    return res.status(500).json({ error: error.message });
  }
});

async function handleTodoCommand(userId, chatId, args) {
  const subcommand = args?.[0]?.toLowerCase();

  if (!subcommand || subcommand === 'add') {
    // Start todo creation flow
    const convId = `todo_${Date.now()}`;
    todoConversations.set(userId, {
      id: convId,
      chatId,
      state: TODO_FLOW_STATES.TITLE,
      data: {},
      startTime: Date.now(),
    });

    await telegramService.sendMessage(
      '📝 <b>Create a new todo</b>\n\n' +
        "What's the title of the task? (max 150 chars)",
      { chatId }
    );
    return res.json({ ok: true });
  }

  return res.json({ ok: true });
}

async function handleTodoCreationMessage(userId, chatId, text) {
  const conv = todoConversations.get(userId);

  if (!conv) {
    return res.json({ ok: true });
  }

  const state = conv.state;

  if (state === TODO_FLOW_STATES.TITLE) {
    conv.data.title = text.substring(0, 150);
    conv.state = TODO_FLOW_STATES.DESCRIPTION;
    await telegramService.sendMessage(
      '✅ Title set: <b>' +
        conv.data.title +
        '</b>\n\n' +
        'Add a description? (or type "skip" to skip)',
      { chatId }
    );
  } else if (state === TODO_FLOW_STATES.DESCRIPTION) {
    if (text.toLowerCase() !== 'skip') {
      conv.data.description = text.substring(0, 500);
    }
    conv.state = TODO_FLOW_STATES.DUE_DATE;
    await telegramService.sendMessage(
      'Got it.\n\n' +
        'When is this due? (type date like "2026-04-25" or "skip")',
      { chatId }
    );
  } else if (state === TODO_FLOW_STATES.DUE_DATE) {
    if (
      text.toLowerCase() !== 'skip' &&
      /^\d{4}-\d{2}-\d{2}$/.test(text.trim())
    ) {
      conv.data.dueDate = text.trim();
    }
    conv.state = TODO_FLOW_STATES.PRIORITY;
    await telegramService.sendMessage(
      'Priorities?\n\n' +
        '🔴 <b>High</b>\n' +
        '🟡 <b>Medium</b>\n' +
        '🟢 <b>Low</b>\n\n' +
        '(type "high", "medium", "low" or "skip")',
      { chatId }
    );
  } else if (state === TODO_FLOW_STATES.PRIORITY) {
    const priorityMap = {
      high: 'High',
      medium: 'Medium',
      low: 'Low',
    };
    if (text.toLowerCase() in priorityMap) {
      conv.data.priority = priorityMap[text.toLowerCase()];
    }
    conv.state = TODO_FLOW_STATES.CONFIRM;

    // Show confirmation
    let confirmMsg = '✨ <b>Confirm todo</b>\n\n';
    confirmMsg += `<b>${conv.data.title}</b>\n`;
    if (conv.data.description) {
      confirmMsg += `📌 ${conv.data.description}\n`;
    }
    if (conv.data.dueDate) {
      confirmMsg += `📅 Due: ${conv.data.dueDate}\n`;
    }
    if (conv.data.priority) {
      confirmMsg += `📊 Priority: ${conv.data.priority}\n`;
    }
    confirmMsg += '\nType "create" to create, "cancel" to abort';
    await telegramService.sendMessage(confirmMsg, { chatId });
  } else if (state === TODO_FLOW_STATES.CONFIRM) {
    if (text.toLowerCase() === 'create') {
      try {
        // Build Notion properties
        const props = {};
        if (conv.data.description) {
          props.Description = {
            rich_text: [{ text: { content: conv.data.description } }],
          };
        }
        if (conv.data.dueDate) {
          props.Due = { date: { start: conv.data.dueDate } };
        }
        if (conv.data.priority) {
          props.Priority = { select: { name: conv.data.priority } };
        }

        const result = await todoService.createTodo(conv.data.title, props);
        await telegramService.sendMessage(
          '✅ Todo created!\n\n' +
            `📌 <b>${conv.data.title}</b>\n\n` +
            `<a href="${result.url}">View in Notion</a>`,
          { chatId }
        );
      } catch (err) {
        await telegramService.sendMessage(
          '❌ Failed to create todo: ' + err.message,
          { chatId }
        );
      }
    } else {
      await telegramService.sendMessage('❌ Todo creation cancelled', {
        chatId,
      });
    }

    // Clean up conversation
    todoConversations.delete(userId);
  }

  return res.json({ ok: true });
}

async function handleTodosToday(userId, chatId) {
  try {
    const todos = await todoService.getTodosCreatedToday();

    if (todos.length === 0) {
      await telegramService.sendMessage(
        '📭 No todos created today.\n\n' +
          'Use /todo add to create a new one',
        { chatId }
      );
      return res.json({ ok: true });
    }

    let message = `📋 <b>${todos.length} todos created today</b>\n\n`;
    for (const todo of todos) {
      const status = todo.flagged ? '🚩' : '✅';
      message += `${status} ${todo.title}\n`;
      if (todo.dueDate) {
        message += `  📅 ${todo.dueDate}\n`;
      }
    }

    await telegramService.sendMessage(message, { chatId });
  } catch (err) {
    await telegramService.sendMessage(
      '❌ Error fetching todos: ' + err.message,
      { chatId }
    );
  }

  return res.json({ ok: true });
}

async function handleNextFlagged(userId, chatId) {
  try {
    const task = await todoService.getNextFlaggedTask();

    if (!task) {
      await telegramService.sendMessage(
        '🎉 No flagged tasks! You\'re all caught up.',
        { chatId }
      );
      return res.json({ ok: true });
    }

    let message = '🚩 <b>Next flagged task</b>\n\n';
    message += `<b>${task.title}</b>\n`;
    if (task.dueDate) {
      message += `📅 Due: ${task.dueDate}\n`;
    }
    if (task.priority) {
      message += `📊 Priority: ${task.priority}\n`;
    }
    message += `\n<a href="${task.url}">Open in Notion</a>`;

    await telegramService.sendMessage(message, { chatId });
  } catch (err) {
    await telegramService.sendMessage(
      '❌ Error fetching task: ' + err.message,
      { chatId }
    );
  }

  return res.json({ ok: true });
}

async function handleTodoList(userId, chatId) {
  try {
    const todos = await todoService.getAllActiveTodos();

    if (todos.length === 0) {
      await telegramService.sendMessage('📭 No active todos', { chatId });
      return res.json({ ok: true });
    }

    // Group by status
    const byStatus = {};
    for (const todo of todos) {
      if (!byStatus[todo.status]) {
        byStatus[todo.status] = [];
      }
      byStatus[todo.status].push(todo);
    }

    let message = `📋 <b>${todos.length} active todos</b>\n\n`;

    const statusOrder = ['To do', 'In progress', 'Waiting'];
    for (const status of statusOrder) {
      if (byStatus[status]) {
        message += `<b>${status}</b> (${byStatus[status].length})\n`;
        for (const todo of byStatus[status].slice(0, 5)) {
          message += `  ${todo.flagged ? '🚩' : '○'} ${todo.title}\n`;
        }
        if (byStatus[status].length > 5) {
          message += `  ... and ${byStatus[status].length - 5} more\n`;
        }
        message += '\n';
      }
    }

    await telegramService.sendMessage(message, { chatId });
  } catch (err) {
    await telegramService.sendMessage(
      '❌ Error fetching todos: ' + err.message,
      { chatId }
    );
  }

  return res.json({ ok: true });
}

async function handleAutoBacklog(userId, chatId) {
  try {
    const backlogs = await todoService.autoBacklogOldTasks(7);

    if (backlogs.length === 0) {
      await telegramService.sendMessage(
        '✅ All tasks are current. Nothing to backlog.',
        { chatId }
      );
      return res.json({ ok: true });
    }

    let message = `♻️ <b>Auto-backlog: ${backlogs.length} tasks</b>\n\n`;
    for (const task of backlogs.slice(0, 10)) {
      message += `• ${task.title}\n`;
    }
    if (backlogs.length > 10) {
      message += `\n... and ${backlogs.length - 10} more`;
    }

    await telegramService.sendMessage(message, { chatId });
  } catch (err) {
    await telegramService.sendMessage(
      '❌ Error backlogging: ' + err.message,
      { chatId }
    );
  }

  return res.json({ ok: true });
}

// Parse incoming Telegram message
function parseIncomingMessage(update) {
  const msg = update.message || update.edited_message;

  if (!msg || !msg.text) {
    return null;
  }

  const text = msg.text.trim();
  const userId = msg.from.id;
  const chatId = msg.chat.id;

  // Parse command
  const commandMatch = text.match(/^\/(\w+)(?:\s+(.*))?$/);
  if (commandMatch) {
    return {
      userId,
      chatId,
      text,
      command: {
        command: commandMatch[1],
        args: commandMatch[2]?.split(/\s+/) || [],
      },
    };
  }

  return {
    userId,
    chatId,
    text,
    command: null,
  };
}

module.exports = router;
