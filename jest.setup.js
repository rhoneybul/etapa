/**
 * Global Jest setup for mobile UI tests.
 *
 * jest-expo's preset handles the heavy lifting (RN core mocks,
 * NativeModules, Image, etc.). What we add here is the long tail of
 * third-party native libraries the app pulls in that would otherwise
 * try to call native code in a Node test environment and crash:
 *
 *   - AsyncStorage          (persistent KV store)
 *   - RevenueCat            (paywall + entitlements)
 *   - PostHog               (analytics)
 *   - Sentry                (crash reporting)
 *   - expo-notifications    (push)
 *   - expo-haptics          (taps and toasts)
 *   - expo-store-review     (App Store review prompt)
 *   - expo-linking          (deep links)
 *   - expo-web-browser      (in-app browser)
 *   - expo-clipboard        (copy to clipboard)
 *   - expo-image-picker     (image attachments)
 *   - expo-apple-authentication
 *   - react-native-sse      (server-sent events for coach chat)
 *   - @sentry/react-native  (crash reporting)
 *
 * Each mock is the minimum surface area to satisfy a screen import —
 * stubs return success, capture calls, and never throw. Tests that
 * need to assert on a specific call should reach into the mock via
 * the `jest.requireMock(...)` pattern from the test file itself.
 */

// ── AsyncStorage ─────────────────────────────────────────────────────
// Use the official mock that the package ships. Backed by an in-memory
// Map that persists for the duration of a test file but is cleared
// across files. (jest-expo also wires this up but it doesn't hurt to
// be explicit so the mock doesn't drift on Expo SDK upgrades.)
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// ── RevenueCat ───────────────────────────────────────────────────────
// Subscriptions are gated by entitlements. Default the mock to
// "not subscribed, no offerings yet" so screens render the free-tier
// path. Tests that need a subscriber state can override per-test:
//   require('react-native-purchases').getCustomerInfo.mockResolvedValue({ ... })
jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {
    configure: jest.fn(),
    setLogLevel: jest.fn(),
    getCustomerInfo: jest.fn().mockResolvedValue({
      entitlements: { active: {}, all: {} },
      originalAppUserId: 'mock-user',
    }),
    getOfferings: jest.fn().mockResolvedValue({ current: null, all: {} }),
    purchasePackage: jest.fn().mockResolvedValue({ customerInfo: { entitlements: { active: {} } } }),
    restorePurchases: jest.fn().mockResolvedValue({ entitlements: { active: {} } }),
    logIn: jest.fn().mockResolvedValue({ customerInfo: { entitlements: { active: {} } }, created: false }),
    logOut: jest.fn().mockResolvedValue({}),
    addCustomerInfoUpdateListener: jest.fn(),
    removeCustomerInfoUpdateListener: jest.fn(),
  },
  LOG_LEVEL: { ERROR: 'ERROR', INFO: 'INFO', VERBOSE: 'VERBOSE' },
}));

// ── PostHog ──────────────────────────────────────────────────────────
// Capture calls so we can assert on analytics in flow tests. No-op
// otherwise.
jest.mock('posthog-react-native', () => {
  const captures = [];
  const PostHogProvider = ({ children }) => children;
  const usePostHog = () => ({
    capture: (...args) => captures.push(args),
    identify: jest.fn(),
    screen: jest.fn(),
    reset: jest.fn(),
  });
  return {
    __esModule: true,
    default: jest.fn(),
    PostHog: jest.fn(),
    PostHogProvider,
    usePostHog,
    __captures: captures,
  };
});

// ── Sentry ───────────────────────────────────────────────────────────
jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  setUser: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  addBreadcrumb: jest.fn(),
  withScope: (fn) => fn({ setExtra: jest.fn(), setTag: jest.fn() }),
  ReactNativeTracing: jest.fn(),
  reactNavigationIntegration: jest.fn(() => ({})),
  wrap: (Component) => Component,
}));

// ── expo-notifications ───────────────────────────────────────────────
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted', granted: true }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted', granted: true }),
  getExpoPushTokenAsync: jest.fn().mockResolvedValue({ data: 'ExponentPushToken[mock]' }),
  setBadgeCountAsync: jest.fn().mockResolvedValue(true),
  scheduleNotificationAsync: jest.fn(),
  cancelAllScheduledNotificationsAsync: jest.fn(),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  AndroidImportance: { DEFAULT: 3, HIGH: 4, MAX: 5 },
  AndroidNotificationVisibility: { PUBLIC: 1 },
  setNotificationChannelAsync: jest.fn(),
}));

