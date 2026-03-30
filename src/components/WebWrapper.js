/**
 * Web layout wrapper
 * On desktop browsers, centres the app at phone width (390px)
 * with a neutral background. On mobile browsers, fills the screen normally.
 */
import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';

export default function WebWrapper({ children }) {
  if (Platform.OS !== 'web') return children;

  return (
    <View style={s.outer}>
      <View style={s.phone}>
        {children}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  outer: {
    flex: 1,
    backgroundColor: '#08090B',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
  },
  phone: {
    width: 390,
    maxWidth: '100%',
    height: '100vh',
    maxHeight: 844,
    overflow: 'hidden',
    backgroundColor: '#0C0D10',
    boxShadow: '0 24px 80px rgba(0,0,0,0.4)',
    borderRadius: 8,
    position: 'relative',
  },
});
