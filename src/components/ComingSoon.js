/**
 * ComingSoon — A subtle banner + modal showing upcoming features.
 * Features are remotely configured via admin dashboard.
 *
 * Usage:
 *   <ComingSoon config={comingSoonConfig} />
 *
 * Config shape (from app_config 'coming_soon'):
 *   {
 *     enabled: true,
 *     showOnHome: false,
 *     title: "What's coming next",
 *     features: [
 *       { text: "Route planning with map preview", emoji: "🗺️" },
 *       { text: "Group challenges with friends", emoji: "👥" },
 *       ...
 *     ]
 *   }
 */
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView,
} from 'react-native';
import { colors, fontFamily } from '../theme';

const FF = fontFamily;

export default function ComingSoon({ config }) {
  const [modalVisible, setModalVisible] = useState(false);

  if (!config?.enabled || !config.features?.length) return null;

  const title = config.title || "What's coming next";

  return (
    <>
      {/* Banner */}
      <TouchableOpacity
        style={s.banner}
        onPress={() => setModalVisible(true)}
        activeOpacity={0.8}
      >
        <View style={s.bannerLeft}>
          <Text style={s.bannerIcon}>✨</Text>
          <Text style={s.bannerText}>{title}</Text>
        </View>
        <Text style={s.bannerArrow}>›</Text>
      </TouchableOpacity>

      {/* Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.handle} />
            <Text style={s.modalTitle}>{title}</Text>
            <Text style={s.modalSub}>
              We're working hard on new features. Here's a sneak peek at what's next.
            </Text>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={s.featureList}
            >
              {config.features.map((f, i) => (
                <View key={i} style={s.featureRow}>
                  <Text style={s.featureEmoji}>{f.emoji || '🔜'}</Text>
                  <Text style={s.featureText}>{f.text}</Text>
                </View>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={s.closeBtn}
              onPress={() => setModalVisible(false)}
              activeOpacity={0.85}
            >
              <Text style={s.closeBtnText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  // ── Banner ──────────────────────────────────────────────────────────────
  banner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16,
    marginHorizontal: 20, marginVertical: 8,
    borderWidth: 1, borderColor: colors.border,
  },
  bannerLeft: {
    flexDirection: 'row', alignItems: 'center', flex: 1,
  },
  bannerIcon: {
    fontSize: 16, marginRight: 10,
  },
  bannerText: {
    fontSize: 14, fontFamily: FF.medium, color: colors.text,
  },
  bannerArrow: {
    fontSize: 20, color: colors.textMid, marginLeft: 8,
  },

  // ── Modal ───────────────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 24, paddingTop: 8, paddingBottom: 40,
    maxHeight: '75%',
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: colors.textFaint, alignSelf: 'center',
    marginTop: 8, marginBottom: 20,
  },
  modalTitle: {
    fontSize: 22, fontFamily: FF.semibold, fontWeight: '600',
    color: colors.text, textAlign: 'center', marginBottom: 6,
  },
  modalSub: {
    fontSize: 14, fontFamily: FF.regular, color: colors.textMid,
    textAlign: 'center', lineHeight: 20, marginBottom: 24,
  },

  featureList: {
    paddingBottom: 12,
  },
  featureRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingVertical: 12, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  featureEmoji: {
    fontSize: 20, marginRight: 14, marginTop: 1,
  },
  featureText: {
    flex: 1, fontSize: 15, fontFamily: FF.regular,
    color: colors.text, lineHeight: 21,
  },

  closeBtn: {
    marginTop: 16, backgroundColor: colors.primary,
    borderRadius: 12, paddingVertical: 14, alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 15, fontFamily: FF.semibold, color: '#fff',
  },
});
