const express = require('express')
const { trackServerMarketingEvent } = require('../lib/marketingEvents')

const router = express.Router()

const ALLOWED_EVENTS = new Set(['InitiateCheckout', 'AddPaymentInfo', 'Purchase'])

function normalizeShop(input) {
  let shop = String(input || '').trim().toLowerCase()
  if (!shop) return null
  if (!shop.includes('.')) shop = `${shop}.myshopify.com`
  if (!shop.endsWith('.myshopify.com')) return null
  return shop
}

router.post('/track', async (req, res) => {
  const shop = normalizeShop(req.body.shop)
  const eventName = String(req.body.event || '').trim()
  const eventId = String(req.body.eventId || '').trim()
  const payload = req.body.payload || {}
  const userData = req.body.userData || {}

  if (!shop) {
    return res.status(400).json({ error: 'Missing or invalid shop parameter.' })
  }
  if (!ALLOWED_EVENTS.has(eventName)) {
    return res.status(400).json({ error: 'Unsupported marketing event.' })
  }
  if (!eventId) {
    return res.status(400).json({ error: 'Missing eventId for deduplication.' })
  }

  try {
    const result = await trackServerMarketingEvent(shop, {
      eventName,
      eventId,
      payload,
      userData,
      req,
    })

    return res.json({ success: true, ...result })
  } catch (err) {
    console.error('Marketing track error:', err)
    return res.status(500).json({ error: 'Failed to track marketing event.' })
  }
})

module.exports = router
