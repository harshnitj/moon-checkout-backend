const Razorpay = require('razorpay')
const crypto = require('crypto')
const { encryptToken, decryptToken } = require('./crypto')

const KEY_ID_PATTERN = /^rzp_(test|live)_[A-Za-z0-9]+$/

function hasEnvRazorpayCredentials() {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim()
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim()
  return !!(keyId && keySecret)
}

function isRazorpayConfigured(settings = {}) {
  if (settings.razorpayKeyId && settings.razorpayKeySecretEncrypted) {
    return true
  }
  return hasEnvRazorpayCredentials()
}

function normalizeRazorpayKeyId(value) {
  const keyId = String(value || '').trim()
  if (!keyId) return null
  if (!KEY_ID_PATTERN.test(keyId)) {
    throw new Error('Invalid Razorpay Key ID. Use format rzp_test_... or rzp_live_...')
  }
  return keyId
}

function pickRazorpayUpdates(body) {
  const update = {}

  if (body.razorpayKeyId !== undefined) {
    update.razorpayKeyId = normalizeRazorpayKeyId(body.razorpayKeyId)
  }

  if (body.razorpayKeySecret !== undefined) {
    const secret = String(body.razorpayKeySecret).trim()
    if (secret) {
      if (secret.length < 8) {
        throw new Error('Razorpay Key Secret looks too short.')
      }
      update.razorpayKeySecretEncrypted = encryptToken(secret)
    }
  }

  return update
}

function serializeRazorpaySettings(settings = {}, { includeDashboardFields = false } = {}) {
  const serialized = {
    razorpayKeyId: settings.razorpayKeyId || null,
    razorpayConfigured: isRazorpayConfigured(settings),
  }

  if (includeDashboardFields) {
    serialized.razorpayKeySecretSet = !!settings.razorpayKeySecretEncrypted
  }

  return serialized
}

function getMerchantRazorpayCredentials(settings = {}) {
  if (settings.razorpayKeyId && settings.razorpayKeySecretEncrypted) {
    const keySecret = decryptToken(settings.razorpayKeySecretEncrypted)
    if (!keySecret) {
      throw new Error('Stored Razorpay credentials could not be decrypted.')
    }
    return {
      keyId: settings.razorpayKeyId,
      keySecret,
      source: 'merchant',
    }
  }
  return null
}

function getEnvRazorpayCredentials() {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim()
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim()
  if (!keyId || !keySecret) return null
  return { keyId, keySecret, source: 'env' }
}

function createRazorpayClient(credentials) {
  return new Razorpay({
    key_id: credentials.keyId,
    key_secret: credentials.keySecret,
  })
}

function verifyRazorpaySignature({ keySecret, razorpayOrderId, razorpayPaymentId, razorpaySignature }) {
  const body = `${razorpayOrderId}|${razorpayPaymentId}`
  const expectedSignature = crypto
    .createHmac('sha256', keySecret)
    .update(body)
    .digest('hex')

  return expectedSignature === razorpaySignature
}

module.exports = {
  isRazorpayConfigured,
  pickRazorpayUpdates,
  serializeRazorpaySettings,
  getMerchantRazorpayCredentials,
  getEnvRazorpayCredentials,
  createRazorpayClient,
  verifyRazorpaySignature,
}
