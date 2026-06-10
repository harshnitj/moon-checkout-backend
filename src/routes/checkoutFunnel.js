const express = require('express')
const { getSettingsForShop } = require('../lib/checkoutSettings')
const { buildSessionPatch } = require('../lib/funnelSessions')
const { upsertSession } = require('../lib/repositories/checkoutSessions')

const router = express.Router()

function normalizeShop(input) {
  let shop = String(input || '').trim().toLowerCase()
  if (!shop) return null
  if (!shop.includes('.')) shop = `${shop}.myshopify.com`
  if (!shop.endsWith('.myshopify.com')) return null
  return shop
}

router.post('/track', async (req, res) => {
  const shop = normalizeShop(req.body.shop)
  const sessionId = String(req.body.sessionId || '').trim()
  const event = String(req.body.event || '').trim()

  if (!shop || !sessionId || !event) {
    return res.status(400).json({ error: 'Missing shop, sessionId, or event.' })
  }

  try {
    const result = await getSettingsForShop(shop)
    if (!result) {
      return res.status(404).json({ error: 'Store not configured.' })
    }

    const patch = buildSessionPatch({ ...req.body, shop })
    const session = await upsertSession({
      merchantId: result.merchant.id,
      ...patch,
    })

    return res.json({ ok: true, sessionId: session.sessionId, funnelStage: session.funnelStage })
  } catch (err) {
    console.error('Funnel track error:', err)
    return res.status(500).json({ error: 'Failed to track funnel event.' })
  }
})

module.exports = router
