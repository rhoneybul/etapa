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
  text:         '#FFFFFF',   // pure white primary text
  textMid:      '#A0A0A8',   // secondary text
  textMuted:    '#606068',   // labels / captions
  textFaint:    '#35353D',   // placeholders / disabled

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
