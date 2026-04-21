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
import { View } from 'react-native';
import { useFonts, Poppins_300Light, Poppins_400Regular, Poppins_500Medium, Poppins_600SemiBold } from '@expo-google-fonts/poppins';
import * as SplashScreen from 'expo-splash-screen';
import { getSession, getCurrentUser, signOut, onAuthStateChange } from './src/services/authService';
import { ensureUserData, hydrateFromServer } from './src/services/storageService';
// Stripe removed — all payments go through Apple IAP via RevenueCat
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
import PlanChangesScreen   from './src/screens/PlanChangesScreen';
import ApplySuggestionScreen from './src/screens/ApplySuggestionScreen';
import CoachChatScreen     from './src/screens/CoachChatScreen';
import FeedbackScreen      from './src/screens/FeedbackScreen';
import SupportChatScreen   from './src/screens/SupportChatScreen';
import ChangeCoachScreen   from './src/screens/ChangeCoachScreen';
import PaywallScreen       from './src/screens/PaywallScreen';
import BeginnerProgramScreen from './src/screens/BeginnerProgramScreen';
import QuickPlanScreen       from './src/screens/QuickPlanScreen';
import RegeneratePlanScreen  from './src/screens/RegeneratePlanScreen';
import PlanVersionHistoryScreen from './src/screens/PlanVersionHistoryScreen';
import NotificationsScreen from './src/screens/NotificationsScreen';
import AboutScreen         from './src/screens/AboutScreen';
import MaintenanceScreen   from './src/screens/MaintenanceScreen';
import ForceUpgradeScreen  from './src/screens/ForceUpgradeScreen';
import WebWrapper          from './src/components/WebWrapper';
import { registerForPushNotifications, addNotificationResponseListener } from './src/services/notificationService';
import { api } from './src/services/api';
import remoteConfig from './src/services/remoteConfig';

import Constants from 'expo-constants';

const APP_VERSION = Constants.expoConfig?.version || Constants.manifest?.version || '0.0.0';

const Stack = createStackNavigator();

/**
 * Compare two semver strings. Returns:
 *  -1 if a < b,  0 if a === b,  1 if a > b
 */
function compareSemver(a, b) {
  const pa = (a || '0.0.0').split('.').map(Number);
  const pb = (b || '0.0.0').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na < nb) return -1;
    if (na > nb) return 1;
  }
  return 0;
}

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

// Global maintenance setter — screens can import and call this to trigger
// the maintenance gate from anywhere (e.g. on pull-to-refresh).
let _setMaintenanceMode = null;
export function triggerMaintenanceMode(config) {
  _setMaintenanceMode?.(config);
}

