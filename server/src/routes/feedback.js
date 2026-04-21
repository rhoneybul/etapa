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
const crypto = require('crypto');
const { supabase } = require('../lib/supabase');
const router  = express.Router();

const ATTACHMENT_BUCKET = 'feedback-attachments';
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB per file
const MAX_ATTACHMENTS_PER_FEEDBACK = 6;
const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
]);

/**
 * Build a signed read URL valid for 1 hour. Used in Linear issue descriptions
 * and the admin dashboard. Returns null on failure so the caller can degrade
 * gracefully (render a broken-image placeholder rather than 500).
 */
async function signedDownloadUrl(storagePath, expiresInSeconds = 3600) {
  try {
    const { data, error } = await supabase.storage
      .from(ATTACHMENT_BUCKET)
      .createSignedUrl(storagePath, expiresInSeconds);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}

// ── Slack helper ──────────────────────────────────────────────────────────────
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || process.env.SLACK_SUBSCRIPTIONS_WEBHOOK_URL;

async function notifySlack(text) {
  if (!SLACK_WEBHOOK_URL) return;
  try {
    const _fetch = typeof globalThis.fetch === 'function'
      ? globalThis.fetch
      : (() => { const f = require('node-fetch'); return f.default || f; })();
    await _fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  } catch (err) {
    console.error('[feedback slack] Failed to notify:', err.message);
  }
}

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
async function createLinearIssue({ category, message, appVersion, deviceInfo, userEmail, attachmentUrls = [] }) {
  if (!LINEAR_API_KEY || !LINEAR_TEAM_ID) {
    throw new Error('Linear not configured — set LINEAR_API_KEY and LINEAR_TEAM_ID');
  }

  const categoryLabel = category.charAt(0).toUpperCase() + category.slice(1);
  const title = `[${categoryLabel}] ${message.slice(0, 80)}${message.length > 80 ? '...' : ''}`;

  const parts = [
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
  ];

  if (attachmentUrls.length) {
    parts.push('', '---', '', `### Screenshots (${attachmentUrls.length})`);
    parts.push('_Signed URLs expire in 7 days — re-open the ticket in the admin dashboard for fresh links._', '');
    attachmentUrls.forEach((url, i) => {
      parts.push(`![Screenshot ${i + 1}](${url})`);
    });
  }

  const description = parts.join('\n');

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

// POST /api/feedback/attachment-upload-url
// Reserves a storage path and returns a short-lived signed upload URL.
// The client uploads the file bytes directly to that URL, then includes the
// returned `storagePath` in its subsequent POST /api/feedback payload.
//
// Body: { contentType: 'image/jpeg', sizeBytes: 123456 }
// Returns: { uploadUrl, token, storagePath, expiresIn }
router.post('/attachment-upload-url', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const { contentType, sizeBytes } = req.body || {};

    if (!contentType || !ALLOWED_IMAGE_TYPES.has(contentType)) {
      return res.status(400).json({
        error: `Only image uploads allowed (${Array.from(ALLOWED_IMAGE_TYPES).join(', ')})`,
      });
    }
    if (typeof sizeBytes !== 'number' || sizeBytes <= 0 || sizeBytes > MAX_ATTACHMENT_BYTES) {
      return res.status(400).json({
        error: `File must be 1 byte to ${MAX_ATTACHMENT_BYTES} bytes (got ${sizeBytes})`,
      });
    }

    // Build a path under the user's folder so RLS and folder-based policies work.
    const ext = contentType.split('/')[1] || 'jpg';
    const uuid = crypto.randomUUID();
    const storagePath = `${userId}/pending/${uuid}.${ext}`;

    const { data, error } = await supabase.storage
      .from(ATTACHMENT_BUCKET)
      .createSignedUploadUrl(storagePath);

    if (error || !data?.signedUrl) {
      console.error('[feedback] createSignedUploadUrl failed:', error);
      return res.status(500).json({ error: 'Failed to create upload URL' });
    }

    res.json({
      uploadUrl: data.signedUrl,
      token: data.token,
      storagePath,
      expiresIn: 120, // seconds — Supabase signed upload URLs are short-lived
    });
  } catch (err) {
    console.error('[feedback] upload-url error:', err);
    res.status(500).json({ error: 'Failed to create upload URL' });
  }
});

