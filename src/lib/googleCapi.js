const crypto = require('crypto')
const { decryptToken } = require('./crypto')

const GA4_MEASUREMENT_PATTERN = /^G-[A-Z0-9]+$/

const EVENT_NAME_MAP = {
  InitiateCheckout: 'begin_checkout',
  AddPaymentInfo: 'add_payment_info',
  Purchase: 'purchase',
}

function getGoogleApiSecret(settings) {
  if (!settings?.googleApiSecretEncrypted) return null
  const secret = decryptToken(settings.googleApiSecretEncrypted)
  return secret || null
}

function isGoogleCapiConfigured(settings = {}) {
  return !!(
    settings.googleCapiEnabled
    && settings.googleMeasurementId
    && GA4_MEASUREMENT_PATTERN.test(settings.googleMeasurementId)
    && getGoogleApiSecret(settings)
  )
}

function buildClientId(userData = {}) {
  if (userData.clientId) return String(userData.clientId)
  const seed = [
    userData.email,
    userData.phone,
    userData.fbp,
  ].filter(Boolean).join('|')
  if (!seed) return `mc.${Date.now()}.${Math.random().toString(36).slice(2)}`
  return crypto.createHash('sha256').update(seed).digest('hex').slice(0, 32)
}

function buildEventParams(eventName, payload = {}) {
  const params = {
    currency: payload.currency || 'INR',
    value: Number(payload.value) || 0,
    engagement_time_msec: 100,
  }

  if (payload.transaction_id) params.transaction_id = String(payload.transaction_id)
  if (payload.order_id) params.transaction_id = String(payload.order_id)
  if (payload.payment_method) params.payment_type = payload.payment_method

  if (payload.contents?.length) {
    params.items = payload.contents.map((item) => ({
      item_id: String(item.id),
      quantity: item.quantity,
      price: item.item_price,
    }))
  }

  if (eventName === 'Purchase' && params.transaction_id) {
    params.transaction_id = params.transaction_id
  }

  return params
}

async function sendGoogleCapiEvent(settings, { eventName, eventId, payload, userData }) {
  const apiSecret = getGoogleApiSecret(settings)
  if (!apiSecret || !settings.googleMeasurementId) {
    return { ok: false, skipped: true }
  }

  const gaEventName = EVENT_NAME_MAP[eventName] || eventName
  const body = {
    client_id: buildClientId(userData),
    events: [
      {
        name: gaEventName,
        params: {
          ...buildEventParams(eventName, payload),
          event_id: eventId,
        },
      },
    ],
  }

  const url = new URL('https://www.google-analytics.com/mp/collect')
  url.searchParams.set('measurement_id', settings.googleMeasurementId)
  url.searchParams.set('api_secret', apiSecret)

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    console.error('Google CAPI error:', text || response.status)
    return { ok: false, error: text || response.status }
  }

  return { ok: true }
}

module.exports = {
  isGoogleCapiConfigured,
  sendGoogleCapiEvent,
}
