import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.EXPO_PUBLIC_SENTRY_DSN,
  debug: false,
  tracesSampleRate: 0.2,
  environment: __DEV__ ? 'development' : 'production',
});

import React, { useState, useEffect, useCallback } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { View, Text, Image, StyleSheet } from 'react-native';
import { useFonts, Poppins_300Light, Poppins_400Regular, Poppins_500Medium, Poppins_600SemiBold } from '@expo-google-fonts/poppins';
import * as SplashScreen from 'expo-splash-screen';
import { getSession } from './src/services/authService';
import { hydrateFromServer } from './src/services/storageService';
import { checkStripeReturn } from './src/services/subscriptionService';
import { configureRevenueCat, loginRevenueCat, logoutRevenueCat } from './src/services/revenueCatService';
import analytics from './src/services/analyticsService';

import SignInScreen        from './src/screens/SignInScreen';
import HomeScreen          from './src/screens/HomeScreen';
import GoalSetupScreen     from './src/screens/GoalSetupScreen';
import PlanConfigScreen    from './src/screens/PlanConfigScreen';
import WeekViewScreen      from './src/screens/WeekViewScreen';
import ActivityDetailScreen from './src/screens/ActivityDetailScreen';
import SettingsScreen      from './src/screens/SettingsScreen';
import PlanLoadingScreen   from './src/screens/PlanLoadingScreen';
import CalendarScreen      from './src/screens/CalendarScreen';
import PlanOverviewScreen  from './src/screens/PlanOverviewScreen';
import PlanReadyScreen     from './src/screens/PlanReadyScreen';
import CoachChatScreen     from './src/screens/CoachChatScreen';
import FeedbackScreen      from './src/screens/FeedbackScreen';
import SupportChatScreen   from './src/screens/SupportChatScreen';
import ChangeCoachScreen   from './src/screens/ChangeCoachScreen';
import PaywallScreen       from './src/screens/PaywallScreen';
import BeginnerProgramScreen from './src/screens/BeginnerProgramScreen';
import NotificationsScreen from './src/screens/NotificationsScreen';
import AboutScreen         from './src/screens/AboutScreen';
import MaintenanceScreen   from './src/screens/MaintenanceScreen';
import WebWrapper          from './src/components/WebWrapper';
import { registerForPushNotifications, addNotificationResponseListener } from './src/services/notificationService';
import { api } from './src/services/api';

const Stack = createStackNavigator();

const slide = ({ current, layouts }) => ({
  cardStyle: {
    transform: [{
      translateX: current.progress.interpolate({
        inputRange: [0, 1],
        outputRange: [layouts.screen.width * 0.25, 0],
      }),
    }],
    opacity: current.progress.interpolate({
      inputRange: [0, 0.5, 1],
      outputRange: [0, 0.8, 1],
    }),
  },
});

SplashScreen.preventAutoHideAsync().catch(() => {});

