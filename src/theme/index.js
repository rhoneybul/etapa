// ── Etapa App Theme ──────────────────────────────────────────────────────────
// Dark, crisp, performance-focused. Maglia rosa accent — the iconic pink
// of the Giro d'Italia leader's jersey. Deep black base, sharp edges, bold type.

export const colors = {
  // ── Surfaces ─────────────────────────────────────────────────────────────
  bg:           '#000000',   // true black background
  bgDeep:       '#000000',   // deepest background
  surface:      '#111113',   // card / elevated surface
  surfaceLight: '#1A1A1E',   // lighter surface (hover / raised)
  white:        '#111113',   // alias — cards use surface
  border:       '#222226',   // subtle border
  borderLight:  '#1A1A1E',   // faint divider

  // ── Text ─────────────────────────────────────────────────────────────────
  // Greyscale ramp lifted across the board (Apr 30) so secondary text
  // remains readable in bright sunlight / glare on a phone screen.
  // Previous values were too close to the dark surface — riders
  // reported squinting at labels and captions on outdoor screenshots.
  // The new ramp keeps the visual hierarchy (primary > mid > muted >
  // faint) but each step is ~25-30 luminance points lighter.
  text:         '#FFFFFF',   // pure white primary text
  textMid:      '#C8C8D0',   // secondary text (was #A0A0A8)
  textMuted:    '#8E8E96',   // labels / captions (was #606068)
  textFaint:    '#5A5A62',   // placeholders / disabled (was #35353D)

  // ── Primary accent — maglia rosa ─────────────────────────────────────────
  primary:      '#E8458B',
  primaryLight: '#E8458B15', // rosa at ~8% opacity
  primaryDark:  '#C4306E',

  // ── Secondary accent — electric blue ─────────────────────────────────────
  // Used for indoor rides, informational badges, coach avatars, and any UI
  // chrome that needs colour but isn't a primary CTA.
  // Subdued "steel blue" so it supports (not competes with) maglia rosa.
  secondary:      '#4B6B8F',
  secondaryLight: '#4B6B8F15',
  secondaryMid:   '#3F5C7A',
  secondaryDark:  '#334B63',

  // ── Tertiary accent — teal ────────────────────────────────────────────────
  // Use sparingly: cross-training, neutral informational chips.
  // Sits between blue and green so it never competes with primary pink.
  teal:           '#06B6D4',
  tealLight:      '#06B6D415',
  tealDark:       '#0891B2',

  // ── Slate — neutral mid-tone between grey and blue ───────────────────────
  slate:        '#64748B',
  slateLight:   '#64748B15',

  // ── Extended rosa (use sparingly — let surfaces breathe) ─────────────────
  rosa500:      '#E8458B',
  rosa600:      '#C4306E',
  rosa700:      '#9E2258',

  // ── Functional status ────────────────────────────────────────────────────
  good:         '#22C55E',
  goodLight:    '#22C55E15',
  caution:      '#F59E0B',
  cautionLight: '#F59E0B15',
  cautionBorder:'#7D1B46',
  warn:         '#EF4444',
  warnLight:    '#EF444415',
  warnBorder:   '#7F1D1D',
};

export const fontFamily = {
  light:    'Poppins_300Light',
  regular:  'Poppins_400Regular',
  medium:   'Poppins_500Medium',
  semibold: 'Poppins_600SemiBold',
};

export const font = {
  thin:    '300',
  regular: '400',
  medium:  '500',
  semibold:'600',
};

export const text = {
  heading:    { fontSize: 18, fontWeight: '600', color: colors.text, fontFamily: fontFamily.semibold },
  subheading: { fontSize: 15, fontWeight: '600', color: colors.text, fontFamily: fontFamily.semibold },
  body:       { fontSize: 15, fontWeight: '400', color: colors.text, fontFamily: fontFamily.regular },
  bodyLight:  { fontSize: 15, fontWeight: '300', color: colors.textMid, fontFamily: fontFamily.light },
  small:      { fontSize: 13, fontWeight: '300', color: colors.textMid, fontFamily: fontFamily.light },
  label:      { fontSize: 10, fontWeight: '500', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: fontFamily.medium },
  caption:    { fontSize: 11, fontWeight: '300', color: colors.textMuted, fontFamily: fontFamily.light },
};

// Extra bottom padding for Android gesture navigation. On iOS, SafeAreaView
// handles this automatically. On Android, bottom bars / CTAs need this extra
// space so they aren't hidden behind the gesture pill / 3-button nav.
//
// History: started at 24, bumped to 34, then to 48 after reports that sticky
// buttons on Pixel 7 / Samsung S23 devices sat flush against the gesture bar
// (effectively obscuring the top row of content below them). 48px clears
// gesture bars on every modern device we've seen and keeps a comfortable
// tap-target margin above the system chrome.
//
// For pixel-perfect insets that respect what the actual device is reporting
// (gesture bar on vs off, foldable, tablet, etc.) prefer the useBottomInset
// hook in this file — it uses react-native-safe-area-context and falls back
// to this constant when no inset is reported.
import { Platform, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
export const BOTTOM_INSET = Platform.OS === 'android' ? 48 : 0;
// Top inset for Android status bar — used on screens that render content
// flush to the top without their own SafeAreaView top edge.
export const TOP_INSET = Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 0;

/**
 * Hook: returns the effective bottom padding a sticky bar should use so it
 * always clears the system navigation (gesture pill OR 3-button nav).
 *
 * Reads the real device-reported inset via react-native-safe-area-context
 * and falls back to BOTTOM_INSET when no inset is reported (rare, but safer
 * than returning 0). The optional `extra` arg is added on top so callers can
 * avoid arithmetic at the use site.
 *
 * Example:
 *   const pb = useBottomInset(12); // real inset + 12px breathing room
 *   <View style={{ paddingBottom: pb }} />
 */
export function useBottomInset(extra = 0) {
  try {
    const insets = useSafeAreaInsets();
    const reported = insets?.bottom || 0;
    const effective = Platform.OS === 'android'
      ? Math.max(reported, BOTTOM_INSET)
      : reported;
    return effective + extra;
  } catch {
    // Fallback if the component tree somehow rendered outside the provider —
    // return the static constant so we never clip buttons to zero.
    return (Platform.OS === 'android' ? BOTTOM_INSET : 0) + extra;
  }
}

export const layout = {
  pagePad:    20,
  cardRadius: 14,
  cardShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  card: (extra = {}) => ({
    backgroundColor: colors.surface,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
    ...extra,
  }),
};

export const sheetHandle = {
  width: 36, height: 4, borderRadius: 2,
  backgroundColor: '#35353D',
  alignSelf: 'center',
  marginTop: 10, marginBottom: 8,
};
