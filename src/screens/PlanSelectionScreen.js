/**
 * PlanSelectionScreen — the three-card pathway picker.
 *
 * Used in two flows with the same visual component:
 *
 *   1. First-time / post-delete — reached at the end of PlanPickerScreen's
 *      intake. `route.params.recommendedPath` is set, so one card carries a
 *      RECOMMENDED badge and a short coach-voice rationale above the list.
 *
 *   2. Returning user picking another plan — reached via the "+ New plan"
 *      button on HomeScreen. `recommendedPath` is null, so all three cards
 *      render equal with no rationale header. User picks directly.
 *
 * Routing after tap mirrors the old PlanPicker.onChoose logic so behaviour
 * downstream doesn't change — beginner → BeginnerProgram, event → GoalSetup,
 * quick → saveGoal(improve) → PlanConfig with the intake pre-fills.
 */
import React, { useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontFamily } from '../theme';
import analytics from '../services/analyticsService';
import { saveGoal, setUserPrefs } from '../services/storageService';
import { isSubscribed } from '../services/subscriptionService';

const FF = fontFamily;

const PATH_META = {
  beginner: {
    title: 'Get into cycling',
    sub: '12-week programme · no experience needed',
    longSub: 'A gentle 12-week programme that builds aerobic base and gets you comfortable on 60 km rides by the end.',
  },
  event: {
    title: 'Build a plan for your event',
    sub: 'Target date + adjusts as you go',
    longSub: 'Work backwards from a sportive, race or first 100 km. Tapers you in sharp for race day.',
  },
  quick: {
    title: 'Just get fitter',
    sub: 'Ongoing, flexible plan',
    longSub: 'No deadline, no specific distance. A flexible plan that keeps you progressing week by week.',
  },
};

const ORDER = ['beginner', 'event', 'quick'];

function rationaleFor(intake, recommendedPath) {
  if (!intake || !recommendedPath) return null;
  const { intent, longestRide, trainingLength, eventDate } = intake;
  if (recommendedPath === 'event') {
    return "A goal-driven plan works backwards from your event date so you arrive fresh.";
  }
  if (recommendedPath === 'beginner') {
    if (intent === 'fitter') {
      return "You've asked to get fitter, but without a riding base yet we'd skip too many foundations. Start with the 12-week programme.";
    }
    return "A gentle 12-week programme will build your base and get you comfortable on longer rides. No experience needed.";
  }
  if (recommendedPath === 'quick') {
    if (intent === 'getting_started') {
      return "You've got a solid base already — a flexible ongoing plan suits you better than the fixed beginner programme.";
    }
    return "You've got a base. Ongoing, flexible plan — we'll keep you progressing week by week.";
  }
  return null;
}