function App() {
  const [initialRoute, setInitialRoute] = useState(null);
  const [maintenanceMode, setMaintenanceMode] = useState(null); // null = loading, false = ok, object = maintenance
  const navigationRef = React.useRef(null);
  const routeNameRef = React.useRef(null);

  const [fontsLoaded] = useFonts({
    Poppins_300Light,
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
  });

  useEffect(() => {
    // Check remote config for maintenance mode (before auth)
    api.appConfig.get().then(config => {
      const maint = config?.maintenance_mode;
      if (maint?.enabled) {
        setMaintenanceMode(maint);
      } else {
        setMaintenanceMode(false);
      }
    }).catch(() => setMaintenanceMode(false));

    analytics.init();

    // Initialise RevenueCat early (before auth — it works with anonymous users too)
    configureRevenueCat(null).catch(() => {});

    getSession().then(async session => {
      if (session) {
        analytics.identify(session.user?.id, { email: session.user?.email });

        // Link RevenueCat to the authenticated user
        loginRevenueCat(session.user?.id).catch(() => {});

        await hydrateFromServer().catch(() => {});

        // Register for push notifications
        registerForPushNotifications().catch(() => {});

        // On web: detect return from Stripe Checkout and go straight to GoalSetup
        const stripeSession = await checkStripeReturn().catch(() => null);
        if (stripeSession) {
          setInitialRoute('GoalSetup');
          return;
        }
      }
      setInitialRoute(session ? 'Home' : 'SignIn');
    });

    // Handle notification taps — route to the appropriate screen
    const responseListener = addNotificationResponseListener(response => {
      const nav = navigationRef.current;
      if (!nav) return;

      const data = response?.notification?.request?.content?.data;
      const type = data?.type;

      // Support / admin reply notifications → open the support chat thread
      if ((type === 'support_reply' || type === 'admin_reply') && data?.feedbackId) {
        nav.navigate('SupportChat', { feedbackId: data.feedbackId, isNew: false });
      } else if (type === 'coach_checkin' && data?.planId) {
        nav.navigate('CoachChat', { planId: data.planId });
      } else {
        nav.navigate('Notifications');
      }
    });

    return () => responseListener?.remove();
  }, []);

  // Hide native splash as soon as fonts are loaded — we show our own branded screen
  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded]);

  const onLayoutRootView = useCallback(async () => {
    // No-op now — splash is hidden via useEffect above
  }, []);

  // Before fonts load, show nothing (native splash is still visible)
  if (!fontsLoaded) return null;

  // Fonts loaded but still determining route / maintenance — show branded loading
  if (!initialRoute || maintenanceMode === null) {
    return (
      <SafeAreaProvider>
        <StatusBar style="light" />
        <View style={loadingStyles.container}>
          <Image source={require('./assets/icon.png')} style={loadingStyles.logo} />
          <Text style={loadingStyles.title}>ETAPA</Text>
          <Text style={loadingStyles.tagline}>train with purpose</Text>
        </View>
      </SafeAreaProvider>
    );
  }

  // Show maintenance screen if enabled
  if (maintenanceMode) {
    return (
      <SafeAreaProvider>
        <StatusBar style="light" />
        <MaintenanceScreen
          title={maintenanceMode.title}
          message={maintenanceMode.message}
          onRetry={() => {
            api.appConfig.get().then(config => {
              const maint = config?.maintenance_mode;
              if (!maint?.enabled) setMaintenanceMode(false);
            }).catch(() => {});
          }}
        />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <WebWrapper>
        <View style={{ flex: 1 }} onLayout={onLayoutRootView}>
          <NavigationContainer
              ref={navigationRef}
              onReady={() => {
                routeNameRef.current = navigationRef.current?.getCurrentRoute()?.name;
              }}
              onStateChange={() => {
                const prev = routeNameRef.current;
                const current = navigationRef.current?.getCurrentRoute()?.name;
                if (current && current !== prev) {
                  analytics.events.screenViewed(current);
                }
                routeNameRef.current = current;
              }}
            >
            <Stack.Navigator
              initialRouteName={initialRoute}
              screenOptions={{
                headerShown: false,
                cardStyle: { backgroundColor: '#000000' },
                cardStyleInterpolator: slide,
              }}
            >
              <Stack.Screen name="SignIn"         component={SignInScreen} />
              <Stack.Screen name="Home"           component={HomeScreen} />
              <Stack.Screen name="GoalSetup"      component={GoalSetupScreen} />
              <Stack.Screen name="PlanConfig"     component={PlanConfigScreen} />
              <Stack.Screen name="PlanLoading"    component={PlanLoadingScreen} />
              <Stack.Screen name="WeekView"       component={WeekViewScreen} />
              <Stack.Screen name="Calendar"       component={CalendarScreen} />
              <Stack.Screen name="PlanReady"      component={PlanReadyScreen} />
              <Stack.Screen name="PlanOverview"   component={PlanOverviewScreen} />
              <Stack.Screen name="CoachChat"      component={CoachChatScreen} />
              <Stack.Screen name="ActivityDetail" component={ActivityDetailScreen} />
              <Stack.Screen name="Settings"       component={SettingsScreen} />
              <Stack.Screen name="Feedback"       component={FeedbackScreen} />
              <Stack.Screen name="SupportChat"    component={SupportChatScreen} />
              <Stack.Screen name="ChangeCoach"    component={ChangeCoachScreen} />
              <Stack.Screen name="Paywall"        component={PaywallScreen} />
              <Stack.Screen name="BeginnerProgram" component={BeginnerProgramScreen} />
              <Stack.Screen name="Notifications"  component={NotificationsScreen} />
              <Stack.Screen name="About"          component={AboutScreen} />
            </Stack.Navigator>
          </NavigationContainer>
        </View>
      </WebWrapper>
    </SafeAreaProvider>
  );
}

const loadingStyles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: '#000000',
    justifyContent: 'center', alignItems: 'center',
  },
  logo: {
    width: 80, height: 80, borderRadius: 22, marginBottom: 20,
    borderWidth: 1, borderColor: 'rgba(217,119,6,0.2)',
  },
  title: {
    fontSize: 28, fontWeight: '600', fontFamily: 'Poppins_600SemiBold',
    color: '#FFFFFF', letterSpacing: 3, textTransform: 'uppercase',
  },
  tagline: {
    fontSize: 14, fontWeight: '300', fontFamily: 'Poppins_300Light',
    color: '#606068', marginTop: 4, letterSpacing: 0.5,
  },
});

export default Sentry.wrap(App);
