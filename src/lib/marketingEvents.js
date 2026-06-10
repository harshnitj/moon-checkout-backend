const { getSettingsForShop } = require('./checkoutSettings')
const { isMetaCapiConfigured, sendMetaCapiEvent } = require('./metaCapi')
const { isGoogleCapiConfigured, sendGoogleCapiEvent } = require('./googleCapi')

const META_CAPI_EVENT_FLAGS = {
  InitiateCheckout: 'metaCapiEventInitiateCheckout',
  AddPaymentInfo: 'metaCapiEventAddPaymentInfo',
  Purchase: 'metaCapiEventPurchase',
}

const GOOGLE_CAPI_EVENT_FLAGS = {
  InitiateCheckout: 'googleCapiEventInitiateCheckout',
  AddPaymentInfo: 'googleCapiEventAddPaymentInfo',
  Purchase: 'googleCapiEventPurchase',
}

const LEGACY_META_CAPI = {
  metaCapiEventInitiateCheckout: 'metaEventInitiateCheckout',
  metaCapiEventAddPaymentInfo: 'metaEventAddPaymentInfo',
  metaCapiEventPurchase: 'metaEventPurchase',
}

const LEGACY_GOOGLE_CAPI = {
  googleCapiEventInitiateCheckout: 'googleEventInitiateCheckout',
  googleCapiEventAddPaymentInfo: 'googleEventAddPaymentInfo',
  googleCapiEventPurchase: 'googleEventPurchase',
}

function isCapiEventEnabled(settings, eventName, flagMap, legacyMap) {
  const flag = flagMap[eventName]
  if (!flag) return true
  if (settings[flag] !== undefined) return settings[flag] !== false
  const legacyFlag = legacyMap[flag]
  if (legacyFlag && settings[legacyFlag] !== undefined) return settings[legacyFlag] !== false
  return true
}

function shouldSendMetaCapi(settings, eventName) {
  if (!isMetaCapiConfigured(settings)) return false
  return isCapiEventEnabled(settings, eventName, META_CAPI_EVENT_FLAGS, LEGACY_META_CAPI)
}

function shouldSendGoogleCapi(settings, eventName) {
  if (!isGoogleCapiConfigured(settings)) return false
  return isCapiEventEnabled(settings, eventName, GOOGLE_CAPI_EVENT_FLAGS, LEGACY_GOOGLE_CAPI)
}

async function trackServerMarketingEvent(shop, { eventName, eventId, payload, userData, req }) {
  const result = await getSettingsForShop(shop)
  if (!result) {
    return { ok: false, error: 'Store not found' }
  }

  const { settings } = result
  const tasks = []

  if (shouldSendMetaCapi(settings, eventName)) {
    tasks.push(
      sendMetaCapiEvent(settings, { eventName, eventId, payload, userData, req })
        .catch((err) => {
          console.error('Meta CAPI track failed:', err)
          return { ok: false, error: err.message }
        }),
    )
  }

  if (shouldSendGoogleCapi(settings, eventName)) {
    tasks.push(
      sendGoogleCapiEvent(settings, { eventName, eventId, payload, userData })
        .catch((err) => {
          console.error('Google CAPI track failed:', err)
          return { ok: false, error: err.message }
        }),
    )
  }

  if (!tasks.length) {
    return { ok: true, skipped: true }
  }

  const results = await Promise.all(tasks)
  return { ok: results.every((item) => item.ok !== false), results }
}

module.exports = {
  trackServerMarketingEvent,
  shouldSendMetaCapi,
  shouldSendGoogleCapi,
  isMetaCapiConfigured,
  isGoogleCapiConfigured,
}
