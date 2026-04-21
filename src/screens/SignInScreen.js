import React, { useRef, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, Dimensions, Platform, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, fontFamily } from '../theme';
import {
  signInWithGoogle, signInWithApple, onAuthStateChange, getSession, isSupabaseConfigured,
} from '../services/authService';
import { ensureUserData, hydrateFromServer } from '../services/storageService';
import { loginRevenueCat } from '../services/revenueCatService';
import * as AppleAuthentication from 'expo-apple-authentication';
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

const AppleLogo = () => (
  <Svg width={18} height={18} viewBox="0 0 24 24" fill="#000000">
    <Path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.51-3.23 0-1.44.64-2.2.45-3.06-.4C3.79 16.17 4.36 9.05 8.93 8.8c1.28.07 2.17.72 2.92.77.99-.2 1.94-.78 3-.84 1.28-.1 2.25.38 2.88 1.16-2.64 1.58-2.01 5.07.32 6.04-.5 1.32-.74 1.97-1.57 3.14-.76 1.08-1.83 2.13-3.43 2.21zM12.03 8.7c-.15-2.34 1.84-4.38 4.04-4.55.3 2.63-2.34 4.6-4.04 4.55z" />
  </Svg>
);

export default function SignInScreen({ navigation }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const logoScale = useRef(new Animated.Value(0.7)).current;
  const glowAnim = useRef(new Animated.Value(0.3)).current;
  const [loadingProvider, setLoadingProvider] = useState(null);
  const [authError, setAuthError] = useState(null);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    // Check if Apple Sign-In is available on this device
    AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => {});

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

    const unsubscribe = onAuthStateChange(async user => {
      if (user) {
        const provider = user.app_metadata?.provider || 'unknown';
        analytics.events.signedIn(provider);
        analytics.identify(user.id, { email: user.email });
        // Identify this user in RevenueCat BEFORE navigating so that any
        // subsequent subscription check gets the correct entitlements.
        // Must be awaited here — App.js only does this on cold start.
        await loginRevenueCat(user.id).catch(() => {});
        // Clear stale data from a previous user, then hydrate from server
        const cleared = await ensureUserData(user.id);
        await hydrateFromServer({ force: cleared });
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
    setLoadingProvider('google');
    try {
      await signInWithGoogle();
    } catch (err) {
      setAuthError(err.message);
      setLoadingProvider(null);
    }
    if (Platform.OS !== 'web') setLoadingProvider(null);
  };

  const handleAppleAuth = async () => {
    if (!isSupabaseConfigured) {
      navigation.replace('Home');
      return;
    }
    setAuthError(null);
    setLoadingProvider('apple');
    try {
      await signInWithApple();
    } catch (err) {
      if (err.code === 'ERR_REQUEST_CANCELED') {
        // User cancelled — don't show an error
        setLoadingProvider(null);
        return;
      }
      setAuthError(err.message);
      setLoadingProvider(null);
    }
    if (Platform.OS !== 'web') setLoadingProvider(null);
  };

  return (
    <View style={s.container}>
      {/* Background gradient — dark with warm amber undertone */}
      <LinearGradient
        colors={['#0C0D10', '#110F0A', '#0C0D10']}
        locations={[0, 0.5, 1]}
        style={s.gradient}
      />

      {/* Decorative ambient glow behind logo */}
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
          <Text style={s.tagline}>Cycling coaching that meets you where you are.</Text>

          {/* Benefit chips — surface the brand promise. "AI training plans" and
              "Built for beginners" were too narrow: we serve complete beginners,
              returning riders, women put off by cycling's gatekept culture, and
              experienced riders who just want guidance without jargon. These
              chips lean coaching-and-guidance first, AI in the background. */}
          <View style={s.benefitChips}>
            <View style={s.benefitChip}>
              <Text style={s.benefitChipText}>Any goal, any level</Text>
            </View>
            <View style={s.benefitChip}>
              <Text style={s.benefitChipText}>A coach in your pocket</Text>
            </View>
            <View style={s.benefitChip}>
              <Text style={s.benefitChipText}>Plans that fit real life</Text>
            </View>
          </View>
        </Animated.View>

        {/* Auth section — pinned to bottom */}
        <Animated.View style={[s.bottomSection, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          {authError ? <Text style={s.errorText}>{authError}</Text> : null}

          {appleAvailable && (
            <TouchableOpacity
              style={s.btnApple}
              onPress={handleAppleAuth}
              activeOpacity={0.85}
              disabled={!!loadingProvider}
            >
              <View style={s.btnLogo}><AppleLogo /></View>
              <Text style={s.btnAppleText}>{loadingProvider === 'apple' ? 'Signing in...' : 'Continue with Apple'}</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={s.btnGoogle}
            onPress={handleGoogleAuth}
            activeOpacity={0.85}
            disabled={!!loadingProvider}
          >
            <View style={s.btnLogo}><GoogleLogo /></View>
            <Text style={s.btnGoogleText}>{loadingProvider === 'google' ? 'Signing in...' : 'Continue with Google'}</Text>
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

  // Subtle glow orb behind logo
  glowOrb: {
    position: 'absolute',
    top: height * 0.22,
    left: width * 0.5 - 120,
    width: 240, height: 240, borderRadius: 120,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },

  // Subtle decorative rings and lines
  decorWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' },
  decorRing1: {
    position: 'absolute', top: -60, right: -80,
    width: 260, height: 260, borderRadius: 130,
    borderWidth: 1, borderColor: 'rgba(232,69,139,0.06)',
  },
  decorRing2: {
    position: 'absolute', bottom: 160, left: -40,
    width: 180, height: 180, borderRadius: 90,
    borderWidth: 1, borderColor: 'rgba(232,69,139,0.04)',
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 10,
    marginBottom: 28,
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

  // Benefit chips — three small pills under the tagline.
  benefitChips: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center',
    marginTop: 24, gap: 8, paddingHorizontal: 24,
  },
  benefitChip: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1, borderColor: 'rgba(232,69,139,0.25)',
    backgroundColor: 'rgba(232,69,139,0.08)',
  },
  benefitChipText: {
    fontSize: 11, fontWeight: '500', fontFamily: FF.medium,
    color: 'rgba(240,240,242,0.85)',
    letterSpacing: 0.3,
  },

  // Bottom auth section
  bottomSection: { paddingHorizontal: 28, paddingBottom: 32 },

  btnApple: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 17,
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  btnAppleText: {
    flex: 1, textAlign: 'center',
    fontSize: 16, fontWeight: '500', fontFamily: FF.medium,
    color: '#000',
  },
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
