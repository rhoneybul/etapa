import React, { useRef, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, Dimensions, Platform, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, fontFamily } from '../theme';
import {
  signInWithGoogle, onAuthStateChange, getSession, isSupabaseConfigured,
} from '../services/authService';
import analytics from '../services/analyticsService';

const { width, height } = Dimensions.get('window');
const FF = fontFamily;

import Svg, { Path } from 'react-native-svg';

const GoogleLogo = () => (
  <Svg width={18} height={18} viewBox="0 0 16 16" fill="none">
    <Path d="M15.5 8.2c0-.6-.1-1.1-.2-1.6H8v3h4.2c-.2 1-.8 1.8-1.6 2.3v2h2.6c1.5-1.4 2.3-3.4 2.3-5.7z" fill="#4285F4" />
    <Path d="M8 16c2.1 0 3.9-.7 5.2-1.9l-2.6-2c-.7.5-1.6.8-2.6.8-2 0-3.7-1.3-4.3-3.2H1v2c1.3 2.6 4 4.3 7 4.3z" fill="#34A853" />
    <Path d="M3.7 9.7c-.3-.8-.5-1.6-.5-2.5 0-.9.2-1.7.5-2.5V2.7H1C.4 3.9 0 5.4 0 7.2c0 1.8.4 3.3 1 4.5l2.7-2z" fill="#FBBC05" />
    <Path d="M8 3.2c1.1 0 2.1.4 2.9 1.1l2.2-2.2C11.9 1 10.1.2 8 .2 5 .2 2.3 1.9 1 4.5l2.7 2C4.3 4.6 6 3.2 8 3.2z" fill="#EA4335" />
  </Svg>
);

export default function SignInScreen({ navigation }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const logoScale = useRef(new Animated.Value(0.7)).current;
  const glowAnim = useRef(new Animated.Value(0.3)).current;
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 900, useNativeDriver: true }),
      Animated.spring(logoScale, { toValue: 1, tension: 40, friction: 8, useNativeDriver: true }),
    ]).start();

    // Subtle pulsing glow
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 0.6, duration: 2000, useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0.3, duration: 2000, useNativeDriver: true }),
      ])
    ).start();

    getSession().then(session => {
      if (session) navigation.replace('Home');
    });

    const unsubscribe = onAuthStateChange(user => {
      if (user) {
        analytics.events.signedIn('google');
        analytics.identify(user.id, { email: user.email });
        navigation.replace('Home');
      }
    });
    return unsubscribe;
  }, []);

  const handleGoogleAuth = async () => {
    if (!isSupabaseConfigured) {
      navigation.replace('Home');
      return;
    }
    setAuthError(null);
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setAuthError(err.message);
      setLoading(false);
    }
    if (Platform.OS !== 'web') setLoading(false);
  };

  return (
    <View style={s.container}>
      {/* Background gradient — dark with warm amber undertone */}
      <LinearGradient
        colors={['#0C0D10', '#110F0A', '#0C0D10']}
        locations={[0, 0.5, 1]}
        style={s.gradient}
      />

      {/* Decorative amber glow behind logo */}
      <Animated.View style={[s.glowOrb, { opacity: glowAnim }]} />

      {/* Subtle geometric accents */}
      <View style={s.decorWrap}>
        <View style={s.decorRing1} />
        <View style={s.decorRing2} />
        <View style={s.decorLine1} />
        <View style={s.decorLine2} />
      </View>

      <SafeAreaView style={s.safe}>
        {/* Logo + branding — centered in upper portion */}
        <Animated.View style={[s.logoSection, { opacity: fadeAnim, transform: [{ scale: logoScale }] }]}>
          <View style={s.logoContainer}>
            <Image
              source={require('../../assets/icon.png')}
              style={s.logoImage}
            />
          </View>
          <Text style={s.title}>Etapa</Text>
          <Text style={s.tagline}>Train with purpose</Text>
        </Animated.View>

        {/* Auth section — pinned to bottom */}
        <Animated.View style={[s.bottomSection, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          {authError ? <Text style={s.errorText}>{authError}</Text> : null}

          <TouchableOpacity
            style={s.btnGoogle}
            onPress={handleGoogleAuth}
            activeOpacity={0.85}
            disabled={loading}
          >
            <View style={s.btnLogo}><GoogleLogo /></View>
            <Text style={s.btnGoogleText}>{loading ? 'Signing in...' : 'Continue with Google'}</Text>
          </TouchableOpacity>

          <Text style={s.terms}>
            By continuing you agree to our{'\n'}
            <Text style={s.termsLink}>Terms of Service</Text> and <Text style={s.termsLink}>Privacy Policy</Text>
          </Text>
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0C0D10' },
  gradient: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },

  // Amber glow orb behind logo
  glowOrb: {
    position: 'absolute',
    top: height * 0.22,
    left: width * 0.5 - 120,
    width: 240, height: 240, borderRadius: 120,
    backgroundColor: 'rgba(217,119,6,0.08)',
  },

  // Subtle decorative rings and lines
  decorWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' },
  decorRing1: {
    position: 'absolute', top: -60, right: -80,
    width: 260, height: 260, borderRadius: 130,
    borderWidth: 1, borderColor: 'rgba(217,119,6,0.06)',
  },
  decorRing2: {
    position: 'absolute', bottom: 160, left: -40,
    width: 180, height: 180, borderRadius: 90,
    borderWidth: 1, borderColor: 'rgba(217,119,6,0.04)',
  },
  decorLine1: {
    position: 'absolute', top: height * 0.15, left: -40, right: -40,
    height: 1, backgroundColor: 'rgba(255,255,255,0.02)',
    transform: [{ rotate: '-8deg' }],
  },
  decorLine2: {
    position: 'absolute', top: height * 0.65, left: -40, right: -40,
    height: 1, backgroundColor: 'rgba(255,255,255,0.02)',
    transform: [{ rotate: '4deg' }],
  },

  safe: { flex: 1 },

  // Logo section — centered with generous spacing
  logoSection: {
    flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 40,
  },
  logoContainer: {
    width: 120, height: 120, borderRadius: 30,
    overflow: 'hidden',
    shadowColor: '#D97706',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 32,
    elevation: 10,
    marginBottom: 28,
    borderWidth: 1,
    borderColor: 'rgba(217,119,6,0.25)',
  },
  logoImage: { width: 120, height: 120 },
  title: {
    fontSize: 38, fontWeight: '600', fontFamily: FF.semibold,
    color: '#F0F0F2', letterSpacing: 2,
  },
  tagline: {
    fontSize: 15, fontWeight: '300', fontFamily: FF.light,
    color: 'rgba(240,240,242,0.35)', marginTop: 8, letterSpacing: 1,
  },

  // Bottom auth section
  bottomSection: { paddingHorizontal: 28, paddingBottom: 32 },

  btnGoogle: {
    width: '100%',
    backgroundColor: '#F0F0F2',
    borderRadius: 16,
    paddingVertical: 17,
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  btnLogo: {
    width: 22, height: 22,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  btnGoogleText: {
    flex: 1, textAlign: 'center',
    fontSize: 16, fontWeight: '500', fontFamily: FF.medium,
    color: '#0C0D10',
  },

  terms: {
    fontSize: 12, fontWeight: '300', fontFamily: FF.light,
    color: '#4A4D56', textAlign: 'center', marginTop: 20, lineHeight: 18,
  },
  termsLink: { color: colors.primary },
  errorText: {
    fontSize: 13, color: '#EF4444', textAlign: 'center',
    marginBottom: 14, fontWeight: '500', fontFamily: FF.medium,
  },
});