// ── expo-store-review ────────────────────────────────────────────────
jest.mock('expo-store-review', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(true),
  hasAction: jest.fn().mockResolvedValue(true),
  requestReview: jest.fn(),
}));

// ── expo-linking ─────────────────────────────────────────────────────
jest.mock('expo-linking', () => ({
  createURL: (path) => `etapa://${path || ''}`,
  parse: jest.fn(() => ({ path: null, queryParams: {} })),
  parseInitialURLAsync: jest.fn().mockResolvedValue({ path: null, queryParams: {} }),
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  openURL: jest.fn().mockResolvedValue(true),
  canOpenURL: jest.fn().mockResolvedValue(true),
  getInitialURL: jest.fn().mockResolvedValue(null),
}));

// ── expo-web-browser ─────────────────────────────────────────────────
jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn().mockResolvedValue({ type: 'cancel' }),
  openAuthSessionAsync: jest.fn().mockResolvedValue({ type: 'cancel' }),
  dismissBrowser: jest.fn(),
  warmUpAsync: jest.fn(),
  coolDownAsync: jest.fn(),
}));

// ── expo-clipboard ───────────────────────────────────────────────────
jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn().mockResolvedValue(true),
  getStringAsync: jest.fn().mockResolvedValue(''),
}));

// ── expo-image-picker ────────────────────────────────────────────────
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted', granted: true }),
  launchImageLibraryAsync: jest.fn().mockResolvedValue({ canceled: true }),
  MediaTypeOptions: { Images: 'Images', Videos: 'Videos', All: 'All' },
}));

// ── expo-image-manipulator ───────────────────────────────────────────
jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn().mockResolvedValue({ uri: 'mock://image', width: 100, height: 100 }),
  SaveFormat: { JPEG: 'jpeg', PNG: 'png' },
}));

// ── expo-file-system ─────────────────────────────────────────────────
jest.mock('expo-file-system', () => ({
  documentDirectory: 'file:///mock/',
  cacheDirectory: 'file:///mock-cache/',
  readAsStringAsync: jest.fn().mockResolvedValue(''),
  writeAsStringAsync: jest.fn().mockResolvedValue(true),
  deleteAsync: jest.fn().mockResolvedValue(true),
  getInfoAsync: jest.fn().mockResolvedValue({ exists: false }),
  makeDirectoryAsync: jest.fn().mockResolvedValue(true),
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
}));

// ── expo-apple-authentication ────────────────────────────────────────
jest.mock('expo-apple-authentication', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(false),
  signInAsync: jest.fn().mockRejectedValue(new Error('Mock — not available in test')),
  AppleAuthenticationButton: () => null,
  AppleAuthenticationButtonStyle: { BLACK: 'black', WHITE: 'white' },
  AppleAuthenticationButtonType: { SIGN_IN: 'signIn' },
  AppleAuthenticationScope: { FULL_NAME: 'fullName', EMAIL: 'email' },
}));

// ── expo-crypto ──────────────────────────────────────────────────────
jest.mock('expo-crypto', () => ({
  randomUUID: () => '00000000-0000-4000-8000-000000000000',
  digestStringAsync: jest.fn().mockResolvedValue('mock-digest'),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
}));

// ── expo-device ──────────────────────────────────────────────────────
jest.mock('expo-device', () => ({
  isDevice: false,
  modelName: 'Mock Device',
  osName: 'iOS',
  osVersion: '18.0',
}));

// ── expo-updates ─────────────────────────────────────────────────────
jest.mock('expo-updates', () => ({
  isEnabled: false,
  channel: 'test',
  runtimeVersion: '0.0.0',
  updateId: null,
  checkForUpdateAsync: jest.fn().mockResolvedValue({ isAvailable: false }),
  fetchUpdateAsync: jest.fn().mockResolvedValue({ isNew: false }),
  reloadAsync: jest.fn(),
  addListener: jest.fn(() => ({ remove: jest.fn() })),
}));

// ── expo-splash-screen ───────────────────────────────────────────────
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn().mockResolvedValue(true),
  hideAsync: jest.fn().mockResolvedValue(true),
}));

