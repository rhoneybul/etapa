/**
 * UpgradePrompt — shown to starter users when they try to create a new plan
 * or from Settings. Explains the upgrade deal: pro-rata refund + 50% off annual.
 *
 * Props:
 *   visible: boolean
 *   onClose: () => void
 *   onUpgrade: () => void   — called after successful upgrade
 *   upgrading: boolean      — loading state
 */
import React from 'react';
import {
  View, Text, TouchableOpacity, Modal, StyleSheet, ActivityIndicator,
} from 'react-native';
import { colors, fontFamily } from '../theme';

const FF = fontFamily;

export default function UpgradePrompt({ visible, onClose, onUpgrade, upgrading }) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={s.overlay}>
        <View style={s.card}>
          {/* Header */}
          <View style={s.badge}>
            <Text style={s.badgeText}>UPGRADE</Text>
          </View>
          <Text style={s.title}>Unlock full access</Text>
          <Text style={s.body}>
            Your starter plan covers the Get into Cycling program. To create custom plans, race plans, or distance goals you need an annual subscription.
          </Text>

          {/* Deal */}
          <View style={s.dealCard}>
            <Text style={s.dealTitle}>Starter upgrade deal</Text>
            <View style={s.dealRow}>
              <Text style={s.dealTick}>{'\u2713'}</Text>
              <Text style={s.dealText}>50% off your first year</Text>
            </View>
            <View style={s.dealRow}>
              <Text style={s.dealTick}>{'\u2713'}</Text>
              <Text style={s.dealText}>Pro-rata refund on your starter fee</Text>
            </View>
            <View style={s.dealRow}>
              <Text style={s.dealTick}>{'\u2713'}</Text>
              <Text style={s.dealText}>Unlimited plans, all goal types</Text>
            </View>
          </View>

          {/* Actions */}
          <TouchableOpacity
            style={[s.upgradeBtn, upgrading && s.upgradeBtnDisabled]}
            onPress={onUpgrade}
            disabled={upgrading}
            activeOpacity={0.85}
          >
            {upgrading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={s.upgradeBtnText}>Upgrade to Annual</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={s.cancelBtn}
            onPress={onClose}
            disabled={upgrading}
            activeOpacity={0.7}
          >
            <Text style={s.cancelBtnText}>Not now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  card: {
    backgroundColor: colors.surface, borderRadius: 20, padding: 28,
    width: '100%', maxWidth: 380,
    borderWidth: 1, borderColor: colors.border,
  },
  badge: {
    alignSelf: 'flex-start', backgroundColor: 'rgba(232,69,139,0.12)',
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, marginBottom: 14,
  },
  badgeText: { fontSize: 10, fontFamily: FF.semibold, color: colors.primary, letterSpacing: 1 },
  title: { fontSize: 22, fontFamily: FF.semibold, color: colors.text, marginBottom: 10 },
  body: { fontSize: 14, fontFamily: FF.regular, color: colors.textMid, lineHeight: 21, marginBottom: 20 },

  dealCard: {
    backgroundColor: 'rgba(232,69,139,0.06)', borderRadius: 14, padding: 18,
    borderWidth: 1, borderColor: 'rgba(232,69,139,0.15)', marginBottom: 24,
  },
  dealTitle: { fontSize: 14, fontFamily: FF.semibold, color: colors.primary, marginBottom: 12 },
  dealRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  dealTick: { color: colors.primary, fontSize: 14, fontFamily: FF.semibold, width: 18, marginTop: 1 },
  dealText: { fontSize: 13, fontFamily: FF.regular, color: colors.text, flex: 1 },

  upgradeBtn: {
    backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', marginBottom: 12,
  },
  upgradeBtnDisabled: { opacity: 0.5 },
  upgradeBtnText: { fontSize: 16, fontFamily: FF.semibold, color: '#fff' },

  cancelBtn: { alignItems: 'center', paddingVertical: 8 },
  cancelBtnText: { fontSize: 14, fontFamily: FF.regular, color: colors.textMuted },
});
