/**
 * LoadingSplash — the full-screen throbbing splash used on cold-start
 * and plan-delete. Factored out so both paths render the IDENTICAL
 * component — changing spacing, pulse rhythm, or image source here
 * updates both at once.
 *
 * Design note — why icon.png (not splash.png):
 * We originally used the platform splash image (splash.png /
 * splash-android.png) on top of itself to animate a throb, so the
 * hand-off from the OS splash to this screen was pixel-perfect. That
 * broke when splash.png was regenerated with a tiny icon (~14% of
 * the canvas) — on a phone that scales down to a barely-visible
 * ~55pt icon lost in a sea of black, and after an in-place asset
 * overwrite Metro aggressively caches the old bytes so the fix
 * couldn't reliably propagate. We now render the dedicated
 * icon.png asset (1024×1024, icon fills ~44%×74% of the canvas)
 * at a generous fixed size so it is guaranteed visible, whatever
 * the device. The tiny jump from the OS splash is preferable to
 * showing the user a black screen.
 *
 * Renders:
 *   - Black background (matches the native splash's backgroundColor)
 *   - Centered icon, scale-pulsed 1.0 → 1.08 → 1.0 on a 2s loop
 *     for the "throbbing icon" effect
 *   - Optional bottom-pinned label (e.g. "Deleting plan…")
 *
 * Props:
 *   - label?: string — shown in white at the bottom of the screen
 *
 * Everything else is deliberately not configurable. This is the brand
 * loading moment; variants would undermine it.
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, Image, Animated, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fontFamily } from '../theme';

const FF = fontFamily;

// Icon size on screen. The Etapa mark inside icon.png fills roughly
// 44% wide × 74% tall of a 1024×1024 canvas, so at 72×72 container
// the actual glyph reads as ~32×53pt — tight, focused loader.
const ICON_SIZE = 72;
// Faint pink outline behind the icon — a rounded square (matching
// the iOS/Android app-icon silhouette) so it reads as "the Etapa
// app icon, glowing", not a generic loading ring. Sized 1.5× the
// icon container with ~22% corner radius (iOS superellipse approx).
const HALO_SIZE = Math.round(ICON_SIZE * 1.5);
const HALO_RADIUS = Math.round(HALO_SIZE * 0.22);

export default function LoadingSplash({ label = null }) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [pulseAnim]);

  return (
    <View style={s.root}>
      <View style={s.center} pointerEvents="none">
        <Animated.View style={[s.halo, { transform: [{ scale: pulseAnim }] }]} />
        <Animated.Image
          source={require('../../assets/icon.png')}
          style={[s.icon, { transform: [{ scale: pulseAnim }] }]}
          resizeMode="contain"
        />
      </View>
      {label ? (
        <SafeAreaView style={s.overlay} pointerEvents="none">
          <Text style={s.label}>{label}</Text>
        </SafeAreaView>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { width: ICON_SIZE, height: ICON_SIZE },
  // Faint pink outline behind the icon — rounded square matching
  // the iOS/Android app-icon silhouette (not a circle), border only,
  // no fill, so it reads as a whisper-thin app-icon glow. Absolute-
  // positioned so it overlays without pushing the icon off-centre.
  // Pulses in sync with the icon (same scale transform driven by
  // pulseAnim).
  halo: {
    position: 'absolute',
    width: HALO_SIZE,
    height: HALO_SIZE,
    borderRadius: HALO_RADIUS,
    borderWidth: 1,
    borderColor: 'rgba(232, 69, 139, 0.35)',
  },
  overlay: {
    flex: 1, alignItems: 'center', justifyContent: 'flex-end',
    paddingBottom: 60,
  },
  label: {
    fontSize: 14, fontFamily: FF.semibold, fontWeight: '500',
    color: '#fff', letterSpacing: 0.3,
  },
});
