const express = require('express')
const router = express.Router()
const { buildAuthUrl, verifyHmac, generateNonce } = require('../lib/shopify')
const { exchangeAndSaveToken } = require('../lib/shopifyTokens')
const { createSessionToken } = require('../lib/session')

const nonceStore = new Map()

router.get('/', (req, res) => {
  const { shop } = req.query
  if (!shop || !shop.includes('.myshopify.com')) {
    return res.status(400).send('Missing or invalid shop parameter')
  }
  const nonce = generateNonce()
  nonceStore.set(shop, nonce)
  const authUrl = buildAuthUrl(shop, nonce)
  return res.redirect(authUrl)
})

router.get('/callback', async (req, res) => {
  const { shop, code, state, hmac } = req.query

  if (!verifyHmac(req.query)) {
    return res.status(403).send('HMAC verification failed')
  }

  const savedNonce = nonceStore.get(shop)
  if (!savedNonce || savedNonce !== state) {
    return res.status(403).send('Invalid state/nonce')
  }
  nonceStore.delete(shop)

  try {
    await exchangeAndSaveToken(shop, code)
    console.log(`✅ Installed successfully for shop: ${shop}`)
    const dashboardUrl = (process.env.DASHBOARD_URL || 'http://localhost:5174').replace(/\/+$/, '')
    const token = createSessionToken(shop)
    return res.redirect(`${dashboardUrl}?shop=${encodeURIComponent(shop)}&token=${encodeURIComponent(token)}`)
  } catch (err) {
    console.error('OAuth callback error:', err)
    const detail = err?.message || 'Unknown error'
    return res.status(500).send(`Installation failed: ${detail}`)
  }
})

module.exports = router
