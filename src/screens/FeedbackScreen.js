/**
 * FeedbackScreen — shows existing feedback threads and lets the user submit new feedback.
 * Each feedback item opens a chat-style support thread (SupportChatScreen).
 * After submitting new feedback, navigates directly to the chat with a 48h response message.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { colors, fontFamily } from '../theme';
import { api } from '../services/api';
import analytics from '../services/analyticsService';

const FF = fontFamily;

const CATEGORIES = [
  { id: 'bug',     label: 'Bug Report' },
  { id: 'feature', label: 'Feature Request' },
  { id: 'support', label: 'Support' },
  { id: 'general', label: 'General Feedback' },
];

const CATEGORY_LABELS = {
  bug: 'Bug Report',
  feature: 'Feature Request',
  support: 'Support',
  general: 'Feedback',
};

const PLACEHOLDERS = {
  bug:     'What happened? What did you expect to happen instead?',
  feature: 'What would you like to see in Etapa?',
  support: 'What do you need help with?',
  general: 'We\u2019d love to hear from you. What\u2019s on your mind?',
};

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function FeedbackScreen({ navigation }) {
  const [existingFeedback, setExistingFeedback] = useState([]);
  const [loadingExisting, setLoadingExisting] = useState(true);
  const [category, setCategory] = useState(null);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const appVersion = Constants.expoConfig?.version || '0.0.0';
  const deviceInfo = `${Platform.OS} ${Platform.Version}`;

  const fetchExisting = useCallback(async () => {
    try {
      const items = await api.feedback.list();
      setExistingFeedback(Array.isArray(items) ? items : []);
    } catch {
      // Silently fail — user can still submit new feedback
    }
    setLoadingExisting(false);
  }, []);

  useEffect(() => { fetchExisting(); }, [fetchExisting]);

  // Refresh when navigating back from a chat
  useEffect(() => {
    const unsub = navigation.addListener('focus', fetchExisting);
    return unsub;
  }, [navigation, fetchExisting]);

  const handleSubmit = async () => {
    if (!category) {
      Alert.alert('Choose a category', 'Please select what type of feedback you\u2019re sending.');
      return;
    }
    if (!message.trim()) {
      Alert.alert('Add a message', 'Please describe your feedback before submitting.');
      return;
    }

    setSubmitting(true);
    try {
      await api.feedback.submit({
        category,
        message: message.trim(),
        appVersion,
        deviceInfo,
      });
      analytics.events.feedbackSubmitted(category);

      // Reset form and show thanks
      setCategory(null);
      setMessage('');
      setSubmitted(true);

      // Refresh the list in background
      const items = await api.feedback.list();
      setExistingFeedback(Array.isArray(items) ? items : []);

      // Auto-dismiss thanks after 3 seconds
      setTimeout(() => setSubmitted(false), 3000);
    } catch (err) {
      Alert.alert('Error', 'Failed to submit feedback. Please try again.');
    }
    setSubmitting(false);
  };

  const openThread = (item) => {
    navigation.navigate('SupportChat', { feedbackId: item.id, isNew: false });
  };

  return (
    <View style={s.container}>
      <SafeAreaView style={s.safe}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={s.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Header */}
            <View style={s.header}>
              <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT}>
                <Text style={s.backArrow}>{'\u2190'}</Text>
              </TouchableOpacity>
              <Text style={s.headerTitle}>Feedback & Support</Text>
              <View style={{ width: 32 }} />
            </View>

            {/* Existing feedback threads */}
            {!loadingExisting && existingFeedback.length > 0 && (
              <>
                <Text style={s.sectionLabel}>YOUR CONVERSATIONS</Text>
                <View style={s.threadList}>
                  {existingFeedback.map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      style={s.threadCard}
                      onPress={() => openThread(item)}
                      activeOpacity={0.7}
                    >
                      <View style={s.threadTop}>
                        <View style={[s.threadBadge, item.status === 'resolved' && s.threadBadgeResolved]}>
                          <Text style={[s.threadBadgeText, item.status === 'resolved' && s.threadBadgeTextResolved]}>
                            {CATEGORY_LABELS[item.category] || item.category}
                          </Text>
                        </View>
                        <Text style={s.threadTime}>{timeAgo(item.createdAt)}</Text>
                      </View>
                      <Text style={s.threadMessage} numberOfLines={2}>{item.message}</Text>
                      {item.adminResponse && (
                        <View style={s.threadReplyRow}>
                          <View style={s.threadReplyDot} />
                          <Text style={s.threadReplyText} numberOfLines={1}>
                            {item.adminResponse}
                          </Text>
                        </View>
                      )}
                      {item.status === 'resolved' && (
                        <Text style={s.threadResolvedLabel}>Resolved</Text>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {loadingExisting && (
              <View style={s.loadingRow}>
                <ActivityIndicator color={colors.textMuted} size="small" />
              </View>
            )}

            {/* Thanks confirmation */}
            {submitted && (
              <View style={s.thanksCard}>
                <Text style={s.thanksCheck}>{'\u2713'}</Text>
                <Text style={s.thanksText}>Thanks for the feedback!</Text>
              </View>
            )}

            {/* New feedback form */}
            {!submitted && (
              <>
                <Text style={s.sectionLabel}>
                  {existingFeedback.length > 0 ? 'SEND NEW FEEDBACK' : "WHAT'S THIS ABOUT?"}
                </Text>

                <View style={s.categories}>
                  {CATEGORIES.map((cat) => (
                    <TouchableOpacity
                      key={cat.id}
                      style={[s.catCard, category === cat.id && s.catCardActive]}
                      onPress={() => setCategory(cat.id)}
                      activeOpacity={0.7}
                    >
                      <View style={s.catText}>
                        <Text style={[s.catLabel, category === cat.id && s.catLabelActive]}>
                          {cat.label}
                        </Text>
                      </View>
                      {category === cat.id && (
                        <Text style={s.catCheck}>{'\u2713'}</Text>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {/* Message input */}
            {!submitted && category && (
              <>
                <Text style={s.sectionLabel}>DETAILS</Text>
                <TextInput
                  style={s.input}
                  placeholder={PLACEHOLDERS[category]}
                  placeholderTextColor={colors.textFaint}
                  multiline
                  textAlignVertical="top"
                  value={message}
                  onChangeText={setMessage}
                  maxLength={2000}
                  autoFocus
                />
                <Text style={s.charCount}>{message.length}/2000</Text>
              </>
            )}

            {/* Submit */}
            {!submitted && category && (
              <TouchableOpacity
                style={[s.submitBtn, (!message.trim() || submitting) && s.submitBtnDisabled]}
                onPress={handleSubmit}
                disabled={!message.trim() || submitting}
                activeOpacity={0.8}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={s.submitBtnText}>Submit Feedback</Text>
                )}
              </TouchableOpacity>
            )}

            {/* Version info */}
            <Text style={s.versionText}>
              Etapa v{appVersion} {'\u00B7'} {deviceInfo}
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const HIT = { top: 12, bottom: 12, left: 12, right: 12 };

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },
  scroll: { paddingBottom: 40 },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  backArrow: { fontSize: 22, color: colors.text, width: 32 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, textAlign: 'center' },

  subtitle: { fontSize: 14, fontFamily: FF.regular, color: colors.textMid, paddingHorizontal: 20, marginBottom: 16, lineHeight: 20 },

  sectionLabel: {
    fontSize: 11, fontWeight: '600', fontFamily: FF.semibold, color: colors.textMuted,
    letterSpacing: 0.6, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 10,
  },

  loadingRow: { paddingVertical: 20, alignItems: 'center' },

  // Existing feedback threads
  threadList: { paddingHorizontal: 16, gap: 8, marginBottom: 8 },
  threadCard: {
    backgroundColor: colors.surface, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: colors.border,
  },
  threadTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  threadBadge: {
    backgroundColor: 'rgba(232,69,139,0.12)', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  threadBadgeResolved: { backgroundColor: 'rgba(232,69,139,0.1)' },
  threadBadgeText: { fontSize: 10, fontWeight: '600', fontFamily: FF.semibold, color: colors.primary, textTransform: 'uppercase', letterSpacing: 0.4 },
  threadBadgeTextResolved: { color: '#E8458B' },
  threadTime: { fontSize: 11, fontFamily: FF.regular, color: colors.textFaint },
  threadMessage: { fontSize: 14, fontFamily: FF.regular, color: colors.text, lineHeight: 20 },
  threadReplyRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  threadReplyDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary },
  threadReplyText: { flex: 1, fontSize: 12, fontFamily: FF.regular, color: colors.primary },
  threadResolvedLabel: {
    fontSize: 10, fontWeight: '600', fontFamily: FF.semibold, color: '#E8458B',
    marginTop: 6, textTransform: 'uppercase', letterSpacing: 0.4,
  },

  // Category picker
  categories: { paddingHorizontal: 16, gap: 8 },
  catCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface,
    borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border,
  },
  catCardActive: { borderColor: colors.primary, backgroundColor: '#1A120A' },
  catText: { flex: 1, marginLeft: 8 },
  catLabel: { fontSize: 15, fontWeight: '500', fontFamily: FF.medium, color: colors.text },
  catLabelActive: { color: colors.primary },
  catDesc: { fontSize: 12, fontFamily: FF.regular, color: colors.textMuted, marginTop: 2 },
  catCheck: { fontSize: 16, color: colors.primary, fontWeight: '700', marginLeft: 8 },

  input: {
    marginHorizontal: 16, backgroundColor: colors.surface, borderRadius: 14,
    borderWidth: 1, borderColor: colors.border, padding: 16,
    fontSize: 15, fontFamily: FF.regular, color: colors.text,
    minHeight: 120, maxHeight: 250,
  },
  charCount: { fontSize: 11, fontFamily: FF.regular, color: colors.textFaint, textAlign: 'right', paddingHorizontal: 20, marginTop: 4 },

  submitBtn: {
    marginHorizontal: 16, marginTop: 20, backgroundColor: colors.primary,
    borderRadius: 14, paddingVertical: 16, alignItems: 'center',
  },
  submitBtnDisabled: { opacity: 0.4 },
  submitBtnText: { fontSize: 16, fontWeight: '600', fontFamily: FF.semibold, color: '#fff' },

  thanksCard: {
    marginHorizontal: 16, marginTop: 20, backgroundColor: 'rgba(232,69,139,0.1)',
    borderRadius: 14, padding: 24, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(232,69,139,0.2)',
  },
  thanksCheck: { fontSize: 32, color: '#E8458B', fontWeight: '700', marginBottom: 8 },
  thanksText: { fontSize: 16, fontWeight: '600', fontFamily: FF.semibold, color: '#E8458B' },

  versionText: { fontSize: 11, fontFamily: FF.regular, color: colors.textFaint, textAlign: 'center', marginTop: 20 },
});
