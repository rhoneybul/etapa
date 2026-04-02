/**
 * Feedback routes — submit bug reports, feature requests, and support messages.
 * Creates a Linear issue for each submission AND persists to Supabase feedback table.
 *
 * Env vars:
 *   LINEAR_API_KEY   — Linear personal or OAuth API key
 *   LINEAR_TEAM_ID   — Linear team ID to create issues in
 *
 * Optional:
 *   LINEAR_BUG_LABEL_ID     — Linear label ID for bugs
 *   LINEAR_FEATURE_LABEL_ID — Linear label ID for feature requests
 *   LINEAR_SUPPORT_LABEL_ID — Linear label ID for support
 */
const express = require('express');
const { supabase } = require('../lib/supabase');
const router  = express.Router();

const LINEAR_API_KEY   = process.env.LINEAR_API_KEY || '';
const LINEAR_TEAM_ID   = process.env.LINEAR_TEAM_ID || '';

// Map feedback categories to Linear label IDs (optional — set in .env)
const LABEL_MAP = {
  bug:     process.env.LINEAR_BUG_LABEL_ID     || null,
  feature: process.env.LINEAR_FEATURE_LABEL_ID || null,
  support: process.env.LINEAR_SUPPORT_LABEL_ID || null,
  general: null,
};

// Priority mapping: bugs = urgent(2), support = high(3), feature = medium(4), general = low(0)
const PRIORITY_MAP = {
  bug:     2,
  support: 3,
  feature: 4,
  general: 0,
};

/**
 * Create a Linear issue via the GraphQL API.
 */
async function createLinearIssue({ category, message, appVersion, deviceInfo, userEmail }) {
  if (!LINEAR_API_KEY || !LINEAR_TEAM_ID) {
    throw new Error('Linear not configured — set LINEAR_API_KEY and LINEAR_TEAM_ID');
  }

  const categoryLabel = category.charAt(0).toUpperCase() + category.slice(1);
  const title = `[${categoryLabel}] ${message.slice(0, 80)}${message.length > 80 ? '...' : ''}`;

  const description = [
    `## User Feedback — ${categoryLabel}`,
    '',
    message,
    '',
    '---',
    '',
    '| Detail | Value |',
    '|--------|-------|',
    `| Category | ${categoryLabel} |`,
    `| App Version | ${appVersion || 'Unknown'} |`,
    `| Device | ${deviceInfo || 'Unknown'} |`,
    `| User | ${userEmail || 'Unknown'} |`,
    `| Submitted | ${new Date().toISOString()} |`,
  ].join('\n');

  const labelIds = LABEL_MAP[category] ? [LABEL_MAP[category]] : [];

  const mutation = `
    mutation CreateIssue($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue {
          id
          identifier
          url
        }
      }
    }
  `;

  const variables = {
    input: {
      teamId:      LINEAR_TEAM_ID,
      title,
      description,
      priority:    PRIORITY_MAP[category] || 0,
      ...(labelIds.length > 0 ? { labelIds } : {}),
    },
  };

  const res = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': LINEAR_API_KEY,
    },
    body: JSON.stringify({ query: mutation, variables }),
  });

  const json = await res.json();

  if (json.data?.issueCreate?.success) {
    const issue = json.data.issueCreate.issue;
    console.log(`[feedback] Linear issue created: ${issue.identifier} — ${issue.url}`);
    return issue;
  }

  throw new Error(`Linear issue creation failed: ${JSON.stringify(json.errors || json)}`);
}

// POST /api/feedback — submit feedback → create Linear issue → persist to Supabase
router.post('/', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const { category, message, appVersion, deviceInfo } = req.body;

    if (!category || !message) {
      return res.status(400).json({ error: 'Category and message are required' });
    }

    const valid = ['bug', 'feature', 'support', 'general'];
    if (!valid.includes(category)) {
      return res.status(400).json({ error: `Category must be one of: ${valid.join(', ')}` });
    }

    const userEmail = req.user?.email || null;
    const issue = await createLinearIssue({
      category,
      message: message.trim(),
      appVersion,
      deviceInfo,
      userEmail,
    });

    // Persist feedback to Supabase with Linear reference
    const feedbackId = `fb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const { error: dbError } = await supabase.from('feedback').insert({
      id: feedbackId,
      user_id: userId,
      category,
      message: message.trim(),
      app_version: appVersion || null,
      device_info: deviceInfo || null,
      linear_issue_id: issue.id,
      linear_issue_key: issue.identifier,
      linear_issue_url: issue.url,
    });

    if (dbError) {
      console.error('[feedback] Failed to persist to DB (Linear issue was still created):', dbError);
    }

    res.status(201).json({
      success: true,
      issue: {
        id:         issue.id,
        identifier: issue.identifier,
        url:        issue.url,
      },
    });
  } catch (err) {
    console.error('Feedback submit error:', err);
    res.status(500).json({ error: 'Failed to submit feedback' });
  }
});

// GET /api/feedback — list all feedback submitted by the current user
router.get('/', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const { data: items, error } = await supabase
      .from('feedback')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json((items || []).map(f => ({
      id: f.id,
      category: f.category,
      message: f.message,
      status: f.status || 'open',
      adminResponse: f.admin_response || null,
      createdAt: f.created_at,
    })));
  } catch (err) {
    console.error('Feedback list error:', err);
    res.status(500).json({ error: 'Failed to fetch feedback' });
  }
});

// GET /api/feedback/:id/messages — list all messages in a thread (user-facing)
router.get('/:id/messages', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const { id } = req.params;

    // Verify the feedback belongs to the user
    const { data: feedback, error: fbErr } = await supabase
      .from('feedback')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (fbErr || !feedback) {
      return res.status(404).json({ error: 'Feedback not found' });
    }

    const { data: messages, error: msgErr } = await supabase
      .from('support_messages')
      .select('*')
      .eq('feedback_id', id)
      .order('created_at', { ascending: true });

    if (msgErr) throw msgErr;

    res.json({
      feedback: {
        id: feedback.id,
        category: feedback.category,
        message: feedback.message,
        status: feedback.status || 'open',
        createdAt: feedback.created_at,
      },
      messages: (messages || []).map(m => ({
        id: m.id,
        senderRole: m.sender_role,
        message: m.message,
        createdAt: m.created_at,
      })),
    });
  } catch (err) {
    console.error('Feedback messages error:', err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// POST /api/feedback/:id/messages — user replies to a support thread
router.post('/:id/messages', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const { id } = req.params;
    const { message } = req.body;

    if (!message?.trim()) {
      return res.status(400).json({ error: 'message is required' });
    }

    // Verify the feedback belongs to the user
    const { data: feedback, error: fbErr } = await supabase
      .from('feedback')
      .select('id, user_id')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (fbErr || !feedback) {
      return res.status(404).json({ error: 'Feedback not found' });
    }

    const msgId = `sm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const { error: insertErr } = await supabase.from('support_messages').insert({
      id: msgId,
      feedback_id: id,
      sender_role: 'user',
      sender_id: userId,
      message: message.trim(),
    });

    if (insertErr) throw insertErr;

    // Re-open the thread if it was resolved/closed
    await supabase.from('feedback').update({ status: 'open' }).eq('id', id);

    res.json({ ok: true, messageId: msgId });
  } catch (err) {
    console.error('Feedback reply error:', err);
    res.status(500).json({ error: 'Failed to send reply' });
  }
});

module.exports = router;
