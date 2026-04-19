const cron = require('node-cron');
const notionService = require('./notionService');
const taskGrouper = require('./taskGrouper');
const telegramService = require('./telegramService');

let scheduler = null;

function startScheduler() {
  if (scheduler) {
    console.log('Scheduler already running');
    return;
  }

  // Schedule for 9am and 12pm every day
  // 0 9 * * * = 9:00 AM
  // 0 12 * * * = 12:00 PM
  const nineAmJob = cron.schedule('0 9 * * *', async () => {
    console.log('Running 9am task summary...');
    try {
      await sendDailySummary('morning');
    } catch (error) {
      console.error(`9am summary error: ${error.message}`);
    }
  });

  const noonJob = cron.schedule('0 12 * * *', async () => {
    console.log('Running 12pm task summary...');
    try {
      await sendDailySummary('afternoon');
    } catch (error) {
      console.error(`12pm summary error: ${error.message}`);
    }
  });

  scheduler = { nineAmJob, noonJob };
  console.log('Task Builder scheduler started');
}

function stopScheduler() {
  if (scheduler) {
    scheduler.nineAmJob.stop();
    scheduler.noonJob.stop();
    scheduler = null;
    console.log('Task Builder scheduler stopped');
  }
}

async function sendDailySummary(timeOfDay) {
  try {
    // Get all active tasks
    const tasks = await notionService.getAllActiveTasks();

    if (tasks.length === 0) {
      await telegramService.sendMessage(
        `📭 <b>No active tasks</b> for ${timeOfDay} summary\n\nAll done! 🎉`
      );
      return;
    }

    // Group tasks
    const groups = taskGrouper.groupTasks(tasks);

    // Format message
    const timeEmoji = timeOfDay === 'morning' ? '🌅' : '☀️';
    let message = `${timeEmoji} <b>${timeOfDay === 'morning' ? 'Morning' : 'Afternoon'} Standup</b>\n\n`;

    let totalTasks = 0;
    let flaggedTasks = 0;

    for (const [category, categoryTasks] of Object.entries(groups)) {
      if (categoryTasks.length === 0) continue;

      const flagged = categoryTasks.filter(t => t.flagged).length;
      flaggedTasks += flagged;
      totalTasks += categoryTasks.length;

      message += `<b>${category}</b> (${categoryTasks.length})\n`;

      // Show top 2 per category
      for (const task of categoryTasks.slice(0, 2)) {
        const flag = task.flagged ? '🚩 ' : '  ';
        message += `${flag}• ${task.name}\n`;
      }

      if (categoryTasks.length > 2) {
        message += `  <i>... and ${categoryTasks.length - 2} more</i>\n`;
      }

      message += '\n';
    }

    message += `\n📊 Total: ${totalTasks} tasks (${flaggedTasks} flagged)\n`;
    message += '💡 Use <code>/build</code> to start working\n';

    await telegramService.sendMessage(message);
  } catch (error) {
    console.error(`Error sending daily summary: ${error.message}`);
    await telegramService.sendMessage(
      `⚠️ <b>Error</b> fetching task summary\n\n<code>${error.message}</code>`
    );
  }
}

module.exports = {
  startScheduler,
  stopScheduler,
  sendDailySummary
};
