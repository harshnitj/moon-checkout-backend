const crypto = require('crypto')

const SESSION_TTL_MS = 24 * 60 * 60 * 1000

function getSessionSecret() {
  return process.env.SESSION_SECRET || process.env.TOKEN_ENCRYPTION_KEY || 'moon_checkout_dev_secret'
}

function createSessionToken(shop) {
  const payload = {
    shop,
    exp: Date.now() + SESSION_TTL_MS,
  }
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = crypto.createHmac('sha256', getSessionSecret()).update(data).digest('base64url')
  return `${data}.${sig}`
}

function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return null

  const [data, sig] = token.split('.')
  if (!data || !sig) return null

  const expected = crypto
    .createHmac('sha256', getSessionSecret())
    .update(data)
    .digest('base64url')

  if (sig !== expected) return null

  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'))
    if (!payload.shop || payload.exp < Date.now()) return null
    return payload.shop
  } catch {
    return null
  }
}

module.exports = {
  createSessionToken,
  verifySessionToken,
}
