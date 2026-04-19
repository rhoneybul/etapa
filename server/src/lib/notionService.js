
const NOTION_API_KEY = process.env.NOTION_API_KEY;
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID;
const NOTION_VERSION = '2025-09-03';

async function queryTasks(filters = {}) {
  const { flaggedOnly = false, excludeStatus = ['Done', 'Backlog', 'Waiting'] } = filters;

  let filterQuery;
  if (flaggedOnly) {
    filterQuery = { property: 'Flagged', checkbox: { equals: true } };
  } else {
    filterQuery = {
      and: [
        {
          or: [
            { property: 'Flagged', checkbox: { equals: true } },
            {
              and: excludeStatus.map(status => ({
                property: 'Status',
                status: { does_not_equal: status }
              }))
            }
          ]
        }
      ]
    };
  }

  const response = await fetch(
    `https://api.notion.com/v1/data_sources/${NOTION_DATABASE_ID}/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${NOTION_API_KEY}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ filter: filterQuery })
    }
  );

  if (!response.ok) {
    throw new Error(`Notion API error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.results || [];
}

function formatTask(notionTask) {
  return {
    id: notionTask.id,
    name: notionTask.properties['Task name']?.title?.[0]?.plain_text || 'Untitled',
    status: notionTask.properties.Status?.status?.name || 'Unknown',
    flagged: notionTask.properties.Flagged?.checkbox || false,
    dueDate: notionTask.properties['Due date']?.date?.start || null,
    assignee: notionTask.properties.Assignee?.people?.[0]?.name || null,
    url: notionTask.url
  };
}

async function getTasks(options = {}) {
  const tasks = await queryTasks(options);
  return tasks.map(formatTask);
}

async function getFlaggedTasks() {
  return getTasks({ flaggedOnly: true });
}

async function getActiveTasks() {
  return getTasks({ flaggedOnly: false, excludeStatus: ['Done', 'Backlog', 'Waiting'] });
}

async function getAllActiveTasks() {
  const flagged = await getFlaggedTasks();
  const active = await getActiveTasks();

  // Combine and deduplicate
  const seen = new Set();
  const combined = [];

  for (const task of [...flagged, ...active]) {
    if (!seen.has(task.id)) {
      seen.add(task.id);
      combined.push(task);
    }
  }

  return combined;
}

async function updateTaskStatus(taskId, newStatus) {
  const response = await fetch(`https://api.notion.com/v1/pages/${taskId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${NOTION_API_KEY}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      properties: {
        Status: {
          status: { name: newStatus }
        }
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to update task status: ${response.statusText}`);
  }

  return response.json();
}

module.exports = {
  getTasks,
  getFlaggedTasks,
  getActiveTasks,
  getAllActiveTasks,
  updateTaskStatus,
  formatTask
};
