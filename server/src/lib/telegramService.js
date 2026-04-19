const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// Send a message to Telegram
async function sendMessage(text, options = {}) {
  const { chatId, parseMode = 'HTML', topicId = null } = options;

  if (!TELEGRAM_BOT_TOKEN) {
    console.warn('Telegram not configured, skipping message send');
    return null;
  }

  if (!chatId) {
    throw new Error('chatId is required');
  }

  const payload = {
    chat_id: chatId,
    text,
    parse_mode: parseMode,
    ...(topicId && { message_thread_id: topicId }),
  };

  const response = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Telegram API error: ${response.status} ${err}`);
  }

  return response.json();
}

// Send an inline keyboard message
async function sendMessageWithKeyboard(text, buttons, options = {}) {
  const { chatId, parseMode = 'HTML', topicId = null } = options;

  if (!TELEGRAM_BOT_TOKEN) {
    console.warn('Telegram not configured, skipping message send');
    return null;
  }

  if (!chatId) {
    throw new Error('chatId is required');
  }

  const payload = {
    chat_id: chatId,
    text,
    parse_mode: parseMode,
    reply_markup: {
      inline_keyboard: buttons,
    },
    ...(topicId && { message_thread_id: topicId }),
  };

  const response = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Telegram API error: ${response.status} ${err}`);
  }

  return response.json();
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
  const topicId = msg.message_thread_id || null;

  // Parse command
  const commandMatch = text.match(/^\/(\w+)(?:\s+(.*))?$/);
  if (commandMatch) {
    return {
      userId,
      chatId,
      topicId,
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
    topicId,
    text,
    command: null,
  };
}

module.exports = {
  sendMessage,
  sendMessageWithKeyboard,
  parseIncomingMessage,
};
