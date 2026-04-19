const CONVERSATION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

class ConversationManager {
  constructor() {
    this.conversations = new Map();
    this.cleanupInterval = null;
    this.startCleanupTimer();
  }

  createConversation(userId, initialContext = {}) {
    const conversationId = `conv_${userId}_${Date.now()}`;
    const conversation = {
      id: conversationId,
      userId,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      context: initialContext,
      messages: [],
      selectedTasks: [],
      selectedGroups: [],
      status: 'active'
    };

    this.conversations.set(conversationId, conversation);
    return conversationId;
  }

  addMessage(conversationId, message) {
    const conv = this.conversations.get(conversationId);
    if (!conv) return null;

    conv.lastActivity = Date.now();
    conv.messages.push({
      timestamp: Date.now(),
      ...message
    });

    return conv;
  }

  updateContext(conversationId, updates) {
    const conv = this.conversations.get(conversationId);
    if (!conv) return null;

    conv.lastActivity = Date.now();
    conv.context = { ...conv.context, ...updates };

    return conv;
  }

  selectTasks(conversationId, taskIds) {
    const conv = this.conversations.get(conversationId);
    if (!conv) return null;

    conv.lastActivity = Date.now();
    conv.selectedTasks = taskIds;

    return conv;
  }

  selectGroups(conversationId, groupNames) {
    const conv = this.conversations.get(conversationId);
    if (!conv) return null;

    conv.lastActivity = Date.now();
    conv.selectedGroups = groupNames;

    return conv;
  }

  getConversation(conversationId) {
    const conv = this.conversations.get(conversationId);
    if (!conv) return null;

    // Check if expired
    if (Date.now() - conv.lastActivity > CONVERSATION_TIMEOUT_MS) {
      this.conversations.delete(conversationId);
      return null;
    }

    return conv;
  }

  getActiveConversation(userId) {
    for (const [id, conv] of this.conversations) {
      if (conv.userId === userId && conv.status === 'active') {
        if (Date.now() - conv.lastActivity <= CONVERSATION_TIMEOUT_MS) {
          return id;
        }
      }
    }
    return null;
  }

  closeConversation(conversationId) {
    const conv = this.conversations.get(conversationId);
    if (!conv) return null;

    conv.status = 'closed';
    return conv;
  }

  startCleanupTimer() {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();

      for (const [id, conv] of this.conversations) {
        if (now - conv.lastActivity > CONVERSATION_TIMEOUT_MS) {
          this.conversations.delete(id);
        }
      }
    }, 5 * 60 * 1000); // Run cleanup every 5 minutes
  }

  stopCleanupTimer() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }

  getStats() {
    return {
      totalConversations: this.conversations.size,
      activeConversations: Array.from(this.conversations.values()).filter(c => c.status === 'active').length
    };
  }
}

// Singleton instance
const manager = new ConversationManager();

module.exports = manager;
