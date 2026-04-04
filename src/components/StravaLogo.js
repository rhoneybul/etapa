/**
 * StravaLogo — Renders the Strava icon mark as a pure React Native View
 * (two upward-pointing chevrons drawn with CSS transforms).
 * No react-native-svg dependency — avoids native crashes on some devices.
 *
 * Props:
 *   size   — overall width/height in dp (default 24)
 *   color  — fill colour (default Strava orange #FC4C02)
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function StravaLogo({ size = 24, color = '#FC4C02' }) {
  // Scale all dimensions relative to size
  const scale = size / 24;
  const bigH = 16 * scale;
  const bigW = 3 * scale;
  const smallH = 10 * scale;
  const smallW = 2.5 * scale;

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      {/* Large chevron — two rotated bars forming a V */}
      <View style={[styles.chevron, { bottom: 2 * scale, left: 2 * scale }]}>
        <View style={[styles.bar, {
          height: bigH, width: bigW, backgroundColor: color,
          transform: [{ rotate: '-25deg' }],
          borderRadius: bigW / 2,
        }]} />
        <View style={[styles.bar, {
          height: bigH, width: bigW, backgroundColor: color,
          transform: [{ rotate: '25deg' }],
          marginLeft: -bigW * 0.3,
          borderRadius: bigW / 2,
        }]} />
      </View>
      {/* Small chevron — offset right, lighter */}
      <View style={[styles.chevron, { bottom: 5 * scale, left: 11 * scale }]}>
        <View style={[styles.bar, {
          height: smallH, width: smallW, backgroundColor: color, opacity: 0.6,
          transform: [{ rotate: '-25deg' }],
          borderRadius: smallW / 2,
        }]} />
        <View style={[styles.bar, {
          height: smallH, width: smallW, backgroundColor: color, opacity: 0.6,
          transform: [{ rotate: '25deg' }],
          marginLeft: -smallW * 0.3,
          borderRadius: smallW / 2,
        }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative', overflow: 'hidden' },
  chevron: { position: 'absolute', flexDirection: 'row', alignItems: 'flex-end' },
  bar: {},
});