// POST /api/feedback — submit feedback → create Linear issue → persist to Supabase
router.post('/', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const { category, message, appVersion, deviceInfo, attachments } = req.body;

    if (!category || !message) {
      return res.status(400).json({ error: 'Category and message are required' });
    }

    const valid = ['bug', 'feature', 'support', 'general'];
    if (!valid.includes(category)) {
      return res.status(400).json({ error: `Category must be one of: ${valid.join(', ')}` });
    }

    // Validate attachments (if any). Keep this defensive — attachments are
    // supplied by the client, so we don't trust the shape.
    const cleanAttachments = [];
    if (Array.isArray(attachments)) {
      if (attachments.length > MAX_ATTACHMENTS_PER_FEEDBACK) {
        return res.status(400).json({ error: `Max ${MAX_ATTACHMENTS_PER_FEEDBACK} attachments per feedback` });
      }
      for (const a of attachments) {
        if (!a || typeof a.storagePath !== 'string' || !a.storagePath.startsWith(`${userId}/`)) {
          return res.status(400).json({ error: 'Invalid attachment path' });
        }
        if (!ALLOWED_IMAGE_TYPES.has(a.mimeType)) {
          return res.status(400).json({ error: `Unsupported attachment type: ${a.mimeType}` });
        }
        if (typeof a.sizeBytes !== 'number' || a.sizeBytes <= 0 || a.sizeBytes > MAX_ATTACHMENT_BYTES) {
          return res.status(400).json({ error: 'Attachment size out of range' });
        }
        cleanAttachments.push({
          storagePath: a.storagePath,
          mimeType:    a.mimeType,
          sizeBytes:   a.sizeBytes,
          width:       typeof a.width  === 'number' ? a.width  : null,
          height:      typeof a.height === 'number' ? a.height : null,
        });
      }
    }

    const userEmail = req.user?.email || null;

    // Pre-sign download URLs so Linear issue description can embed images.
    // These expire in 7 days — enough for triage. Admin UI issues fresh URLs
    // when it renders the thread.
    const linearAttachmentLinks = [];
    for (const a of cleanAttachments) {
      const url = await signedDownloadUrl(a.storagePath, 60 * 60 * 24 * 7);
      if (url) linearAttachmentLinks.push(url);
    }

    const issue = await createLinearIssue({
      category,
      message: message.trim(),
      appVersion,
      deviceInfo,
      userEmail,
      attachmentUrls: linearAttachmentLinks,
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

    // Persist attachment rows. Best-effort — if one fails, keep going; we've
    // already created the Linear issue and the feedback row.
    for (const a of cleanAttachments) {
      const attId = `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const { error: attErr } = await supabase.from('feedback_attachments').insert({
        id: attId,
        feedback_id: feedbackId,
        message_id: null,
        user_id: userId,
        storage_path: a.storagePath,
        mime_type: a.mimeType,
        size_bytes: a.sizeBytes,
        width: a.width,
        height: a.height,
      });
      if (attErr) console.error('[feedback] attachment insert failed:', attErr);
    }

    // Notify Slack
    const categoryEmoji = { bug: '🐛', feature: '💡', support: '🆘', general: '💬' }[category] || '📝';
    const preview = message.trim().slice(0, 120) + (message.length > 120 ? '...' : '');
    const attachmentNote = cleanAttachments.length
      ? `\n_${cleanAttachments.length} screenshot${cleanAttachments.length === 1 ? '' : 's'} attached_`
      : '';
    notifySlack(`${categoryEmoji} *New ${category} feedback* from ${userEmail || 'anonymous'}\n>${preview}${attachmentNote}\n<${issue.url}|View in Linear (${issue.identifier})>`);

    res.status(201).json({
      success: true,
      feedbackId,
      attachmentCount: cleanAttachments.length,
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

    // Fetch attachments for this feedback + sign URLs for rendering
    const { data: attachmentRows } = await supabase
      .from('feedback_attachments')
      .select('*')
      .eq('feedback_id', id);

    const attachments = [];
    for (const a of (attachmentRows || [])) {
      const url = await signedDownloadUrl(a.storage_path, 3600);
      attachments.push({
        id: a.id,
        messageId: a.message_id,
        mimeType: a.mime_type,
        sizeBytes: a.size_bytes,
        width: a.width,
        height: a.height,
        url,
      });
    }

    // Group attachments by target (feedback vs message) for easy rendering
    const feedbackAttachments = attachments.filter(a => !a.messageId);
    const messageAttachments = {};
    for (const a of attachments) {
      if (a.messageId) {
        (messageAttachments[a.messageId] = messageAttachments[a.messageId] || []).push(a);
      }
    }

    res.json({
      feedback: {
        id: feedback.id,
        category: feedback.category,
        message: feedback.message,
        status: feedback.status || 'open',
        createdAt: feedback.created_at,
        attachments: feedbackAttachments,
      },
      messages: (messages || []).map(m => ({
        id: m.id,
        senderRole: m.sender_role,
        message: m.message,
        createdAt: m.created_at,
        attachments: messageAttachments[m.id] || [],
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
    const { message, attachments } = req.body;

    // Allow empty message if there's at least one attachment (screenshot-only reply).
    const hasMessage = !!message?.trim();
    const hasAttachments = Array.isArray(attachments) && attachments.length > 0;
    if (!hasMessage && !hasAttachments) {
      return res.status(400).json({ error: 'message or attachments required' });
    }
    if (hasAttachments && attachments.length > MAX_ATTACHMENTS_PER_FEEDBACK) {
      return res.status(400).json({ error: `Max ${MAX_ATTACHMENTS_PER_FEEDBACK} attachments per message` });
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
      message: hasMessage ? message.trim() : '',
    });

    if (insertErr) throw insertErr;

    // Persist attachment rows for this reply (best-effort).
    if (hasAttachments) {
      for (const a of attachments) {
        if (!a?.storagePath?.startsWith(`${userId}/`)) continue;
        if (!ALLOWED_IMAGE_TYPES.has(a.mimeType)) continue;
        if (typeof a.sizeBytes !== 'number' || a.sizeBytes > MAX_ATTACHMENT_BYTES) continue;
        const attId = `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        await supabase.from('feedback_attachments').insert({
          id: attId,
          feedback_id: id,
          message_id: msgId,
          user_id: userId,
          storage_path: a.storagePath,
          mime_type: a.mimeType,
          size_bytes: a.sizeBytes,
          width: typeof a.width === 'number' ? a.width : null,
          height: typeof a.height === 'number' ? a.height : null,
        });
      }
    }

    // Re-open the thread if it was resolved/closed
    await supabase.from('feedback').update({ status: 'open' }).eq('id', id);

    res.json({ ok: true, messageId: msgId });
  } catch (err) {
    console.error('Feedback reply error:', err);
    res.status(500).json({ error: 'Failed to send reply' });
  }
});

module.exports = router;
