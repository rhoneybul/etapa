/**
 * OnboardingTour — Interactive overlay tour for first-time users.
 * Shows spotlight tooltips on the HomeScreen with dummy data,
 * walking through: training plan, coach chat, and progress tracking.
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, Dimensions,
  Modal, ScrollView, Image,
} from 'react-native';
import { colors, fontFamily } from '../theme';

const FF = fontFamily;
const { width: SW, height: SH } = Dimensions.get('window');

// ── Tour steps ──────────────────────────────────────────────────────────────
const STEPS = [
  {
    id: 'welcome',
    title: 'Welcome to Etapa',
    body: 'Your personal cycling coach. Let\'s take a quick look at what\'s waiting for you.',
    position: 'center',
    icon: null,
  },
  {
    id: 'plan',
    title: 'Your Training Plan',
    body: 'We\'ll build a personalised weekly plan based on your goals — with sessions tailored to your level, schedule, and target event.',
    position: 'top',
    icon: null,
    dummyCard: {
      type: 'plan',
      title: 'Build Base Fitness',
      meta: '42 km · 8 wks · ~4 h/wk',
      week: 'Week 3 of 8',
      activities: [
        { day: 'Mon', name: 'Easy Spin', dist: '15 km', effort: 'Easy', done: true },
        { day: 'Wed', name: 'Tempo Intervals', dist: '25 km', effort: 'Moderate', done: true },
        { day: 'Fri', name: 'Endurance Ride', dist: '40 km', effort: 'Moderate', done: false },
        { day: 'Sun', name: 'Recovery Ride', dist: '12 km', effort: 'Easy', done: false },
      ],
    },
  },
  {
    id: 'coach',
    title: 'Your AI Coach',
    body: 'After each session, your coach checks in — asking how it went, offering tips, and preparing you for what\'s next.',
    position: 'middle',
    icon: null,
    dummyCard: {
      type: 'chat',
      messages: [
        { role: 'coach', text: 'Great work on yesterday\'s tempo ride! 25 km at moderate effort is solid for Week 3. How did your legs feel on the intervals?' },
        { role: 'user', text: 'Felt good! The last two intervals were tough but manageable.' },
        { role: 'coach', text: 'That\'s exactly where you want to be. Friday\'s endurance ride is 40 km — take the first half easy and build into it. Stay hydrated.' },
      ],
    },
  },
  {
    id: 'progress',
    title: 'Track Your Progress',
    body: 'See your weekly distance, completed sessions, and how you\'re tracking against your plan. Connect Strava for automatic syncing.',
    position: 'middle',
    icon: null,
    dummyCard: {
      type: 'stats',
      stats: [
        { label: 'This Week', value: '40 km', sub: 'of 92 km goal' },
        { label: 'Sessions', value: '2 / 4', sub: 'completed' },
        { label: 'Streak', value: '3 wks', sub: 'consistent' },
        { label: 'Total', value: '186 km', sub: 'all time' },
      ],
    },
  },
  {
    id: 'ready',
    title: 'Ready to ride?',
    body: 'Choose how you\'d like to get started.',
    position: 'center',
    icon: null,
    cta: 'Get started',
  },
];

// ── Dummy card renderers ────────────────────────────────────────────────────

function PlanCard({ data }) {
  return (
    <View style={cs.card}>
      <Text style={cs.cardLabel}>SAMPLE PLAN</Text>
      <Text style={cs.planTitle}>{data.title}</Text>
      <Text style={cs.planMeta}>{data.meta}</Text>
      <View style={cs.weekBadge}>
        <Text style={cs.weekText}>{data.week}</Text>
      </View>
      {data.activities.map((a, i) => (
        <View key={i} style={cs.actRow}>
          <Text style={[cs.actDay, a.done && cs.actDone]}>{a.day}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[cs.actName, a.done && cs.actDone]}>{a.name}</Text>
            <Text style={cs.actMeta}>{a.dist} · {a.effort}</Text>
          </View>
          <Text style={cs.actCheck}>{a.done ? '✓' : '○'}</Text>
        </View>
      ))}
    </View>
  );
}

function ChatCard({ data }) {
  return (
    <View style={cs.card}>
      <Text style={cs.cardLabel}>COACH CHAT</Text>
      {data.messages.map((m, i) => (
        <View key={i} style={[cs.chatBubble, m.role === 'user' ? cs.chatUser : cs.chatCoach]}>
          <Text style={cs.chatText}>{m.text}</Text>
        </View>
      ))}
    </View>
  );
}

function StatsCard({ data }) {
  return (
    <View style={cs.card}>
      <Text style={cs.cardLabel}>YOUR PROGRESS</Text>
      <View style={cs.statsGrid}>
        {data.stats.map((s, i) => (
          <View key={i} style={cs.statBox}>
            <Text style={cs.statValue}>{s.value}</Text>
            <Text style={cs.statLabel}>{s.label}</Text>
            <Text style={cs.statSub}>{s.sub}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function DummyCardRenderer({ dummyCard }) {
  if (!dummyCard) return null;
  switch (dummyCard.type) {
    case 'plan': return <PlanCard data={dummyCard} />;
    case 'chat': return <ChatCard data={dummyCard} />;
    case 'stats': return <StatsCard data={dummyCard} />;
    default: return null;
  }
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function OnboardingTour({ visible, onComplete, onCreatePlan }) {
  const [step, setStep] = useState(0);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    if (visible) {
      setStep(0);
      fadeAnim.setValue(0);
      slideAnim.setValue(30);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const animateTransition = (cb) => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: -20, duration: 200, useNativeDriver: true }),
    ]).start(() => {
      cb();
      fadeAnim.setValue(0);
      slideAnim.setValue(30);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start();
    });
  };

  const handleNext = () => {
    if (step >= STEPS.length - 1) {
      // Final step — dismiss the tour so the user can choose their path
      // (Get into Cycling or Create a custom plan)
      onComplete?.();
      return;
    }
    animateTransition(() => setStep(s => s + 1));
  };

  const handleSkip = () => {
    onComplete?.();
  };

  if (!visible) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const isFirst = step === 0;

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
      <View style={s.overlay}>
        {/* Skip button */}
        {!isLast && (
          <TouchableOpacity style={s.skipBtn} onPress={handleSkip} activeOpacity={0.7}>
            <Text style={s.skipText}>Skip</Text>
          </TouchableOpacity>
        )}

        <Animated.View style={[
          s.contentWrap,
          { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
        ]}>
          <ScrollView
            contentContainerStyle={s.scrollContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {/* Title + body */}
            <Text style={s.title}>{current.title}</Text>
            <Text style={s.body}>{current.body}</Text>

            {/* Dummy data card */}
            {current.dummyCard && (
              <View style={s.cardWrap}>
                <DummyCardRenderer dummyCard={current.dummyCard} />
              </View>
            )}
          </ScrollView>

          {/* Progress dots */}
          <View style={s.dotsRow}>
            {STEPS.map((_, i) => (
              <View key={i} style={[s.dot, i === step && s.dotActive]} />
            ))}
          </View>

          {/* Action buttons */}
          <View style={s.btnRow}>
            {!isFirst && !isLast && (
              <TouchableOpacity
                style={s.backBtn}
                onPress={() => animateTransition(() => setStep(st => st - 1))}
                activeOpacity={0.7}
              >
                <Text style={s.backBtnText}>Back</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[s.nextBtn, isLast && s.ctaBtn]}
              onPress={handleNext}
              activeOpacity={0.85}
            >
              <Text style={[s.nextBtnText, isLast && s.ctaBtnText]}>
                {isLast ? (current.cta || 'Get started') : 'Next'}
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  skipBtn: {
    position: 'absolute', top: 60, right: 24, zIndex: 10,
    paddingVertical: 8, paddingHorizontal: 16,
  },
  skipText: {
    fontSize: 14, fontFamily: FF.regular, color: colors.textMid,
  },
  contentWrap: {
    flex: 1,
    justifyContent: 'center',
    maxHeight: SH * 0.8,
  },
  scrollContent: {
    alignItems: 'center',
    paddingBottom: 16,
  },
  icon: {
    fontSize: 48, textAlign: 'center', marginBottom: 16,
  },
  title: {
    fontSize: 26, fontFamily: FF.semibold, fontWeight: '600',
    color: colors.text, textAlign: 'center', marginBottom: 10,
  },
  body: {
    fontSize: 15, fontFamily: FF.regular, color: colors.textMid,
    textAlign: 'center', lineHeight: 22, maxWidth: 320, marginBottom: 20,
  },
  cardWrap: {
    width: '100%', maxWidth: 340, alignSelf: 'center',
  },
  dotsRow: {
    flexDirection: 'row', justifyContent: 'center',
    marginTop: 20, marginBottom: 20,
  },
  dot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: colors.textFaint, marginHorizontal: 4,
  },
  dotActive: {
    backgroundColor: colors.primary, width: 24,
  },
  btnRow: {
    flexDirection: 'row', justifyContent: 'center',
    gap: 12, paddingBottom: 40,
  },
  backBtn: {
    paddingVertical: 14, paddingHorizontal: 24,
    borderRadius: 12, borderWidth: 1,
    borderColor: colors.border,
  },
  backBtnText: {
    fontSize: 15, fontFamily: FF.medium, color: colors.textMid,
  },
  nextBtn: {
    paddingVertical: 14, paddingHorizontal: 36,
    borderRadius: 12, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
  },
  nextBtnText: {
    fontSize: 15, fontFamily: FF.semibold, color: colors.text,
  },
  ctaBtn: {
    backgroundColor: colors.primary, borderColor: colors.primary,
    paddingHorizontal: 40,
  },
  ctaBtnText: {
    color: '#fff',
  },
});

