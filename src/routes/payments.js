const express = require('express')
const router = express.Router()
const Razorpay = require('razorpay')
const crypto = require('crypto')
const { findMerchantByShop } = require('../lib/repositories/merchants')

// POST /api/payments/razorpay/create-order
router.post('/razorpay/create-order', async (req, res) => {
  const { shop, amount } = req.body
  const amountPaise = Math.round(Number(amount))
  if (!shop || !Number.isFinite(amountPaise) || amountPaise < 100) {
    return res.status(400).json({ error: 'Missing shop or invalid amount' })
  }

  try {
    const keyId = process.env.RAZORPAY_KEY_ID?.trim()
    const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim()
    if (!keyId || !keySecret) {
      console.error('Razorpay order error: RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET not set')
      return res.status(503).json({
        error: 'Razorpay is not configured on the server. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to your backend environment.',
      })
    }

    const merchant = await findMerchantByShop(shop)
    if (!merchant) return res.status(404).json({ error: 'Merchant not found' })

    // Each merchant should have their own Razorpay keys stored in DB
    // For now we use env vars — in production store per-merchant keys
    const razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    })

    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt: `mc_${Date.now()}`,
    })

    return res.json({ id: order.id, amount: order.amount, currency: order.currency })
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
  const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim()
  if (!keySecret) {
    return res.status(503).json({
      error: 'Razorpay is not configured on the server. Add RAZORPAY_KEY_SECRET to your backend environment.',
    })
  }

  const body = razorpayOrderId + '|' + razorpayPaymentId
  const expectedSignature = crypto
    .createHmac('sha256', keySecret)
    .update(body)
    .digest('hex')

  if (expectedSignature !== razorpaySignature) {
    return res.status(400).json({ error: 'Payment verification failed' })
  }

  return res.json({ verified: true })
})

module.exports = router
