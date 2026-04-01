/**
 * Support routes — handles reports of wrongly blocked coach chat messages.
 * Creates a Linear issue for review.
 */
const express = require('express');
const router = express.Router();

const LINEAR_API_KEY = process.env.LINEAR_API_KEY || '';
const LINEAR_TEAM_ID = process.env.LINEAR_TEAM_ID || '';

async function createLinearIssue({ title, description, priority }) {
  if (!LINEAR_API_KEY || !LINEAR_TEAM_ID) {
    console.warn('[support] Linear not configured — skipping issue creation');
    return null;
  }

  const mutation = `
    mutation CreateIssue($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue { id identifier url }
      }
    }
  `;

  const variables = {
    input: {
      teamId: LINEAR_TEAM_ID,
      title,
      description,
      priority: priority || 3,
    },
  };

  const res = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: LINEAR_API_KEY,
    },
    body: JSON.stringify({ query: mutation, variables }),
  });

  const json = await res.json();

  if (json.data?.issueCreate?.success) {
    const issue = json.data.issueCreate.issue;
    console.log(`[support] Linear issue created: ${issue.identifier} — ${issue.url}`);
    return issue;
  }

  console.error('[support] Linear issue creation failed:', json.errors || json);
  return null;
}

// POST /api/support/report-blocked — user reports a wrongly blocked coach message
router.post('/report-blocked', async (req, res) => {
  try {
    const userId = req.user?.id;
    const userEmail = req.user?.email || 'Unknown';
    const { message, planId, coachId } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Missing blocked message' });
    }

    const truncated = message.length > 200 ? message.slice(0, 200) + '...' : message;

    const issue = await createLinearIssue({
      title: `\u{1F6A8} [Topic Guard] Wrongly blocked: "${truncated}"`,
      description: [
        '## Wrongly Blocked Coach Chat Message',
        '',
        'A user reported that their message was incorrectly blocked by the topic guard.',
        '',
        '### Blocked message',
        '```',
        message,
        '```',
        '',
        '### Context',
        `| Detail | Value |`,
        `|--------|-------|`,
        `| User | ${userEmail} |`,
        `| User ID | ${userId || 'Unknown'} |`,
        `| Plan ID | ${planId || 'N/A'} |`,
        `| Coach ID | ${coachId || 'N/A'} |`,
        `| Reported at | ${new Date().toISOString()} |`,
        '',
        '### Action required',
        'Review the blocked message and determine if the topic guard classifier needs adjustment.',
      ].join('\n'),
      priority: 3, // High — impacts user experience
    });

    res.json({ ok: true, issueId: issue?.identifier || null });
  } catch (err) {
    console.error('Report blocked error:', err);
    res.status(500).json({ error: 'Failed to submit report' });
  }
});

module.exports = router;
