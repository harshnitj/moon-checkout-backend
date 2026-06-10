const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/

const THEME_COLOR_FIELDS = [
  'colorPrimary',
  'colorPrimaryHover',
  'colorBackground',
  'colorSurface',
  'colorText',
  'colorTextMuted',
]

const DEFAULT_THEME_COLORS = {
  colorPrimary: '#2563eb',
  colorPrimaryHover: '#1d4ed8',
  colorBackground: '#f3f4f8',
  colorSurface: '#ffffff',
  colorText: '#111827',
  colorTextMuted: '#6b7280',
}

function normalizeHexColor(value) {
  const color = String(value || '').trim()
  if (!HEX_COLOR.test(color)) {
    throw new Error(`Invalid color "${value}". Use hex format like #2563eb.`)
  }
  return color.toLowerCase()
}

function pickThemeColorUpdates(body) {
  const update = {}
  for (const field of THEME_COLOR_FIELDS) {
    if (body[field] === undefined) continue
    update[field] = normalizeHexColor(body[field])
  }
  return update
}

function serializeThemeColors(settings = {}) {
  const colors = {}
  for (const field of THEME_COLOR_FIELDS) {
    colors[field] = settings[field] || DEFAULT_THEME_COLORS[field]
  }
  return colors
}

module.exports = {
  THEME_COLOR_FIELDS,
  DEFAULT_THEME_COLORS,
  pickThemeColorUpdates,
  serializeThemeColors,
}
