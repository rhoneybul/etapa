/**
 * SupportChatScreen — chat-style thread for a single feedback item.
 * Shows the original feedback message, all replies, and lets the user respond.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  TextInput, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontFamily } from '../theme';
import { api } from '../services/api';

const FF = fontFamily;

const CATEGORY_LABELS = {
  bug: 'Bug Report',
  feature: 'Feature Request',
  support: 'Support',
  general: 'Feedback',
};

export default function SupportChatScreen({ navigation, route }) {
  const feedbackId = route.params?.feedbackId;
  const isNew = route.params?.isNew || false; // just submitted — show welcome message
  const [thread, setThread] = useState(null);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);

  const fetchThread = useCallback(async () => {
    try {
      const data = await api.feedback.messages(feedbackId);
      setThread(data);
    } catch {
      // handle error
    }
    setLoading(false);
  }, [feedbackId]);

  useEffect(() => {
    fetchThread();
  }, [fetchThread]);

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150);
  }, [thread]);

  const handleSend = async () => {
    if (!input.trim() || sending) return;
    setSending(true);
    try {
      await api.feedback.reply(feedbackId, input.trim());
      setInput('');
      await fetchThread();
    } catch {
      // handle error
    }
    setSending(false);
  };

  const categoryLabel = thread?.feedback?.category
    ? (CATEGORY_LABELS[thread.feedback.category] || thread.feedback.category)
    : '';

  return (
    <View style={s.container}>
      <SafeAreaView style={s.safe}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT}>
            <Text style={s.backArrow}>{'\u2190'}</Text>
          </TouchableOpacity>
          <View style={s.headerCenter}>
            <Text style={s.headerTitle}>Support</Text>
            {categoryLabel ? <Text style={s.headerSub}>{categoryLabel}</Text> : null}
          </View>
          <View style={{ width: 32 }} />
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
          {/* Messages */}
          <ScrollView
            ref={scrollRef}
            style={s.messageList}
            contentContainerStyle={s.messageContent}
            showsVerticalScrollIndicator={false}
          >
            {loading ? (
              <View style={s.loadingWrap}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : (
              <>
                {/* System welcome / 48h message */}
                {isNew && (
                  <View style={s.systemBubble}>
                    <Text style={s.systemText}>
                      Thanks for your feedback! We aim to respond to all messages within 48 hours. You'll get a notification when we reply.
                    </Text>
                  </View>
                )}

                {/* Original feedback message */}
                {thread?.feedback && (
                  <View style={[s.bubble, s.bubbleUser]}>
                    <Text style={[s.bubbleText, s.bubbleTextUser]}>
                      {thread.feedback.message}
                    </Text>
                    <Text style={s.bubbleTime}>
                      {new Date(thread.feedback.createdAt).toLocaleDateString(undefined, {
                        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                      })}
                    </Text>
                  </View>
                )}

                {/* Thread messages */}
                {thread?.messages?.map((msg) => {
                  const isUser = msg.senderRole === 'user';
                  return (
                    <View key={msg.id}>
                      {!isUser && (
                        <Text style={s.adminLabel}>Etapa Support</Text>
                      )}
                      <View style={[s.bubble, isUser ? s.bubbleUser : s.bubbleAdmin]}>
                        <Text style={[s.bubbleText, isUser ? s.bubbleTextUser : s.bubbleTextAdmin]}>
                          {msg.message}
                        </Text>
                        <Text style={[s.bubbleTime, !isUser && s.bubbleTimeAdmin]}>
                          {new Date(msg.createdAt).toLocaleDateString(undefined, {
                            day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                          })}
                        </Text>
                      </View>
                    </View>
                  );
                })}

                {/* If no replies yet and not new, show waiting message */}
                {!isNew && thread?.messages?.length === 0 && (
                  <View style={s.systemBubble}>
                    <Text style={s.systemText}>
                      We aim to respond to all messages within 48 hours. You'll get a notification when we reply.
                    </Text>
                  </View>
                )}

                <View style={{ height: 16 }} />
              </>
            )}
          </ScrollView>

          {/* Input bar */}
          <View style={s.inputBar}>
            <TextInput
              style={s.input}
              value={input}
              onChangeText={setInput}
              placeholder="Send a message..."
              placeholderTextColor={colors.textFaint}
              multiline
              maxLength={1000}
              editable={!sending}
              returnKeyType="default"
            />
            <TouchableOpacity
              style={[s.sendBtn, (!input.trim() || sending) && s.sendBtnDisabled]}
              onPress={handleSend}
              disabled={!input.trim() || sending}
            >
              {sending
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={s.sendBtnText}>{'\u2191'}</Text>
              }
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const HIT = { top: 12, bottom: 12, left: 12, right: 12 };

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },

  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backArrow: { fontSize: 22, color: colors.text, width: 32 },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '600', fontFamily: FF.semibold, color: colors.text },
  headerSub: { fontSize: 12, fontWeight: '500', fontFamily: FF.medium, color: colors.primary, marginTop: 1 },

  messageList: { flex: 1 },
  messageContent: { paddingHorizontal: 16, paddingTop: 16 },

  loadingWrap: { paddingTop: 40, alignItems: 'center' },

  // System message (welcome / 48h notice)
  systemBubble: {
    alignSelf: 'center', maxWidth: '90%', marginBottom: 16,
    backgroundColor: 'rgba(217,119,6,0.08)', borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 12,
    borderWidth: 1, borderColor: 'rgba(217,119,6,0.15)',
  },
  systemText: {
    fontSize: 13, fontFamily: FF.regular, color: colors.textMid,
    textAlign: 'center', lineHeight: 19,
  },

  // Bubbles
  bubble: {
    marginBottom: 10, maxWidth: '85%', borderRadius: 16,
    paddingHorizontal: 16, paddingVertical: 12,
  },
  bubbleUser: {
    alignSelf: 'flex-end', backgroundColor: colors.primary,
    borderBottomRightRadius: 4,
  },
  bubbleAdmin: {
    alignSelf: 'flex-start', backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: 4,
  },
  bubbleText: { fontSize: 15, fontFamily: FF.regular, lineHeight: 22 },
  bubbleTextUser: { color: '#fff' },
  bubbleTextAdmin: { color: colors.textMid },
  bubbleTime: {
    fontSize: 10, fontFamily: FF.regular, color: 'rgba(255,255,255,0.5)',
    marginTop: 4, alignSelf: 'flex-end',
  },
  bubbleTimeAdmin: { color: colors.textFaint, alignSelf: 'flex-start' },
  adminLabel: {
    fontSize: 10, fontWeight: '600', fontFamily: FF.semibold,
    color: colors.primary, marginBottom: 4, marginLeft: 4,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },

  // Input bar
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border,
  },
  input: {
    flex: 1, backgroundColor: colors.bg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    color: colors.text, fontFamily: FF.regular, fontSize: 15, maxHeight: 100,
    borderWidth: 1, borderColor: colors.border,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.3 },
  sendBtnText: { fontSize: 20, color: '#fff', fontWeight: '700' },
});
