const { supabase } = require('./supabase');

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID;

// Create todo in Notion
async function createTodo(title, properties = {}) {
  if (!NOTION_API_KEY || !NOTION_DATABASE_ID) {
    throw new Error('Notion configuration missing');
  }

  const response = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${NOTION_API_KEY}`,
      'Notion-Version': '2025-09-03',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      parent: { database_id: NOTION_DATABASE_ID },
      properties: {
        Name: { title: [{ text: { content: title } }] },
        Status: { status: { name: 'To do' } },
        ...properties,
      },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Notion API error: ${response.status} ${err}`);
  }

  return response.json();
}

// Get todos created today
async function getTodosCreatedToday() {
  const today = new Date().toISOString().split('T')[0];

  return queryTodos({
    filter: {
      and: [
        {
          property: 'Created',
          date: {
            on_or_after: today,
          },
        },
      ],
    },
  });
}

// Get next flagged task
async function getNextFlaggedTask() {
  const tasks = await queryTodos({
    filter: {
      and: [
        {
          property: 'Flagged',
          checkbox: { equals: true },
        },
        {
          property: 'Status',
          status: { does_not_equal: 'Done' },
        },
      ],
    },
    sorts: [
      { property: 'Priority', direction: 'descending' },
      { property: 'Created', direction: 'ascending' },
    ],
    page_size: 1,
  });

  return tasks[0] || null;
}

// Get all active todos
async function getAllActiveTodos() {
  return queryTodos({
    filter: {
      property: 'Status',
      status: { does_not_equal: 'Done' },
    },
  });
}

// Update todo status
async function updateTodoStatus(pageId, status) {
  const response = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${NOTION_API_KEY}`,
      'Notion-Version': '2025-09-03',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: {
        Status: { status: { name: status } },
      },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Notion API error: ${response.status} ${err}`);
  }

  return response.json();
}

// Auto-backlog old tasks
async function autoBacklogOldTasks(daysThreshold = 7) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysThreshold);
  const cutoffISO = cutoffDate.toISOString().split('T')[0];

  const oldTasks = await queryTodos({
    filter: {
      and: [
        {
          property: 'Status',
          status: { does_not_equal: 'Done' },
        },
        {
          property: 'Status',
          status: { does_not_equal: 'Backlog' },
        },
        {
          property: 'Created',
          date: { before: cutoffISO },
        },
        {
          property: 'Flagged',
          checkbox: { equals: false },
        },
      ],
    },
  });

  const backlogs = [];
  for (const task of oldTasks) {
    try {
      await updateTodoStatus(task.id, 'Backlog');
      backlogs.push(task);
    } catch (err) {
      console.error(`Failed to backlog task ${task.id}:`, err.message);
    }
  }

  return backlogs;
}

// Query todos with filters
async function queryTodos(queryParams) {
  if (!NOTION_API_KEY || !NOTION_DATABASE_ID) {
    throw new Error('Notion configuration missing');
  }

  const response = await fetch(
    `https://api.notion.com/v1/databases/${NOTION_DATABASE_ID}/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${NOTION_API_KEY}`,
        'Notion-Version': '2025-09-03',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(queryParams || {}),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Notion API error: ${response.status} ${err}`);
  }

  const data = await response.json();
  return data.results.map(formatTodo);
}

// Format Notion page to todo object
function formatTodo(page) {
  const props = page.properties || {};

  return {
    id: page.id,
    url: page.url,
    title: props.Name?.title?.[0]?.text?.content || 'Untitled',
    status: props.Status?.status?.name || 'To do',
    flagged: props.Flagged?.checkbox === true,
    priority: props.Priority?.select?.name || null,
    dueDate: props.Due?.date?.start || null,
    createdTime: page.created_time,
    lastEditedTime: page.last_edited_time,
  };
}

module.exports = {
  createTodo,
  getTodosCreatedToday,
  getNextFlaggedTask,
  getAllActiveTodos,
  updateTodoStatus,
  autoBacklogOldTasks,
  queryTodos,
  formatTodo,
};
