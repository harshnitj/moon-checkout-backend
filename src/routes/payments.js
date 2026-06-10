const express = require('express')
const router = express.Router()
const { getRazorpayCredentialsForShop } = require('../lib/checkoutSettings')
const { createRazorpayClient, verifyRazorpaySignature } = require('../lib/razorpayCredentials')

// POST /api/payments/razorpay/create-order
router.post('/razorpay/create-order', async (req, res) => {
  const { shop, amount } = req.body
  const amountPaise = Math.round(Number(amount))
  if (!shop || !Number.isFinite(amountPaise) || amountPaise < 100) {
    return res.status(400).json({ error: 'Missing shop or invalid amount' })
  }

  try {
    const credentials = await getRazorpayCredentialsForShop(shop)
    if (!credentials) {
      return res.status(503).json({
        error: 'Razorpay is not configured for this store. Add Razorpay credentials in the merchant dashboard.',
      })
    }

    const razorpay = createRazorpayClient(credentials)
    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt: `mc_${Date.now()}`,
    })

    return res.json({
      id: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: credentials.keyId,
    })
  } catch (err) {
    const details = err?.error?.description || err?.message
    console.error('Razorpay order error:', details || err)
    return res.status(500).json({
      error: 'Failed to create Razorpay order',
      ...(details && { details }),
    })
  }
})

// POST /api/payments/razorpay/verify
router.post('/razorpay/verify', async (req, res) => {
  const { shop, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body

  if (!shop || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    return res.status(400).json({ error: 'Missing shop or payment verification fields.' })
  }

  try {
    const credentials = await getRazorpayCredentialsForShop(shop)
    if (!credentials) {
      return res.status(503).json({
        error: 'Razorpay is not configured for this store. Add Razorpay credentials in the merchant dashboard.',
      })
    }

    const verified = verifyRazorpaySignature({
      keySecret: credentials.keySecret,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    })

    if (!verified) {
      return res.status(400).json({ error: 'Payment verification failed' })
    }

    return res.json({ verified: true })
  } catch (err) {
    console.error('Razorpay verify error:', err)
    return res.status(500).json({ error: 'Failed to verify Razorpay payment.' })
  }
})

module.exports = router
