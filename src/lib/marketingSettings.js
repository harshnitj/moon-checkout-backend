const { encryptToken } = require('./crypto')
const { isMetaCapiConfigured } = require('./metaCapi')
const { isGoogleCapiConfigured } = require('./googleCapi')

const META_PIXEL_PATTERN = /^\d{8,20}$/
const GOOGLE_ADS_ID_PATTERN = /^AW-\d+$/
const GA4_MEASUREMENT_PATTERN = /^G-[A-Z0-9]+$/
const CONVERSION_LABEL_PATTERN = /^[A-Za-z0-9_-]+$/

const MARKETING_FIELDS = [
  'metaAdsEnabled',
  'metaPixelId',
  'metaCapiEnabled',
  'metaPixelEventInitiateCheckout',
  'metaPixelEventAddPaymentInfo',
  'metaPixelEventPurchase',
  'metaCapiEventInitiateCheckout',
  'metaCapiEventAddPaymentInfo',
  'metaCapiEventPurchase',
  'googleAdsEnabled',
  'googleAdsId',
  'googleAdsPurchaseLabel',
  'googleAdsCheckoutLabel',
  'googleCapiEnabled',
  'googleMeasurementId',
  'googlePixelEventInitiateCheckout',
  'googlePixelEventAddPaymentInfo',
  'googlePixelEventPurchase',
  'googleCapiEventInitiateCheckout',
  'googleCapiEventAddPaymentInfo',
  'googleCapiEventPurchase',
]

const DEFAULT_MARKETING_SETTINGS = {
  metaAdsEnabled: false,
  metaPixelId: '',
  metaCapiEnabled: false,
  metaPixelEventInitiateCheckout: true,
  metaPixelEventAddPaymentInfo: true,
  metaPixelEventPurchase: true,
  metaCapiEventInitiateCheckout: true,
  metaCapiEventAddPaymentInfo: true,
  metaCapiEventPurchase: true,
  googleAdsEnabled: false,
  googleAdsId: '',
  googleAdsPurchaseLabel: '',
  googleAdsCheckoutLabel: '',
  googleCapiEnabled: false,
  googleMeasurementId: '',
  googlePixelEventInitiateCheckout: true,
  googlePixelEventAddPaymentInfo: true,
  googlePixelEventPurchase: true,
  googleCapiEventInitiateCheckout: true,
  googleCapiEventAddPaymentInfo: true,
  googleCapiEventPurchase: true,
}

const LEGACY_META_PIXEL_EVENTS = {
  metaPixelEventInitiateCheckout: 'metaEventInitiateCheckout',
  metaPixelEventAddPaymentInfo: 'metaEventAddPaymentInfo',
  metaPixelEventPurchase: 'metaEventPurchase',
}

const LEGACY_META_CAPI_EVENTS = {
  metaCapiEventInitiateCheckout: 'metaEventInitiateCheckout',
  metaCapiEventAddPaymentInfo: 'metaEventAddPaymentInfo',
  metaCapiEventPurchase: 'metaEventPurchase',
}

const LEGACY_GOOGLE_PIXEL_EVENTS = {
  googlePixelEventInitiateCheckout: 'googleEventInitiateCheckout',
  googlePixelEventAddPaymentInfo: 'googleEventAddPaymentInfo',
  googlePixelEventPurchase: 'googleEventPurchase',
}

const LEGACY_GOOGLE_CAPI_EVENTS = {
  googleCapiEventInitiateCheckout: 'googleEventInitiateCheckout',
  googleCapiEventAddPaymentInfo: 'googleEventAddPaymentInfo',
  googleCapiEventPurchase: 'googleEventPurchase',
}

function resolveEventFlag(settings, field, legacyMap) {
  if (settings[field] !== undefined) return settings[field]
  const legacyField = legacyMap[field]
  if (legacyField && settings[legacyField] !== undefined) return settings[legacyField]
  return DEFAULT_MARKETING_SETTINGS[field]
}

function normalizeMetaPixelId(value) {
  return String(value || '').trim().replace(/\D/g, '')
}

function normalizeGoogleAdsId(value) {
  return String(value || '').trim().toUpperCase()
}

