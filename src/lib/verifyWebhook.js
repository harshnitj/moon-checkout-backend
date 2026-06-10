const crypto = require('crypto')
const { SHOPIFY_API_SECRET } = process.env

function verifyWebhookHmac(rawBody, hmacHeader) {
  if (!SHOPIFY_API_SECRET || !hmacHeader || !rawBody) return false

  const digest = crypto
    .createHmac('sha256', SHOPIFY_API_SECRET)
    .update(rawBody, 'utf8')
    .digest('base64')

  const digestBuffer = Buffer.from(digest, 'utf8')
  const headerBuffer = Buffer.from(String(hmacHeader), 'utf8')
  if (digestBuffer.length !== headerBuffer.length) return false
  return crypto.timingSafeEqual(digestBuffer, headerBuffer)
}

module.exports = { verifyWebhookHmac }
