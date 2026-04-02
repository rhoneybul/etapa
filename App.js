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
import { getSession } from './src/services/authService';
import { hydrateFromServer } from './src/services/storageService';
import { checkStripeReturn } from './src/services/subscriptionService';
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
import ChangeCoachScreen   from './src/screens/ChangeCoachScreen';
import PaywallScreen       from './src/screens/PaywallScreen';
import BeginnerProgramScreen from './src/screens/BeginnerProgramScreen';
import NotificationsScreen from './src/screens/NotificationsScreen';
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
    getSession().then(async session => {
      if (session) {
        analytics.identify(session.user?.id, { email: session.user?.email });
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

    // Handle notification taps — navigate to Notifications screen
    const responseListener = addNotificationResponseListener(response => {
      const nav = navigationRef.current;
      if (nav) {
        nav.navigate('Notifications');
      }
    });

    return () => responseListener?.remove();
  }, []);

  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded && initialRoute) {
      await SplashScreen.hideAsync();
    }
  }, [fontsLoaded, initialRoute]);

  if (!fontsLoaded || !initialRoute || maintenanceMode === null) return null;

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
              <Stack.Screen name="ChangeCoach"    component={ChangeCoachScreen} />
              <Stack.Screen name="Paywall"        component={PaywallScreen} />
              <Stack.Screen name="BeginnerProgram" component={BeginnerProgramScreen} />
              <Stack.Screen name="Notifications"  component={NotificationsScreen} />
            </Stack.Navigator>
          </NavigationContainer>
        </View>
      </WebWrapper>
    </SafeAreaProvider>
  );
}

export default Sentry.wrap(App);