function normalizeGoogleMeasurementId(value) {
  return String(value || '').trim().toUpperCase()
}

function normalizeConversionLabel(value) {
  return String(value || '').trim()
}

function pickMarketingUpdates(body) {
  const update = {}

  if (body.metaAdsEnabled !== undefined) update.metaAdsEnabled = Boolean(body.metaAdsEnabled)
  if (body.metaPixelId !== undefined) update.metaPixelId = normalizeMetaPixelId(body.metaPixelId)
  if (body.metaCapiEnabled !== undefined) update.metaCapiEnabled = Boolean(body.metaCapiEnabled)

  for (const field of Object.keys(LEGACY_META_PIXEL_EVENTS)) {
    if (body[field] !== undefined) update[field] = Boolean(body[field])
  }
  for (const field of Object.keys(LEGACY_META_CAPI_EVENTS)) {
    if (body[field] !== undefined) update[field] = Boolean(body[field])
  }

  if (body.googleAdsEnabled !== undefined) update.googleAdsEnabled = Boolean(body.googleAdsEnabled)
  if (body.googleAdsId !== undefined) update.googleAdsId = normalizeGoogleAdsId(body.googleAdsId)
  if (body.googleAdsPurchaseLabel !== undefined) {
    update.googleAdsPurchaseLabel = normalizeConversionLabel(body.googleAdsPurchaseLabel)
  }
  if (body.googleAdsCheckoutLabel !== undefined) {
    update.googleAdsCheckoutLabel = normalizeConversionLabel(body.googleAdsCheckoutLabel)
  }
  if (body.googleCapiEnabled !== undefined) update.googleCapiEnabled = Boolean(body.googleCapiEnabled)
  if (body.googleMeasurementId !== undefined) {
    update.googleMeasurementId = normalizeGoogleMeasurementId(body.googleMeasurementId)
  }

  for (const field of Object.keys(LEGACY_GOOGLE_PIXEL_EVENTS)) {
    if (body[field] !== undefined) update[field] = Boolean(body[field])
  }
  for (const field of Object.keys(LEGACY_GOOGLE_CAPI_EVENTS)) {
    if (body[field] !== undefined) update[field] = Boolean(body[field])
  }

  if (body.metaCapiAccessToken !== undefined) {
    const token = String(body.metaCapiAccessToken).trim()
    if (token) {
      if (token.length < 20) throw new Error('Meta CAPI access token looks too short.')
      update.metaCapiAccessTokenEncrypted = encryptToken(token)
    }
  }

  if (body.googleApiSecret !== undefined) {
    const secret = String(body.googleApiSecret).trim()
    if (secret) {
      if (secret.length < 8) throw new Error('Google Measurement Protocol API secret looks too short.')
      update.googleApiSecretEncrypted = encryptToken(secret)
    }
  }

  if (body.metaAdsEnabled && body.metaPixelId !== undefined) {
    if (!update.metaPixelId) throw new Error('Meta Pixel ID is required when Meta browser tracking is enabled.')
    if (!META_PIXEL_PATTERN.test(update.metaPixelId)) {
      throw new Error('Invalid Meta Pixel ID. Use the numeric Pixel ID from Meta Events Manager.')
    }
  }

  if (body.metaCapiEnabled && body.metaPixelId !== undefined && !update.metaPixelId) {
    throw new Error('Meta Pixel ID is required when Meta CAPI is enabled.')
  }

  if (
    body.metaCapiEnabled
    && body.metaCapiAccessToken !== undefined
    && !update.metaCapiAccessTokenEncrypted
    && !body.metaCapiAccessTokenSet
  ) {
    throw new Error('Meta CAPI access token is required when Meta CAPI is enabled.')
  }

  if (body.googleAdsEnabled && body.googleAdsId !== undefined) {
    if (!update.googleAdsId) throw new Error('Google Ads conversion ID is required when Google browser tracking is enabled.')
    if (!GOOGLE_ADS_ID_PATTERN.test(update.googleAdsId)) {
      throw new Error('Invalid Google Ads ID. Use format AW-123456789.')
    }
  }

  if (body.googleCapiEnabled && body.googleMeasurementId !== undefined) {
    if (!update.googleMeasurementId) throw new Error('GA4 Measurement ID is required when Google CAPI is enabled.')
    if (!GA4_MEASUREMENT_PATTERN.test(update.googleMeasurementId)) {
      throw new Error('Invalid GA4 Measurement ID. Use format G-XXXXXXXXXX.')
    }
  }

  if (
    body.googleCapiEnabled
    && body.googleApiSecret !== undefined
    && !update.googleApiSecretEncrypted
    && !body.googleApiSecretSet
  ) {
    throw new Error('Google API secret is required when Google CAPI is enabled.')
  }

  for (const labelField of ['googleAdsPurchaseLabel', 'googleAdsCheckoutLabel']) {
    const label = update[labelField]
    if (label && !CONVERSION_LABEL_PATTERN.test(label)) {
      throw new Error(`Invalid Google conversion label for ${labelField}.`)
    }
  }

  const pixelPurchaseEnabled = body.googlePixelEventPurchase ?? update.googlePixelEventPurchase
  if (
    body.googleAdsEnabled
    && pixelPurchaseEnabled
    && body.googleAdsPurchaseLabel !== undefined
    && !update.googleAdsPurchaseLabel
  ) {
    throw new Error('Google Ads purchase conversion label is required when purchase tracking is enabled.')
  }

  return update
}

