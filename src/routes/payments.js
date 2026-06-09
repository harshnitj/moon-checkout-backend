const express = require('express')
const router = express.Router()
const Razorpay = require('razorpay')
const crypto = require('crypto')
const { findMerchantByShop } = require('../lib/repositories/merchants')

// POST /api/payments/razorpay/create-order
router.post('/razorpay/create-order', async (req, res) => {
  const { shop, amount } = req.body
  if (!shop || !amount) return res.status(400).json({ error: 'Missing shop or amount' })

  try {
    const merchant = await findMerchantByShop(shop)
    if (!merchant) return res.status(404).json({ error: 'Merchant not found' })

    // Each merchant should have their own Razorpay keys stored in DB
    // For now we use env vars — in production store per-merchant keys
    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    })

    const order = await razorpay.orders.create({
      amount: amount, // already in paise
      currency: 'INR',
      receipt: `mc_${Date.now()}`,
    })

    return res.json({ id: order.id, amount: order.amount, currency: order.currency })
  } catch (err) {
    console.error('Razorpay order error:', err)
    return res.status(500).json({ error: 'Failed to create Razorpay order' })
  }
})

// POST /api/payments/razorpay/verify
router.post('/razorpay/verify', async (req, res) => {
  const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body

  const body = razorpayOrderId + '|' + razorpayPaymentId
  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(body)
    .digest('hex')

  if (expectedSignature !== razorpaySignature) {
    return res.status(400).json({ error: 'Payment verification failed' })
  }

  return res.json({ verified: true })
})

module.exports = router
