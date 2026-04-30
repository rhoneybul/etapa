/**
 * Getting Started guide — honest intro to cycling gear and fundamentals.
 * Includes an interactive gear inventory checker at the top.
 */

import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, SafeAreaView,
  Switch,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fontFamily, BOTTOM_INSET } from '../theme';
import { getGearInventory, setGearItem, getPlans, getUserPrefs } from '../services/storageService';
import { GETTING_STARTED_SECTIONS } from '../data/gettingStarted';
import { GEAR_ITEMS } from '../data/gearInventory';
import { getCoach } from '../data/coaches';
import analytics from '../services/analyticsService';
import useScreenGuard from '../hooks/useScreenGuard';

const FF = fontFamily;

// Country code to name mapping
const COUNTRY_NAMES = {
  GB: 'the UK', US: 'the US', CA: 'Canada', AU: 'Australia', NZ: 'New Zealand',
  IE: 'Ireland', FR: 'France', DE: 'Germany', ES: 'Spain', IT: 'Italy',
  NL: 'the Netherlands', BE: 'Belgium', CH: 'Switzerland', AT: 'Austria',
};

function countryName(cc) {
  return COUNTRY_NAMES[cc] || cc;
}

// Ask coach question templates per section
const ASK_TEMPLATES = {
  bike: (cc) => `I'm thinking about getting a bike. What should I look for as a beginner${cc ? ` based in ${countryName(cc)}` : ''}? Any specific shops or brands you'd recommend?`,
  helmet: (cc) => `What should I look for in a cycling helmet? Any helmet recommendations${cc ? ` available in ${countryName(cc)}` : ''}?`,
  clothes: () => `What cycling clothes are actually worth investing in for a beginner? I don't want to spend money on stuff I won't use.`,
  lights: (cc) => `What lights do I really need for cycling${cc ? ` in ${countryName(cc)}` : ''}? Both safety and legal requirements.`,
  tools: () => `What tools and repair kit should a beginner cyclist have? I don't want to buy stuff I'll never use.`,
  tech: () => `Do I really need a bike computer to start out, or is my phone enough? What's worth the upgrade and when?`,
  food: () => `What should I eat before, during, and after a ride as a beginner? When do I actually need gels?`,
  routes: (cc) => `How do I find good cycling routes near me${cc ? ` in ${countryName(cc)}` : ''}? Any specific apps or websites you'd recommend?`,
  community: (cc) => `How do I find a beginner-friendly cycling club${cc ? ` in ${countryName(cc)}` : ''}? Group rides feel a bit intimidating.`,
};

// Collapsible tier card — shows minimum, invest, or allout content
function TierCard({ tier, body, wheresToBuy, isCollapsed, onToggle }) {
  const tierLabel = {
    minimum: 'The bare minimum',
    invest: 'A solid upgrade',
    allout: 'Going all out',
  }[tier];

  const tierColor = {
    minimum: 'rgba(232,69,139,0.08)',
    invest: 'rgba(232,69,139,0.12)',
    allout: 'rgba(232,69,139,0.16)',
  }[tier];

  const tierBorder = {
    minimum: 'rgba(232,69,139,0.15)',
    invest: 'rgba(232,69,139,0.25)',
    allout: 'rgba(232,69,139,0.35)',
  }[tier];

  return (
    <TouchableOpacity
      style={[s.tierCard, { backgroundColor: tierColor, borderColor: tierBorder }]}
      onPress={onToggle}
      activeOpacity={0.8}
    >
      <View style={s.tierHeader}>
        <Text style={s.tierLabel}>{tierLabel}</Text>
        <Text style={s.tierToggle}>{isCollapsed ? '\u25B6' : '\u25BC'}</Text>
      </View>

      {!isCollapsed && (
        <>
          <Text style={s.tierBody}>{body}</Text>
          {wheresToBuy && (
            <View style={s.whereToLook}>
              <Text style={s.whereToLookLabel}>Where to look:</Text>
              <Text style={s.whereToLookText}>{wheresToBuy}</Text>
            </View>
          )}
        </>
      )}
    </TouchableOpacity>
  );
}

// Gear inventory row — item label + toggle (Got it / Nope).
//
// Was previously branched on Platform.OS to use SegmentedControlIOS on
// iOS and Switch on Android. SegmentedControlIOS was removed from
// react-native years ago — the import resolved to undefined on real-
// device builds and crashed the screen on first paint (Metro is more
// lenient about undefined symbols, which is why dev didn't trip it).
// Unified on Switch for both platforms — simpler, no native dep, and
// the visual reads cleanly in the existing card styling.
function GearRow({ label, hasIt, onToggle }) {
  return (
    <View style={s.gearRow}>
      <Text style={s.gearLabel}>{label}</Text>
      <Switch
        value={hasIt}
        onValueChange={onToggle}
        trackColor={{ false: colors.border, true: '#E8458B' }}
        thumbColor="#fff"
      />
    </View>
  );
}

