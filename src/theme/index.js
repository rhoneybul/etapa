// ── Etapa App Theme ──────────────────────────────────────────────────────────
// Dark, crisp, performance-focused. Inspired by Ladder's serious aesthetic.
// Deep black base with warm amber accent. Sharp edges, bold type.

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

  // ── Primary accent — warm amber ──────────────────────────────────────────
  primary:      '#D97706',
  primaryLight: '#D9770615', // amber at ~8% opacity
  primaryDark:  '#B45309',

  // ── Extended amber palette ───────────────────────────────────────────────
  amber50:      '#FFF8EB',
  amber100:     '#FEECC7',
  amber200:     '#FDD889',
  amber300:     '#FCC14B',
  amber400:     '#FBAD23',
  amber500:     '#D97706',
  amber600:     '#B45309',
  amber700:     '#92400E',
  amber800:     '#783510',
  amber900:     '#5C2D14',

  // ── Accent — cool slate for secondary ───────────────────────────────────
  accent:       '#64748B',
  accentLight:  '#64748B15',

  // ── Functional status ────────────────────────────────────────────────────
  good:         '#22C55E',
  goodLight:    '#22C55E15',
  caution:      '#F59E0B',
  cautionLight: '#F59E0B15',
  cautionBorder:'#78350F',
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