export default function PlanSelectionScreen({ navigation, route }) {
  const recommendedPath = route.params?.recommendedPath || null;
  const intake = route.params?.intake || null;
  const requirePaywallParam = route.params?.requirePaywall ?? null;

  const [routing, setRouting] = useState(null); // path being routed to (disables double taps)

  const rationale = useMemo(
    () => rationaleFor(intake, recommendedPath),
    [intake, recommendedPath],
  );

  const onChoose = async (chosenPath) => {
    if (routing) return;
    setRouting(chosenPath);
    analytics.events.planPickerChose?.({
      recommended_path: recommendedPath,
      chosen_path: chosenPath,
      override: recommendedPath != null && recommendedPath !== chosenPath,
      had_intake: !!intake,
    });

    // Persist the intake if we have one, with the user's final choice.
    if (intake) {
      const withChoice = { ...intake, chosenPath };
      try { await setUserPrefs({ skillIntake: withChoice }); } catch {}
    }

    const subscribed = requirePaywallParam !== null
      ? !requirePaywallParam
      : (__DEV__ ? false : await isSubscribed());

    if (chosenPath === 'beginner') {
      navigation.replace('BeginnerProgram', { intake });
      return;
    }

    if (chosenPath === 'event') {
      navigation.replace('GoalSetup', {
        requirePaywall: !subscribed,
        intake,
      });
      return;
    }

    // 'quick' — save an "improve" goal and jump straight to PlanConfig
    const trainingLen = intake?.trainingLength;
    const weeks = trainingLen && trainingLen !== 'ongoing' && trainingLen !== 'to_date'
      ? Number(trainingLen) : null;
    try {
      const goal = await saveGoal({
        // Honour the cyclingType the user picked on PlanPicker Step 1.
        // Falls back to 'mixed' for the rare case they arrive here
        // without an intake. Multi-select rollout: also pass the array
        // for back-compatible downstream reads.
        cyclingType: intake?.cyclingType || 'mixed',
        cyclingTypes: Array.isArray(intake?.cyclingTypes) && intake.cyclingTypes.length > 0
          ? intake.cyclingTypes
          : (intake?.cyclingType ? [intake.cyclingType] : []),
        goalType: 'improve',
        planName: 'Keep improving',
        targetDistance: null,
        targetElevation: null,
        targetTime: null,
        targetDate: null,
        eventName: null,
      });
      navigation.replace('PlanConfig', {
        goal,
        requirePaywall: !subscribed,
        intake,
        prefillWeeks: weeks,
        prefillLevel: intake?.userLevel,
        prefillLongestRideKm: intake?.longestRideKm,
      });
    } catch {
      navigation.replace('QuickPlan', { requirePaywall: !subscribed, intake });
    }
  };

  const hasRecommendation = !!recommendedPath;

  // Card order: if we have a recommendation, the recommended path renders
  // first (in the big "RECOMMENDED" slot) and the other two follow as
  // alternates. Without a recommendation, stable ORDER for predictability.
  const rest = ORDER.filter(p => p !== recommendedPath);

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <ScrollView contentContainerStyle={s.scrollWrap} showsVerticalScrollIndicator={false}>

        <View style={s.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT}>
            <Text style={s.backBtn}>‹ Back</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
        </View>

        {hasRecommendation ? (
          <>
            <Text style={s.eyebrow}>Our recommendation</Text>
            <Text style={s.title}>Here&apos;s what we&apos;d pick for you</Text>
            {rationale ? <Text style={s.rationale}>{rationale}</Text> : null}

            <TouchableOpacity
              style={[s.recCard, routing === recommendedPath && s.cardRouting]}
              onPress={() => onChoose(recommendedPath)}
              activeOpacity={0.88}
              disabled={!!routing}
            >
              <View style={s.recBadge}><Text style={s.recBadgeText}>RECOMMENDED</Text></View>
              <Text style={s.recCardTitle}>{PATH_META[recommendedPath].title}</Text>
              <Text style={s.recCardSub}>{PATH_META[recommendedPath].sub}</Text>
            </TouchableOpacity>

            <Text style={s.orTryLabel}>Or try one of these</Text>
            {rest.map(p => (
              <TouchableOpacity
                key={p}
                style={[s.altCard, routing === p && s.cardRouting]}
                onPress={() => onChoose(p)}
                activeOpacity={0.8}
                disabled={!!routing}
              >
                <Text style={s.altCardTitle}>{PATH_META[p].title}</Text>
                <Text style={s.altCardSub}>{PATH_META[p].sub}</Text>
              </TouchableOpacity>
            ))}
          </>
        ) : (
          <>
            <Text style={s.title}>Choose a plan</Text>
            <Text style={s.subtitle}>Pick what fits. You can always switch later.</Text>

            {ORDER.map(p => (
              <TouchableOpacity
                key={p}
                style={[s.neutralCard, routing === p && s.cardRouting]}
                onPress={() => onChoose(p)}
                activeOpacity={0.88}
                disabled={!!routing}
              >
                <Text style={s.neutralCardTitle}>{PATH_META[p].title}</Text>
                <Text style={s.neutralCardSub}>{PATH_META[p].longSub}</Text>
              </TouchableOpacity>
            ))}
          </>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const HIT = { top: 10, bottom: 10, left: 10, right: 10 };

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scrollWrap: { padding: 22, paddingBottom: 60 },

  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  backBtn: { fontSize: 14, color: colors.textMid, fontFamily: FF.regular },

  eyebrow: {
    fontSize: 11, color: colors.primary, fontFamily: FF.semibold, fontWeight: '500',
    letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8,
  },
  title: {
    fontSize: 24, fontFamily: FF.semibold, fontWeight: '500',
    color: colors.text, lineHeight: 30, marginBottom: 10,
  },
  subtitle: {
    fontSize: 14, fontFamily: FF.regular, color: colors.textMid,
    lineHeight: 21, marginBottom: 24,
  },
  rationale: {
    fontSize: 14, fontFamily: FF.regular, color: colors.textMid,
    lineHeight: 21, marginBottom: 22,
  },

  // Recommended big card
  recCard: {
    borderWidth: 1.5, borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
    borderRadius: 16, padding: 18, marginBottom: 18,
  },
  recBadge: {
    alignSelf: 'flex-start', backgroundColor: colors.primary,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, marginBottom: 10,
  },
  recBadgeText: {
    fontSize: 10, color: '#fff', fontFamily: FF.semibold, fontWeight: '500',
    letterSpacing: 0.5,
  },
  recCardTitle: {
    fontSize: 18, color: colors.text, fontFamily: FF.semibold, fontWeight: '500',
    marginBottom: 4,
  },
  recCardSub: {
    fontSize: 13, color: colors.textMid, fontFamily: FF.regular, lineHeight: 18,
  },

  orTryLabel: {
    fontSize: 12, color: colors.textMuted, fontFamily: FF.medium, fontWeight: '500',
    letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10,
  },
  altCard: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 12, padding: 14, marginBottom: 10,
  },
  altCardTitle: {
    fontSize: 14, color: colors.text, fontFamily: FF.semibold, fontWeight: '500',
  },
  altCardSub: {
    fontSize: 12, color: colors.textMid, fontFamily: FF.regular, marginTop: 2,
  },

  // Neutral cards for the no-recommendation flow. Slightly taller with a
  // longer description so each card stands on its own without the
  // recommendation ranking doing the job for us.
  neutralCard: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 14, padding: 16, marginBottom: 12,
  },
  neutralCardTitle: {
    fontSize: 16, color: colors.text, fontFamily: FF.semibold, fontWeight: '500',
    marginBottom: 4,
  },
  neutralCardSub: {
    fontSize: 13, color: colors.textMid, fontFamily: FF.regular, lineHeight: 19,
  },

  cardRouting: { opacity: 0.4 },
});