// ── expo-font ────────────────────────────────────────────────────────
jest.mock('expo-font', () => ({
  loadAsync: jest.fn().mockResolvedValue(true),
  isLoaded: jest.fn(() => true),
  useFonts: () => [true, null],
}));

// ── @expo-google-fonts/poppins ───────────────────────────────────────
jest.mock('@expo-google-fonts/poppins', () => ({
  useFonts: () => [true, null],
  Poppins_400Regular: 'Poppins_400Regular',
  Poppins_500Medium: 'Poppins_500Medium',
  Poppins_600SemiBold: 'Poppins_600SemiBold',
  Poppins_700Bold: 'Poppins_700Bold',
}));

// ── @expo/vector-icons ───────────────────────────────────────────────
// Render icons as a stub <Text> so tests can find them by name without
// pulling in the real font asset machinery.
jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const Icon = ({ name, accessibilityLabel, testID, size, color, style }) =>
    React.createElement(
      Text,
      { testID: testID || `icon-${name}`, accessibilityLabel: accessibilityLabel || name, style },
      `[${name}]`,
    );
  return new Proxy(
    { __esModule: true },
    { get: (_, key) => (key === '__esModule' ? true : Icon) },
  );
});

// ── react-native-sse ─────────────────────────────────────────────────
// Used by the coach-chat streaming flow. Stub it as a no-op event
// emitter so screens render without subscribing to a real SSE source.
jest.mock('react-native-sse', () => {
  return jest.fn().mockImplementation(() => ({
    addEventListener: jest.fn(),
    removeAllEventListeners: jest.fn(),
    close: jest.fn(),
    open: jest.fn(),
  }));
});

// ── react-native-gesture-handler ─────────────────────────────────────
jest.mock('react-native-gesture-handler', () => {
  const View = require('react-native').View;
  return {
    GestureHandlerRootView: View,
    Swipeable: View,
    DrawerLayout: View,
    State: {},
    ScrollView: View,
    Slider: View,
    Switch: View,
    TextInput: View,
    ToolbarAndroid: View,
    ViewPagerAndroid: View,
    DrawerLayoutAndroid: View,
    WebView: View,
    NativeViewGestureHandler: View,
    TapGestureHandler: View,
    FlingGestureHandler: View,
    ForceTouchGestureHandler: View,
    LongPressGestureHandler: View,
    PanGestureHandler: View,
    PinchGestureHandler: View,
    RotationGestureHandler: View,
    RawButton: View,
    BaseButton: View,
    RectButton: View,
    BorderlessButton: View,
    FlatList: View,
    gestureHandlerRootHOC: jest.fn((C) => C),
    Directions: {},
    GestureDetector: View,
    Gesture: { Pan: () => ({}), Tap: () => ({}) },
  };
});

// ── react-native-safe-area-context ───────────────────────────────────
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  const inset = { top: 0, right: 0, bottom: 0, left: 0 };
  const frame = { x: 0, y: 0, width: 390, height: 844 };
  return {
    SafeAreaProvider: ({ children }) => React.createElement(View, null, children),
    SafeAreaView: ({ children, style }) => React.createElement(View, { style }, children),
    SafeAreaInsetsContext: { Consumer: ({ children }) => children(inset), Provider: ({ children }) => children },
    useSafeAreaInsets: () => inset,
    useSafeAreaFrame: () => frame,
    initialWindowMetrics: { insets: inset, frame },
  };
});

// ── @supabase/supabase-js ────────────────────────────────────────────
// Some screens import the supabase client at module load. Default to a
// stub that returns "no row" / "no session" — tests that need a
// specific supabase response stub it explicitly.
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
      signInWithPassword: jest.fn().mockResolvedValue({ data: null, error: null }),
      signOut: jest.fn().mockResolvedValue({ error: null }),
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }),
      insert: () => Promise.resolve({ data: null, error: null }),
      update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
    }),
  }),
}));

// Quiet down React Native's expected console.error("Animated: `useNativeDriver`")
// noise that surfaces when test renderers don't have a native bridge.
const originalError = console.error;
console.error = (...args) => {
  const msg = String(args[0] || '');
  if (msg.includes('useNativeDriver')) return;
  if (msg.includes('not wrapped in act')) return; // RN async-act warnings
  originalError(...args);
};
