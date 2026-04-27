/**
 * Change Coach — lets the user switch coach persona for their active plan.
 * Updates the plan config's coachId so all future AI interactions use the new coach.
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fontFamily, BOTTOM_INSET } from '../theme';
import { COACHES } from '../data/coaches';
import { getPlans, getPlanConfig, updatePlanConfig } from '../services/storageService';
import analytics from '../services/analyticsService';

const FF = fontFamily;

export default function ChangeCoachScreen({ navigation }) {
  const [currentCoachId, setCurrentCoachId] = useState(null);
  const [selectedCoachId, setSelectedCoachId] = useState(null);
  const [configId, setConfigId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const plans = await getPlans();
      if (plans.length > 0) {
        const plan = plans[0]; // active plan
        if (plan.configId) {
          const cfg = await getPlanConfig(plan.configId);
          if (cfg) {
            setConfigId(cfg.id);
            setCurrentCoachId(cfg.coachId || null);
            setSelectedCoachId(cfg.coachId || null);
          }
        }
      }
      setLoading(false);
    })();
  }, []);

  const hasChanged = selectedCoachId && selectedCoachId !== currentCoachId;

  const handleSave = async () => {
    if (!configId || !selectedCoachId || saving) return;
    setSaving(true);
    try {
      await updatePlanConfig(configId, { coachId: selectedCoachId });
      analytics.events.coachSelected(selectedCoachId);
      analytics.track('coach_changed', { from: currentCoachId, to: selectedCoachId });
      setCurrentCoachId(selectedCoachId);
      Alert.alert(
        'Coach updated',
        `${COACHES.find(c => c.id === selectedCoachId)?.name} is now your coach. Your next chat and plan edits will use their style.`,
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
    } catch (err) {
      Alert.alert('Error', 'Failed to update coach. Please try again.');
    }
    setSaving(false);
  };

  if (loading) return <View style={s.container} />;

  if (!configId) {
    return (
      <View style={s.container}>
        <SafeAreaView style={s.safe}>
          <View style={s.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT}>
              <Text style={s.backArrow}>{'\u2190'}</Text>
            </TouchableOpacity>
            <Text style={s.headerTitle}>Change Coach</Text>
            <View style={{ width: 32 }} />
          </View>
          <View style={s.emptyContainer}>
            <Text style={s.emptyText}>Create a plan first to choose a coach.</Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <SafeAreaView style={s.safe}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT}>
            <Text style={s.backArrow}>{'\u2190'}</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>Change Coach</Text>
          <View style={{ width: 32 }} />
        </View>

        <Text style={s.subtitle}>
          Pick a new coaching personality. This changes the tone, style, and nationality of your AI coach across chat, plan edits, and activity suggestions. Each coach also lists the languages they reply in — switch language any time inside chat.
        </Text>

        <ScrollView
          style={s.scroll}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={s.scrollContent}
        >
          {COACHES.map(coach => {
            const selected = selectedCoachId === coach.id;
            const isCurrent = currentCoachId === coach.id;
            return (
              <TouchableOpacity
                key={coach.id}
                style={[s.coachCard, selected && s.coachCardSelected]}
                onPress={() => setSelectedCoachId(coach.id)}
                activeOpacity={0.8}
              >
                <View style={[s.coachAvatar, { backgroundColor: coach.avatarColor }]}>
                  <Text style={s.coachAvatarText}>{coach.avatarInitials}</Text>
                </View>
                <View style={s.coachInfo}>
                  <View style={s.coachNameRow}>
                    <Text style={[s.coachName, selected && s.coachNameSelected]}>
                      {coach.name} {coach.surname}
                    </Text>
                    <Text style={s.coachPronouns}>{coach.pronouns}</Text>
                    {isCurrent && (
                      <View style={s.currentBadge}>
                        <Text style={s.currentBadgeText}>Current</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[s.coachTagline, selected && s.coachTaglineSelected]}>
                    {coach.tagline}
                  </Text>
                  <Text style={s.coachBio} numberOfLines={2}>{coach.bio}</Text>
                  <View style={s.coachBadgeRow}>
                    <View style={s.coachLevelBadge}>
                      <MaterialCommunityIcons
                        name={coach.level === 'beginner' ? 'bike' : coach.level === 'intermediate' ? 'speedometer-medium' : 'speedometer'}
                        size={12}
                        color={colors.textMuted}
                        style={{ marginRight: 4 }}
                      />
                      <Text style={s.coachLevelText}>
                        {coach.level === 'beginner' ? 'Great for beginners'
                          : coach.level === 'intermediate' ? 'Intermediate+'
                          : 'Advanced+'}
                      </Text>
                    </View>
                    {coach.nationality && (
                      <View style={s.coachLevelBadge}>
                        {coach.countryCode ? (
                          <Text style={s.coachCountryCode}>{coach.countryCode}</Text>
                        ) : (
                          <MaterialCommunityIcons
                            name="earth"
                            size={12}
                            color={colors.textMuted}
                            style={{ marginRight: 4 }}
                          />
                        )}
                        <Text style={s.coachLevelText}>{coach.nationality}</Text>
                      </View>
                    )}
                  </View>
                  {Array.isArray(coach.languages) && coach.languages.length > 0 && (
                    <View style={s.coachLangRow}>
                      <MaterialCommunityIcons
                        name="translate"
                        size={11}
                        color={colors.textFaint}
                        style={{ marginRight: 6 }}
                      />
                      <Text style={s.coachLangText} numberOfLines={1}>
                        Speaks {coach.languages.join(' · ')}
                      </Text>
                    </View>
                  )}
                  {selected && (
                    <Text style={s.coachQuote}>"{coach.sampleQuote}"</Text>
                  )}
                </View>
                {selected && (
                  <View style={s.coachCheck}>
                    <Text style={s.coachCheckMark}>{'\u2713'}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
          <View style={{ height: 100 }} />
        </ScrollView>

        {/* Save button — only shows when selection has changed */}
        {hasChanged && (
          <View style={s.ctaWrap}>
            <TouchableOpacity
              style={[s.ctaBtn, saving && { opacity: 0.5 }]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.8}
            >
              <Text style={s.ctaText}>
                {saving ? 'Saving...' : `Switch to ${COACHES.find(c => c.id === selectedCoachId)?.name}`}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

const HIT = { top: 12, bottom: 12, left: 12, right: 12 };

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16 },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  backArrow: { fontSize: 22, color: colors.text, width: 32 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, textAlign: 'center' },

  subtitle: { fontSize: 14, fontFamily: FF.regular, color: colors.textMid, paddingHorizontal: 20, marginBottom: 16, lineHeight: 20 },

  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  emptyText: { fontSize: 15, fontFamily: FF.regular, color: colors.textMuted, textAlign: 'center' },

  // Coach cards — matches PlanConfigScreen styles
  coachCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: colors.surface, borderRadius: 14, padding: 14, marginBottom: 10,
    borderWidth: 1.5, borderColor: colors.border,
  },
  coachCardSelected: { borderColor: colors.primary, backgroundColor: colors.surface },
  coachAvatar: {
    width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
  },
  coachAvatarText: { fontSize: 15, fontWeight: '700', color: '#fff', fontFamily: FF.semibold },
  coachInfo: { flex: 1 },
  coachNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  coachName: { fontSize: 15, fontWeight: '600', fontFamily: FF.semibold, color: colors.text },
  coachNameSelected: { color: colors.primary },
  coachPronouns: { fontSize: 11, fontWeight: '400', fontFamily: FF.regular, color: colors.textFaint },
  currentBadge: { backgroundColor: 'rgba(232,69,139,0.12)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  currentBadgeText: { fontSize: 9, fontWeight: '600', fontFamily: FF.semibold, color: '#E8458B', textTransform: 'uppercase', letterSpacing: 0.4 },
  coachTagline: { fontSize: 13, fontWeight: '500', fontFamily: FF.medium, color: colors.textMuted, marginTop: 1 },
  coachTaglineSelected: { color: colors.primary },
  coachBio: { fontSize: 12, fontWeight: '400', fontFamily: FF.regular, color: colors.textMid, lineHeight: 17, marginTop: 4 },
  coachBadgeRow: { flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  coachLevelBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  coachLevelText: { fontSize: 10, fontWeight: '600', fontFamily: FF.semibold, color: colors.textMuted },
  // Two-letter ISO country code rendered as a small uppercase tag inside
  // the nationality badge — sits where a flag emoji would, but reads as
  // typographic design rather than as a colourful sticker. Slightly
  // tighter letter-spacing than the rest of the badge for a clean look,
  // and a faint divider via marginRight before the nationality word.
  coachCountryCode: {
    fontSize: 9,
    fontWeight: '700',
    fontFamily: FF.semibold,
    color: colors.textFaint,
    letterSpacing: 0.5,
    marginRight: 6,
  },
  // Language pill row — sits below the level/nationality badges so users can
  // see which languages each coach replies in before picking. Kept faint so
  // it informs without competing with the bio.
  coachLangRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  coachLangText: { fontSize: 11, fontWeight: '400', fontFamily: FF.regular, color: colors.textFaint, flex: 1 },
  coachQuote: { fontSize: 12, fontWeight: '400', fontFamily: FF.regular, color: colors.textMid, fontStyle: 'italic', marginTop: 6, lineHeight: 17 },
  coachCheck: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center', marginTop: 4,
  },
  coachCheckMark: { fontSize: 13, color: '#fff', fontWeight: '700' },

  // CTA
  ctaWrap: { paddingHorizontal: 16, paddingBottom: 16 + BOTTOM_INSET, paddingTop: 8 },
  ctaBtn: {
    backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  ctaText: { fontSize: 16, fontWeight: '600', fontFamily: FF.semibold, color: '#fff' },
});
