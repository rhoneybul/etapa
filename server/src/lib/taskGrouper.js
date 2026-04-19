const CATEGORY_KEYWORDS = {
  'Marketing/Content': [
    'instagram', 'blog', 'newsletter', 'youtube', 'reddit', 'marketing',
    'content', 'social', 'tiktok', 'twitter', 'linkedin', 'podcast',
    'video', 'advertising', 'promotional', 'seo', 'repurposing'
  ],
  'Product Development': [
    'coach', 'plan', 'ui', 'feature', 'session', 'app', 'cycling',
    'readiness', 'goal', 'training', 'activity', 'interface', 'screen',
    'performance', 'speed', 'optimization', 'bug', 'crash', 'error'
  ],
  'Infrastructure/DevOps': [
    'deploy', 'github', 'monitoring', 'sentry', 'railway', 'vercel',
    'aws', 'gcp', 'docker', 'ci/cd', 'pipeline', 'logging', 'analytics',
    'database', 'cache', 'performance', 'scaling', 'incident'
  ],
  'Business/Admin': [
    'stripe', 'payment', 'subscription', 'billing', 'revenue', 'finance',
    'accounting', 'tax', 'insurance', 'legal', 'compliance', 'pricing',
    'contract', 'invoice', 'payroll', 'hr', 'admin'
  ],
  'Compliance/Legal': [
    'legal', 'terms', 'privacy', 'gdpr', 'tos', 'eula', 'license',
    'compliance', 'regulations', 'data', 'security', 'permissions',
    'accessibility', 'audit', 'certifications'
  ],
  'Website': [
    'landing', 'website', 'web', 'domain', 'hosting', 'dns', 'ssl',
    'seo', 'analytics', 'conversion', 'cta', 'page', 'homepage'
  ]
};

function categorizeTask(taskName) {
  const lowerName = taskName.toLowerCase();

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lowerName.includes(keyword)) {
        return category;
      }
    }
  }

  // Default category
  return 'Other';
}

function groupTasks(tasks) {
  const groups = {};

  for (const task of tasks) {
    const category = categorizeTask(task.name);

    if (!groups[category]) {
      groups[category] = [];
    }

    groups[category].push(task);
  }

  // Sort tasks within each group: flagged first, then by status priority
  const statusPriority = { 'To do': 0, 'In progress': 1, Agents: 2, Testing: 3 };

  for (const category in groups) {
    groups[category].sort((a, b) => {
      // Flagged tasks come first
      if (a.flagged !== b.flagged) {
        return b.flagged ? 1 : -1;
      }

      // Then sort by status priority
      const priorityA = statusPriority[a.status] ?? 999;
      const priorityB = statusPriority[b.status] ?? 999;
      return priorityA - priorityB;
    });
  }

  return groups;
}

function formatGroupSummary(groups) {
  let summary = '📋 <b>Task Summary</b>\n\n';

  for (const [category, tasks] of Object.entries(groups)) {
    const flaggedCount = tasks.filter(t => t.flagged).length;
    summary += `<b>${category}</b> (${tasks.length})\n`;

    for (const task of tasks.slice(0, 3)) {
      const flag = task.flagged ? '🚩 ' : '  ';
      summary += `${flag}• ${task.name}\n`;
    }

    if (tasks.length > 3) {
      summary += `  ... and ${tasks.length - 3} more\n`;
    }

    summary += '\n';
  }

  return summary;
}

function getTopPrioritiesByGroup(groups, limit = 3) {
  const topGroups = {};

  for (const [category, tasks] of Object.entries(groups)) {
    if (tasks.length === 0) continue;

    // Take flagged items first, then top items by status
    const flagged = tasks.filter(t => t.flagged);
    const nonFlagged = tasks.filter(t => !t.flagged);

    topGroups[category] = {
      flagged: flagged.slice(0, limit),
      other: nonFlagged.slice(0, limit - flagged.length)
    };
  }

  return topGroups;
}

module.exports = {
  categorizeTask,
  groupTasks,
  formatGroupSummary,
  getTopPrioritiesByGroup
};