function App() {
  const [initialRoute, setInitialRoute] = useState(null);
  const [maintenanceMode, setMaintenanceMode] = useState(null); // null = loading, false = ok, object = maintenance
  const [forceUpgrade, setForceUpgrade] = useState(null);       // null = loading, false = ok, object = upgrade config

  // Expose the setter globally
  _setMaintenanceMode = setMaintenanceMode;
  const navigationRef = React.useRef(null);
  const routeNameRef = React.useRef(null);

  const [fontsLoaded] = useFonts({
    Poppins_300Light,
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
  });

  useEffect(() => {
    // Boot the remote config service — loads cache, fires background refresh.
    // Non-blocking: the app renders immediately with cached / default values.
    remoteConfig.init().catch(() => {});

    // Check remote config for maintenance mode & minimum version (before auth)
    api.appConfig.get().then(config => {
      // Maintenance mode
      const maint = config?.maintenance_mode;
      if (maint?.enabled) {
        setMaintenanceMode(maint);
      } else {
        setMaintenanceMode(false);
      }

      // Minimum version gate
      const mv = config?.min_version;
      const requiredVersion = mv?.version;
      const currentVersion = APP_VERSION;
      if (requiredVersion && compareSemver(currentVersion, requiredVersion) < 0) {
        setForceUpgrade(mv);
      } else {
        setForceUpgrade(false);
      }
    }).catch(() => {
      setMaintenanceMode(false);
      setForceUpgrade(false);
    });

    analytics.init();

    // Initialise RevenueCat early (before auth — it works with anonymous users too)
    configureRevenueCat(null).catch(() => {});

    getSession().then(async session => {
      if (session) {
        // Verify the session is still valid against the server.
        // getSession() reads from cache — a deleted account or expired token
        // will still return a session. getUser() makes a server call.
        try {
          const user = await getCurrentUser();
          if (!user) {
            // Session is stale — sign out and send to login
            await signOut().catch(() => {});
            setInitialRoute('SignIn');
            return;
          }
        } catch {
          // Network error verifying — sign out to be safe
          await signOut().catch(() => {});
          setInitialRoute('SignIn');
          return;
        }

        analytics.identify(session.user?.id, { email: session.user?.email });

        // Link RevenueCat to the authenticated user — awaited so that subscription
        // checks in HomeScreen see the correct entitlements for this user.
        await loginRevenueCat(session.user?.id).catch(() => {});

        // Verify the cached user matches whoever is in local storage.
        // If the app was force-quit mid-sign-out, or a different account was
        // used previously, this clears stale local data before hydrating.
        const cleared = await ensureUserData(session.user?.id).catch(() => false);
        await hydrateFromServer({ force: cleared }).catch(() => {});

        // Register for push notifications
        registerForPushNotifications().catch(() => {});

        // Stripe checkout removed — payments are handled via Apple IAP / RevenueCat
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

    // Listen for auth state changes — if user gets signed out (e.g. token
    // revoked, account deleted), reset to SignIn immediately.
    const unsubAuth = onAuthStateChange((user) => {
      if (!user && initialRoute && initialRoute !== 'SignIn') {
        const nav = navigationRef.current;
        if (nav) {
          nav.reset({ index: 0, routes: [{ name: 'SignIn' }] });
        }
      }
    });

    return () => {
      responseListener?.remove();
      unsubAuth();
    };
  }, []);

  // Keep native splash visible until the app is fully ready (fonts + route determined).
  // This avoids a jarring "two splash screens" effect.
  useEffect(() => {
    if (fontsLoaded && initialRoute && maintenanceMode !== null && forceUpgrade !== null) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, initialRoute, maintenanceMode, forceUpgrade]);

  const onLayoutRootView = useCallback(async () => {
    // No-op — splash is hidden via useEffect above
  }, []);

  // Before everything is ready, show nothing (native splash stays visible)
  if (!fontsLoaded || !initialRoute || maintenanceMode === null || forceUpgrade === null) return null;

  // Show maintenance screen if enabled
  if (maintenanceMode) {
    return (
      <SafeAreaProvider>
        <StatusBar style="light" />
        <MaintenanceScreen
          title={maintenanceMode.title}
          message={maintenanceMode.message}
          onRetry={async () => {
            try {
              const config = await api.appConfig.get();
              const maint = config?.maintenance_mode;
              if (!maint?.enabled) setMaintenanceMode(false);
            } catch {}
          }}
        />
      </SafeAreaProvider>
    );
  }

  // Show forced upgrade screen if app version is below minimum
  if (forceUpgrade) {
    return (
      <SafeAreaProvider>
        <StatusBar style="light" />
        <ForceUpgradeScreen
          message={forceUpgrade.message}
          iosUrl={forceUpgrade.iosUrl}
          androidUrl={forceUpgrade.androidUrl}
          onRetry={() => {
            // Re-check remote config (user may have updated via OTA / store)
            api.appConfig.get().then(config => {
              const mv = config?.min_version;
              const requiredVersion = mv?.version;
              const currentVersion = APP_VERSION;
              if (!requiredVersion || compareSemver(currentVersion, requiredVersion) >= 0) {
                setForceUpgrade(false);
              }
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
              <Stack.Screen name="PlanChanges"    component={PlanChangesScreen} />
              <Stack.Screen name="ApplySuggestion" component={ApplySuggestionScreen} />
              <Stack.Screen name="PlanOverview"   component={PlanOverviewScreen} />
              <Stack.Screen name="CoachChat"      component={CoachChatScreen} />
              <Stack.Screen name="ActivityDetail" component={ActivityDetailScreen} />
              <Stack.Screen name="Settings"       component={SettingsScreen} />
              <Stack.Screen name="Feedback"       component={FeedbackScreen} />
              <Stack.Screen name="SupportChat"    component={SupportChatScreen} />
              <Stack.Screen name="ChangeCoach"    component={ChangeCoachScreen} />
              <Stack.Screen name="Paywall"        component={PaywallScreen} />
              <Stack.Screen name="BeginnerProgram" component={BeginnerProgramScreen} />
              <Stack.Screen name="QuickPlan"      component={QuickPlanScreen} />
              <Stack.Screen name="RegeneratePlan" component={RegeneratePlanScreen} />
              <Stack.Screen name="PlanVersionHistory" component={PlanVersionHistoryScreen} />
              <Stack.Screen name="Notifications"  component={NotificationsScreen} />
              <Stack.Screen name="About"          component={AboutScreen} />
            </Stack.Navigator>
          </NavigationContainer>
        </View>
      </WebWrapper>
    </SafeAreaProvider>
  );
}

export default Sentry.wrap(App);