// Section card — collapsible with tier cards inside
function SectionCard({ section, inventory, onGearChange, isFirstLoad, navigation }) {
  const [expanded, setExpanded] = useState(isFirstLoad);
  const [collapsedTiers, setCollapsedTiers] = useState({
    minimum: false,
    invest: true,
    allout: true,
  });

  const hasItem = section.inventoryKey ? inventory[section.inventoryKey] : null;

  const toggleTierCollapse = (tier) => {
    setCollapsedTiers(prev => ({
      ...prev,
      [tier]: !prev[tier],
    }));
  };

  const handleAskCoach = async () => {
    try {
      const [plans, prefs] = await Promise.all([getPlans(), getUserPrefs()]);
      const activePlan = plans.find(p => p.status === 'active') || plans[0];
      const countryCode = prefs?.location?.country || null;
      const templateFn = ASK_TEMPLATES[section.id];
      const prefillMessage = templateFn ? templateFn(countryCode) : 'Tell me about this topic.';

      navigation.navigate('CoachChat', {
        planId: activePlan?.id,
        prefillMessage,
      });
    } catch (err) {
      console.warn('Failed to navigate to coach chat:', err);
    }
  };

  return (
    <View style={s.sectionCard}>
      <TouchableOpacity
        style={s.sectionHeader}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.8}
      >
        <View style={s.sectionTitleRow}>
          <View style={s.sectionTitleContent}>
            <Text style={s.sectionTitle}>{section.title}</Text>
            {hasItem && <Text style={s.checkMark}>{'  \u2713'}</Text>}
          </View>
        </View>
        <View style={s.sectionHeaderRight}>
          <Text style={s.sectionToggle}>{expanded ? '\u25BC' : '\u25B6'}</Text>
        </View>
      </TouchableOpacity>

      {expanded && (
        <>
          <Text style={s.sectionIntro}>{section.intro}</Text>

          {/* Collapse the minimum tier by default if user has marked it as owned */}
          {section.tiers.map((tierData, idx) => (
            <TierCard
              key={tierData.tier}
              tier={tierData.tier}
              body={tierData.body}
              wheresToBuy={tierData.wheresToBuy}
              isCollapsed={
                hasItem && tierData.tier === 'minimum'
                  ? true
                  : collapsedTiers[tierData.tier]
              }
              onToggle={() => toggleTierCollapse(tierData.tier)}
            />
          ))}

          {/* Ask your coach button — icon dropped (chat-question
              glyph wasn't pulling its weight against the text label
              and read as decoration). Plain pink-tinted text button
              now. */}
          <TouchableOpacity
            style={s.askCoachBtn}
            onPress={handleAskCoach}
            activeOpacity={0.8}
          >
            <Text style={s.askCoachText}>Ask your coach about this</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

export default function GettingStartedScreen({ navigation, route }) {
  // Remote-first guard — lets the admin dashboard temporarily disable
  // this screen or redirect riders elsewhere via
  // workflows.screens.GettingStartedScreen in remote config. Cheap;
  // returns blocked=false on a network error so we never lock anyone
  // out of getting into the beginner programme because of a config blip.
  const _screenGuard = useScreenGuard('GettingStartedScreen', navigation);

  const isFirstTime = route?.params?.firstTime === true;
  const onComplete = route?.params?.onComplete;

  const [inventory, setInventory] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getGearInventory().then(inv => {
      setInventory(inv);
      setLoading(false);
    });
  }, []);

  const handleGearChange = async (itemId, hasIt) => {
    setInventory(prev => ({ ...prev, [itemId]: hasIt }));
    await setGearItem(itemId, hasIt);
  };

  const handleContinue = () => {
    analytics.capture?.('getting_started_completed', { isFirstTime });
    onComplete?.();
  };

  // Honour the remote-config screen guard before doing any work — if
  // the dashboard has flipped the screen off (or pointed a redirectTo
  // at it), short-circuit and render the guard's panel.
  if (_screenGuard.blocked) return _screenGuard.render();

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <Text style={s.loadingText}>Loading...</Text>
      </SafeAreaView>
    );
  }

  return (
    <View style={s.container}>
      <SafeAreaView style={s.safe}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT}>
            <Text style={s.backArrow}>{'\u2190'}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={s.scrollContent}
        >
          {/* Hero */}
          <View style={s.hero}>
            <Text style={s.heroTitle}>Getting started — the honest version</Text>
            <Text style={s.heroSubtitle}>
              You don't have to spend a fortune. You don't need lycra. You just need a working bike and 30 minutes.
            </Text>
          </View>

          {/* Inventory check */}
          <View style={s.inventoryCard}>
            <Text style={s.inventoryTitle}>What have you already got?</Text>
            <Text style={s.inventorySub}>
              No judgement on any of this. We just don't want to waffle on about kit you've already got. It's also fine to have nothing yet — most riders start with less than they think.
            </Text>

            <View style={s.gearList}>
              {GEAR_ITEMS.map(item => (
                <GearRow
                  key={item.id}
                  label={item.label}
                  hasIt={inventory[item.id] || false}
                  onToggle={(val) => handleGearChange(item.id, val)}
                />
              ))}
            </View>
          </View>

          {/* Content sections */}
          <View style={s.sectionsContainer}>
            {GETTING_STARTED_SECTIONS.map((section, idx) => (
              <SectionCard
                key={section.id}
                section={section}
                inventory={inventory}
                onGearChange={handleGearChange}
                isFirstLoad={idx < 3}
                navigation={navigation}
              />
            ))}
          </View>

          <View style={{ height: 140 }} />
        </ScrollView>

        {/* Footer CTA — only on first-time flow */}
        {isFirstTime && (
          <View style={s.footerWrap}>
            <TouchableOpacity
              style={s.ctaBtn}
              onPress={handleContinue}
              activeOpacity={0.85}
            >
              <Text style={s.ctaText}>Continue</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.skipBtn}
              onPress={() => {
                analytics.capture?.('getting_started_skipped');
                onComplete?.();
              }}
              activeOpacity={0.8}
            >
              <Text style={s.skipText}>Skip — I'll come back to this</Text>
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
  loadingText: { fontSize: 14, color: colors.textMid, padding: 20 },

  // Header
  header: { paddingHorizontal: 20, paddingVertical: 12 },
  backArrow: { fontSize: 22, color: colors.text, width: 32 },

  // Scroll
  scrollContent: { paddingHorizontal: 20 },

  // Hero
  hero: { marginBottom: 24, marginTop: 8 },
  heroTitle: {
    fontSize: 26, fontFamily: FF.semibold, color: colors.text,
    marginBottom: 10, lineHeight: 32,
  },
  heroSubtitle: {
    fontSize: 15, fontFamily: FF.regular, color: colors.textMid,
    lineHeight: 22,
  },

  // Inventory card
  inventoryCard: {
    backgroundColor: 'rgba(232,69,139,0.06)',
    borderWidth: 1, borderColor: 'rgba(232,69,139,0.15)',
    borderRadius: 14, padding: 18, marginBottom: 28,
  },
  inventoryTitle: {
    fontSize: 16, fontFamily: FF.semibold, color: colors.text,
    marginBottom: 6,
  },
  inventorySub: {
    fontSize: 13, fontFamily: FF.regular, color: colors.textMid,
    marginBottom: 18, lineHeight: 19,
  },

  // Gear list
  gearList: { gap: 14 },
  gearRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
  },
  gearLabel: {
    fontSize: 14, fontFamily: FF.regular, color: colors.text,
    flex: 1,
  },
  gearToggle: { width: 100, height: 28 },

  // Sections
  sectionsContainer: { gap: 12, marginBottom: 12 },
  sectionCard: {
    backgroundColor: colors.surface, borderRadius: 14,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', padding: 18,
  },
  sectionTitleRow: { flex: 1 },
  sectionTitleContent: { flexDirection: 'row', alignItems: 'center' },
  sectionTitle: {
    fontSize: 16, fontFamily: FF.semibold, color: colors.text,
  },
  checkMark: {
    fontSize: 16, fontFamily: FF.semibold, color: '#E8458B',
  },
  sectionHeaderRight: { marginLeft: 12 },
  sectionToggle: { fontSize: 16, color: colors.textMuted },
  sectionIntro: {
    fontSize: 14, fontFamily: FF.regular, color: colors.textMid,
    paddingHorizontal: 18, paddingBottom: 12, fontStyle: 'italic',
  },

  // Tier cards
  tierCard: {
    marginHorizontal: 18, marginBottom: 10, borderRadius: 12,
    borderWidth: 1, padding: 14, overflow: 'hidden',
  },
  tierHeader: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
  },
  tierLabel: {
    fontSize: 14, fontFamily: FF.semibold, color: colors.text,
  },
  tierToggle: { fontSize: 14, color: colors.textMuted },
  tierBody: {
    fontSize: 13, fontFamily: FF.regular, color: colors.textMid,
    marginTop: 10, lineHeight: 19,
  },
  whereToLook: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' },
  whereToLookLabel: {
    fontSize: 11, fontFamily: FF.semibold, color: colors.textMuted,
    marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  whereToLookText: {
    fontSize: 12, fontFamily: FF.regular, color: colors.textMid,
    fontStyle: 'italic',
  },

  // Ask coach button
  askCoachBtn: {
    marginHorizontal: 18, marginTop: 14, marginBottom: 4,
    paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10,
    backgroundColor: 'rgba(232,69,139,0.08)', borderWidth: 1,
    borderColor: 'rgba(232,69,139,0.2)', flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  askCoachText: {
    fontSize: 13, fontFamily: FF.semibold, color: '#E8458B',
  },

  // Footer
  footerWrap: {
    paddingHorizontal: 20, paddingTop: 12,
    paddingBottom: 16 + BOTTOM_INSET, gap: 10,
  },
  ctaBtn: {
    backgroundColor: '#E8458B', borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
  },
  ctaText: { fontSize: 16, fontFamily: FF.semibold, color: '#fff' },
  skipBtn: { paddingVertical: 12, alignItems: 'center' },
  skipText: { fontSize: 14, fontFamily: FF.regular, color: '#E8458B' },
});
