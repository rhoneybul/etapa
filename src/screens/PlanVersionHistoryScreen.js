/**
 * Plan Version History — list of snapshots for a plan, with revert.
 *
 * Snapshots are taken automatically before every destructive action (regenerate,
 * revert). Tapping Restore on any row:
 *   1. Asks for confirmation
 *   2. Server snapshots the CURRENT state first (so revert is itself reversible)
 *   3. Restores the selected snapshot's activities + plan meta
 *   4. Triggers a server-side sync down to the client and bumps user back to the
 *      plan overview
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontFamily } from '../theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import api from '../services/api';
import { hydrateFromServer } from '../services/storageService';
import analytics from '../services/analyticsService';

const FF = fontFamily;

function formatDate(iso) {
  try {
    const d = new Date(iso);
    const now = new Date();
    const mins = Math.floor((now - d) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

function reasonLabel(reason) {
  switch (reason) {
    case 'pre-regenerate': return 'Before regenerate';
    case 'pre-revert':     return 'Before revert';
    case 'manual':         return 'Saved manually';
    default:               return 'Snapshot';
  }
}

export default function PlanVersionHistoryScreen({ navigation, route }) {
  const { planId } = route.params || {};
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [versions, setVersions] = useState([]);
  const [restoringId, setRestoringId] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await api.plans.versions.list(planId);
      setVersions(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('[VersionHistory] load failed:', err);
    }
  }, [planId]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleRestore = (version) => {
    Alert.alert(
      'Restore this version?',
      `We'll save your current plan as a new version first, then restore this one from ${formatDate(version.createdAt)}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          style: 'destructive',
          onPress: () => doRestore(version),
        },
      ],
    );
  };

  const doRestore = async (version) => {
    setRestoringId(version.id);
    try {
      await api.plans.versions.revert(planId, version.id);
      analytics.events.planReverted?.({ versionId: version.id });

      // Pull the restored plan down to local storage so the rest of the app
      // reflects the change immediately.
      await hydrateFromServer({ force: true }).catch(() => {});

      Alert.alert('Restored', 'Your plan has been restored from this version.', [
        {
          text: 'OK',
          onPress: () => {
            navigation.navigate('Home', { freshPlanId: planId });
          },
        },
      ]);
    } catch (err) {
      console.error('[VersionHistory] restore failed:', err);
      Alert.alert('Couldn\u2019t restore', err?.message || 'Try again in a moment.');
    } finally {
      setRestoringId(null);
    }
  };

  const handleDelete = (version) => {
    Alert.alert(
      'Delete this version?',
      'This version will be permanently removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.plans.versions.delete(planId, version.id);
              setVersions(v => v.filter(x => x.id !== version.id));
            } catch (err) {
              Alert.alert('Couldn\u2019t delete', err?.message || 'Try again later.');
            }
          },
        },
      ],
    );
  };

  const renderVersion = (v) => {
    const isRestoring = restoringId === v.id;
    const weeks  = v.summary?.weeks || '—';
    const days   = v.summary?.daysPerWeek || '—';
    const count  = v.summary?.activityCount || 0;
    const level  = v.summary?.fitnessLevel
      ? v.summary.fitnessLevel.charAt(0).toUpperCase() + v.summary.fitnessLevel.slice(1)
      : null;

    return (
      <View key={v.id} style={s.card}>
        <View style={s.cardHeader}>
          <View style={s.tag}>
            <Text style={s.tagText}>{reasonLabel(v.reason)}</Text>
          </View>
          <Text style={s.timestamp}>{formatDate(v.createdAt)}</Text>
        </View>

        <View style={s.summary}>
          <View style={s.summaryItem}>
            <Text style={s.summaryLabel}>Weeks</Text>
            <Text style={s.summaryValue}>{weeks}</Text>
          </View>
          <View style={s.summaryItem}>
            <Text style={s.summaryLabel}>Days/week</Text>
            <Text style={s.summaryValue}>{days}</Text>
          </View>
          <View style={s.summaryItem}>
            <Text style={s.summaryLabel}>Sessions</Text>
            <Text style={s.summaryValue}>{count}</Text>
          </View>
          {level && (
            <View style={s.summaryItem}>
              <Text style={s.summaryLabel}>Level</Text>
              <Text style={s.summaryValue}>{level}</Text>
            </View>
          )}
        </View>

        <View style={s.actions}>
          <TouchableOpacity
            style={[s.restoreBtn, isRestoring && s.btnDisabled]}
            onPress={() => handleRestore(v)}
            disabled={isRestoring}
            activeOpacity={0.85}
          >
            {isRestoring ? (
              <ActivityIndicator color={colors.bg} size="small" />
            ) : (
              <Text style={s.restoreBtnText}>Restore</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={s.deleteBtn}
            onPress={() => handleDelete(v)}
            activeOpacity={0.7}
          >
            <Text style={s.deleteBtnText}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Version history</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={[s.centered]}>
          <ActivityIndicator color={colors.textMid} />
        </View>
      ) : versions.length === 0 ? (
        <View style={[s.centered, { paddingHorizontal: 32 }]}>
          <MaterialCommunityIcons name="history" size={40} color={colors.textMuted} />
          <Text style={s.emptyTitle}>No saved versions yet</Text>
          <Text style={s.emptyBody}>
            We'll save a version automatically the next time you regenerate your plan, so you can always go back.
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={s.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textMid} />}
          showsVerticalScrollIndicator={false}
        >
          <Text style={s.intro}>
            Every time you regenerate your plan, we save the old version here — so you can always restore it.
          </Text>
          {versions.map(renderVersion)}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20 },
  headerTitle: { fontSize: 17, fontFamily: FF.semibold, fontWeight: '600', color: colors.text },

  scroll: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 },

  intro: {
    fontSize: 14, lineHeight: 20,
    color: colors.textMuted, fontFamily: FF.regular, fontWeight: '300',
    marginBottom: 20,
  },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: {
    fontSize: 17, fontFamily: FF.semibold, fontWeight: '600', color: colors.text,
    marginTop: 16, marginBottom: 6,
  },
  emptyBody: {
    fontSize: 14, lineHeight: 20,
    color: colors.textMuted, fontFamily: FF.regular, fontWeight: '300',
    textAlign: 'center',
  },

  card: {
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
    borderRadius: 16, padding: 16, marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 12,
  },
  tag: {
    backgroundColor: 'rgba(232,69,139,0.12)',
    borderColor: 'rgba(232,69,139,0.32)', borderWidth: 1,
    borderRadius: 100, paddingHorizontal: 10, paddingVertical: 4,
  },
  tagText: {
    fontSize: 10, fontWeight: '600', fontFamily: FF.semibold,
    color: colors.primary, textTransform: 'uppercase', letterSpacing: 0.6,
  },
  timestamp: { fontSize: 12, fontFamily: FF.regular, color: colors.textFaint },

  summary: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 24,
    marginBottom: 16,
  },
  summaryItem: {},
  summaryLabel: {
    fontSize: 10, fontWeight: '500', fontFamily: FF.medium,
    color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5,
    marginBottom: 2,
  },
  summaryValue: {
    fontSize: 15, fontFamily: FF.semibold, fontWeight: '600', color: colors.text,
    fontVariant: ['tabular-nums'],
  },

  actions: { flexDirection: 'row', gap: 10 },
  restoreBtn: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: 100, paddingVertical: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  restoreBtnText: { fontSize: 14, fontFamily: FF.semibold, fontWeight: '600', color: colors.bg },
  btnDisabled: { opacity: 0.6 },
  deleteBtn: {
    paddingHorizontal: 18, paddingVertical: 12,
    borderRadius: 100, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  deleteBtnText: { fontSize: 13, fontFamily: FF.medium, fontWeight: '500', color: colors.textMuted },
});
