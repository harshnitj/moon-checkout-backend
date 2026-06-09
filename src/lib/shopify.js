const crypto = require('crypto')
const { SHOPIFY_API_KEY, SHOPIFY_API_SECRET, SHOPIFY_SCOPES, APP_URL } = process.env

function getAppUrl() {
  return String(APP_URL || '').replace(/\/+$/, '')
}

function buildAuthUrl(shop, nonce) {
  const redirectUri = `${getAppUrl()}/auth/callback`
  return `https://${shop}/admin/oauth/authorize?client_id=${SHOPIFY_API_KEY}&scope=${SHOPIFY_SCOPES}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${nonce}&expiring=1`
}

async function postTokenRequest(shop, params) {
  const body = new URLSearchParams(params)
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: body.toString(),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Token request failed: ${text}`)
  }

  return res.json()
}

async function exchangeCodeForToken(shop, code) {
  return postTokenRequest(shop, {
    client_id: SHOPIFY_API_KEY,
    client_secret: SHOPIFY_API_SECRET,
    code,
    expiring: '1',
  })
}

async function refreshAccessToken(shop, refreshToken) {
  return postTokenRequest(shop, {
    client_id: SHOPIFY_API_KEY,
    client_secret: SHOPIFY_API_SECRET,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  })
}

async function migrateToExpiringToken(shop, accessToken) {
  return postTokenRequest(shop, {
    client_id: SHOPIFY_API_KEY,
    client_secret: SHOPIFY_API_SECRET,
    grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
    subject_token: accessToken,
    subject_token_type: 'urn:shopify:params:oauth:token-type:offline-access-token',
    requested_token_type: 'urn:shopify:params:oauth:token-type:offline-access-token',
    expiring: '1',
  })
}

function verifyHmac(query) {
  const { hmac, ...rest } = query
  const message = Object.keys(rest)
    .sort()
    .map((k) => `${k}=${rest[k]}`)
    .join('&')
  const digest = crypto
    .createHmac('sha256', SHOPIFY_API_SECRET)
    .update(message)
    .digest('hex')
  if (!hmac || digest.length !== hmac.length) return false
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(String(hmac)))
}

function generateNonce() {
  return crypto.randomBytes(16).toString('hex')
}

module.exports = {
  buildAuthUrl,
  exchangeCodeForToken,
  refreshAccessToken,
  migrateToExpiringToken,
  verifyHmac,
  generateNonce,
}
