const express = require('express')
const { verifyWebhookHmac } = require('../lib/verifyWebhook')
const {
  handleCustomerDataRequest,
  handleCustomerRedact,
  handleShopRedact,
  handleAppUninstalled,
} = require('../lib/gdpr')

const router = express.Router()

function webhookVerifier(req, res, next) {
  const hmac = req.get('X-Shopify-Hmac-Sha256')
  const rawBody = req.body

  if (!verifyWebhookHmac(rawBody, hmac)) {
    return res.status(401).send('Unauthorized')
  }

  try {
    req.webhookPayload = JSON.parse(rawBody.toString('utf8'))
    return next()
  } catch {
    return res.status(400).send('Invalid JSON payload')
  }
}

router.post('/compliance', webhookVerifier, async (req, res) => {
  const topic = req.get('X-Shopify-Topic')
  const payload = req.webhookPayload

  try {
    if (topic === 'customers/data_request') {
      const result = await handleCustomerDataRequest(payload)
      console.log(`GDPR data request for ${result.shop}: ${result.records.length} records`)
    } else if (topic === 'customers/redact') {
      const result = await handleCustomerRedact(payload)
      console.log(`GDPR customer redact for ${result.shop}: ${result.redacted} records updated`)
    } else if (topic === 'shop/redact') {
      const result = await handleShopRedact(payload)
      console.log(`GDPR shop redact for ${result.shop}: deleted=${result.deleted}`)
    } else {
      console.warn(`Unhandled compliance webhook topic: ${topic}`)
    }

    return res.status(200).send('OK')
  } catch (err) {
    console.error(`Compliance webhook error (${topic}):`, err)
    return res.status(500).send('Webhook handler failed')
  }
})

router.post('/app/uninstalled', webhookVerifier, async (req, res) => {
  try {
    const result = await handleAppUninstalled(req.webhookPayload)
    console.log(`App uninstalled for ${result.shop}`)
    return res.status(200).send('OK')
  } catch (err) {
    console.error('App uninstalled webhook error:', err)
    return res.status(500).send('Webhook handler failed')
  }
})

module.exports = router