function serializeMarketingSettings(settings = {}, options = {}) {
  const serialized = {
    metaAdsEnabled: settings.metaAdsEnabled ?? DEFAULT_MARKETING_SETTINGS.metaAdsEnabled,
    metaPixelId: settings.metaPixelId ?? DEFAULT_MARKETING_SETTINGS.metaPixelId,
    metaCapiEnabled: settings.metaCapiEnabled ?? DEFAULT_MARKETING_SETTINGS.metaCapiEnabled,
    googleAdsEnabled: settings.googleAdsEnabled ?? DEFAULT_MARKETING_SETTINGS.googleAdsEnabled,
    googleAdsId: settings.googleAdsId ?? DEFAULT_MARKETING_SETTINGS.googleAdsId,
    googleAdsPurchaseLabel: settings.googleAdsPurchaseLabel ?? DEFAULT_MARKETING_SETTINGS.googleAdsPurchaseLabel,
    googleAdsCheckoutLabel: settings.googleAdsCheckoutLabel ?? DEFAULT_MARKETING_SETTINGS.googleAdsCheckoutLabel,
    googleCapiEnabled: settings.googleCapiEnabled ?? DEFAULT_MARKETING_SETTINGS.googleCapiEnabled,
    googleMeasurementId: settings.googleMeasurementId ?? DEFAULT_MARKETING_SETTINGS.googleMeasurementId,
  }

  for (const field of Object.keys(LEGACY_META_PIXEL_EVENTS)) {
    serialized[field] = resolveEventFlag(settings, field, LEGACY_META_PIXEL_EVENTS)
  }
  for (const field of Object.keys(LEGACY_META_CAPI_EVENTS)) {
    serialized[field] = resolveEventFlag(settings, field, LEGACY_META_CAPI_EVENTS)
  }
  for (const field of Object.keys(LEGACY_GOOGLE_PIXEL_EVENTS)) {
    serialized[field] = resolveEventFlag(settings, field, LEGACY_GOOGLE_PIXEL_EVENTS)
  }
  for (const field of Object.keys(LEGACY_GOOGLE_CAPI_EVENTS)) {
    serialized[field] = resolveEventFlag(settings, field, LEGACY_GOOGLE_CAPI_EVENTS)
  }

  serialized.metaCapiConfigured = isMetaCapiConfigured(settings)
  serialized.googleCapiConfigured = isGoogleCapiConfigured(settings)

  if (options.includeDashboardFields) {
    serialized.metaCapiAccessTokenSet = !!settings.metaCapiAccessTokenEncrypted
    serialized.googleApiSecretSet = !!settings.googleApiSecretEncrypted
  }

  return serialized
}

module.exports = {
  MARKETING_FIELDS,
  DEFAULT_MARKETING_SETTINGS,
  pickMarketingUpdates,
  serializeMarketingSettings,
}
