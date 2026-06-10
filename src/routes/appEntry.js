const express = require('express')
const { verifyHmac } = require('../lib/shopify')
const { findMerchantByShop } = require('../lib/repositories/merchants')
const { createSessionToken } = require('../lib/session')

const router = express.Router()

function dashboardUrl() {
  return (process.env.DASHBOARD_URL || 'http://localhost:5174').replace(/\/+$/, '')
}

router.get('/', async (req, res) => {
  const { shop, hmac } = req.query

  if (!shop || !String(shop).includes('.myshopify.com')) {
    return res.redirect(dashboardUrl())
  }

  if (!hmac || !verifyHmac(req.query)) {
    return res.status(403).send('Invalid app request. Open Moon Checkout from your Shopify admin.')
  }

  try {
    const merchant = await findMerchantByShop(shop)

    if (merchant) {
      const token = createSessionToken(shop)
      return res.redirect(
        `${dashboardUrl()}?shop=${encodeURIComponent(shop)}&token=${encodeURIComponent(token)}`,
      )
    }

    return res.redirect(`/auth?shop=${encodeURIComponent(shop)}`)
  } catch (err) {
    console.error('App entry error:', err)
    return res.status(500).send(err?.message || 'Could not open Moon Checkout.')
  }
})

module.exports = router
