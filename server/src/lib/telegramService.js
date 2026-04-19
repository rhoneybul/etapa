const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

async function sendMessage(text, options = {}) {
  const {
    chatId = TELEGRAM_CHAT_ID,
    parseMode = 'HTML',
    disableWebPagePreview = true,
    replyMarkup = null
  } = options;

  if (!chatId || !TELEGRAM_BOT_TOKEN) {
    console.error('Missing Telegram config (chatId or botToken)');
    return null;
  }

  const body = {
    chat_id: chatId,
    text,
    parse_mode: parseMode,
    disable_web_page_preview: disableWebPagePreview
  };

  if (replyMarkup) {
    body.reply_markup = replyMarkup;
  }

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }
    );

    const data = await response.json();

    if (!data.ok) {
      console.error(`Telegram error: ${JSON.stringify(data)}`);
      return null;
    }

    return data.result;
  } catch (error) {
    console.error(`Failed to send Telegram message: ${error.message}`);
    return null;
  }
}

async function sendRecommendation(taskGroups) {
  const categoryEmojis = {
    'Marketing/Content': '📱',
    'Product Development': '🚀',
    'Infrastructure/DevOps': '⚙️',
    'Business/Admin': '💼',
    'Compliance/Legal': '⚖️',
    'Website': '🌐',
    'Other': '📦'
  };

  let message = '🎯 <b>Recommended Tasks</b>\n\n';

  let taskCount = 0;
  for (const [category, tasks] of Object.entries(taskGroups)) {
    if (tasks.length === 0) continue;

    const emoji = categoryEmojis[category] || '📌';
    message += `${emoji} <b>${category}</b> — ${tasks.length} tasks\n`;

    // Show top 2 per category, prioritize flagged
    const flagged = tasks.filter(t => t.flagged).slice(0, 1);
    const other = tasks.filter(t => !t.flagged).slice(0, 1);
    const topTasks = [...flagged, ...other];

    for (const task of topTasks) {
      const flag = task.flagged ? '🚩 ' : '';
      message += `  ${flag}<code>${task.name}</code>\n`;
      taskCount++;
    }

    if (tasks.length > 2) {
      message += `  <i>... and ${tasks.length - 2} more</i>\n`;
    }

    message += '\n';
  }

  message += '💡 Use <code>/build</code> to start working on tasks\n';
  message += '📲 React with 👍 if you want suggestions';

  return sendMessage(message);
}

async function sendProgressUpdate(update) {
  const { groupName, status, tasksCompleted, totalTasks, prLink } = update;

  let message = `✨ <b>Task Group: ${groupName}</b>\n\n`;
  message += `📊 Progress: ${tasksCompleted}/${totalTasks}\n`;
  message += `🤖 Status: ${status}\n`;

  if (prLink) {
    message += `\n<a href="${prLink}">View PR</a>`;
  }

  return sendMessage(message);
}

function parseCommand(text) {
  const match = text.match(/^\/(\w+)(?:\s+(.*))?$/);
  if (!match) return null;

  return {
    command: match[1],
    args: match[2]?.trim() || ''
  };
}

function parseIncomingMessage(update) {
  const message = update.message || update.channel_post;
  if (!message) return null;

  const text = message.text || '';
  const chatId = message.chat?.id;
  const userId = message.from?.id;
  const username = message.from?.username;

  return {
    chatId,
    userId,
    username,
    text,
    messageId: message.message_id,
    isCommand: text.startsWith('/'),
    command: parseCommand(text)
  };
}

module.exports = {
  sendMessage,
  sendRecommendation,
  sendProgressUpdate,
  parseCommand,
  parseIncomingMessage
};
