// ── Etapa App Theme ──────────────────────────────────────────────────────────
// Dark, serious, performance-focused. Font: Poppins.
// Near-black base with warm amber accent.

export const colors = {
  // ── Surfaces ─────────────────────────────────────────────────────────────
  bg:           '#0C0D10',   // near-black background
  bgDeep:       '#08090B',   // deepest background (sunken areas)
  surface:      '#16181D',   // card / elevated surface
  surfaceLight: '#1E2028',   // lighter surface (hover / raised)
  white:        '#16181D',   // alias — cards use surface, not white
  border:       '#2A2D35',   // subtle border
  borderLight:  '#22252D',   // faint divider

  // ── Text ─────────────────────────────────────────────────────────────────
  text:         '#F0F0F2',   // primary text (near-white)
  textMid:      '#A0A3AD',   // secondary text
  textMuted:    '#6B6F7B',   // labels / captions
  textFaint:    '#3D4049',   // placeholders / disabled

  // ── Primary accent — warm amber ──────────────────────────────────────────
  primary:      '#D97706',
  primaryLight: '#D9770618', // amber at 10% opacity for tinted backgrounds
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

  // ── Accent — cool slate blue for secondary highlights ────────────────────
  accent:       '#64748B',
  accentLight:  '#64748B18',

  // ── Functional status ────────────────────────────────────────────────────
  good:         '#22C55E',
  goodLight:    '#22C55E18',
  caution:      '#F59E0B',
  cautionLight: '#F59E0B18',
  cautionBorder:'#78350F',
  warn:         '#EF4444',
  warnLight:    '#EF444418',
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
  label:      { fontSize: 10, fontWeight: '500', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, fontFamily: fontFamily.medium },
  caption:    { fontSize: 11, fontWeight: '300', color: colors.textMuted, fontFamily: fontFamily.light },
};

export const layout = {
  pagePad:    20,
  cardRadius: 18,
  cardShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 5,
  },
  card: (extra = {}) => ({
    backgroundColor: colors.surface,
    borderRadius: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 5,
    ...extra,
  }),
};

export const sheetHandle = {
  width: 36, height: 4, borderRadius: 2,
  backgroundColor: '#3D4049',
  alignSelf: 'center',
  marginTop: 10, marginBottom: 8,
};
