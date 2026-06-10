const crypto = require('crypto')
const { decryptToken } = require('./crypto')

const META_GRAPH_VERSION = 'v21.0'

function hashUserData(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return null
  return crypto.createHash('sha256').update(normalized).digest('hex')
}

function normalizePhoneForHash(phone) {
  const digits = String(phone || '').replace(/\D/g, '')
  if (digits.length === 10) return `91${digits}`
  if (digits.length === 12 && digits.startsWith('91')) return digits
  return digits || null
}

function buildUserData(userData = {}, req) {
  const hashed = {}

  const emailHash = hashUserData(userData.email)
  if (emailHash) hashed.em = [emailHash]

  const phoneHash = hashUserData(normalizePhoneForHash(userData.phone))
  if (phoneHash) hashed.ph = [phoneHash]

  if (userData.fbp) hashed.fbp = userData.fbp
  if (userData.fbc) hashed.fbc = userData.fbc

  const ip = userData.clientIpAddress || req?.headers?.['x-forwarded-for']?.split(',')[0]?.trim() || req?.ip
  if (ip) hashed.client_ip_address = ip

  const userAgent = userData.clientUserAgent || req?.headers?.['user-agent']
  if (userAgent) hashed.client_user_agent = userAgent

  return hashed
}

function buildCustomData(payload = {}) {
  const customData = {
    currency: payload.currency || 'INR',
    value: Number(payload.value) || 0,
  }

  if (payload.content_ids?.length) customData.content_ids = payload.content_ids
  if (payload.contents?.length) customData.contents = payload.contents
  if (payload.num_items) customData.num_items = payload.num_items
  if (payload.order_id) customData.order_id = String(payload.order_id)
  if (payload.payment_method) customData.payment_method = payload.payment_method

  return customData
}

function getMetaAccessToken(settings) {
  if (!settings?.metaCapiAccessTokenEncrypted) return null
  const token = decryptToken(settings.metaCapiAccessTokenEncrypted)
  return token || null
}

function isMetaCapiConfigured(settings = {}) {
  return !!(settings.metaCapiEnabled && settings.metaPixelId && getMetaAccessToken(settings))
}

async function sendMetaCapiEvent(settings, { eventName, eventId, payload, userData, req }) {
  const accessToken = getMetaAccessToken(settings)
  if (!accessToken || !settings.metaPixelId) {
    return { ok: false, skipped: true }
  }

  const body = {
    data: [
      {
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: eventId,
        action_source: 'website',
        event_source_url: userData?.eventSourceUrl || undefined,
        user_data: buildUserData(userData, req),
        custom_data: buildCustomData(payload),
      },
    ],
    access_token: accessToken,
  }

  const response = await fetch(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/${settings.metaPixelId}/events`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  )

  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    console.error('Meta CAPI error:', result)
    return { ok: false, error: result }
  }

  return { ok: true, result }
}

module.exports = {
  isMetaCapiConfigured,
  sendMetaCapiEvent,
}