// ── Card styles ─────────────────────────────────────────────────────────────
const cs = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: colors.border,
  },
  cardLabel: {
    fontSize: 10, fontFamily: FF.medium, fontWeight: '500',
    color: colors.primary, letterSpacing: 1,
    marginBottom: 10, textTransform: 'uppercase',
  },

  // Plan card
  planTitle: {
    fontSize: 18, fontFamily: FF.semibold, fontWeight: '600',
    color: colors.text, marginBottom: 4,
  },
  planMeta: {
    fontSize: 13, fontFamily: FF.regular, color: colors.textMid, marginBottom: 10,
  },
  weekBadge: {
    backgroundColor: colors.primaryLight,
    borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10,
    alignSelf: 'flex-start', marginBottom: 12,
  },
  weekText: {
    fontSize: 12, fontFamily: FF.medium, color: colors.primary,
  },
  actRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  actDay: {
    width: 36, fontSize: 12, fontFamily: FF.medium, fontWeight: '500',
    color: colors.textMid,
  },
  actName: {
    fontSize: 14, fontFamily: FF.regular, color: colors.text,
  },
  actMeta: {
    fontSize: 12, fontFamily: FF.regular, color: colors.textMid, marginTop: 1,
  },
  actDone: { opacity: 0.5 },
  actCheck: {
    fontSize: 16, color: colors.primary, marginLeft: 8,
  },

  // Chat card
  chatBubble: {
    borderRadius: 12, padding: 12, marginBottom: 8, maxWidth: '88%',
  },
  chatCoach: {
    backgroundColor: colors.surfaceLight, alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
  },
  chatUser: {
    backgroundColor: colors.primary + '20', alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  chatText: {
    fontSize: 14, fontFamily: FF.regular, color: colors.text, lineHeight: 20,
  },

  // Stats card
  statsGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
  },
  statBox: {
    width: '50%', paddingVertical: 10, alignItems: 'center',
  },
  statValue: {
    fontSize: 22, fontFamily: FF.semibold, fontWeight: '600', color: colors.text,
  },
  statLabel: {
    fontSize: 12, fontFamily: FF.medium, color: colors.textMid, marginTop: 2,
  },
  statSub: {
    fontSize: 11, fontFamily: FF.regular, color: colors.textFaint,
  },
});
