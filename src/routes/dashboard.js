const express = require('express')
const { findMerchantByShop } = require('../lib/repositories/merchants')
const { updateSettingsByMerchantId } = require('../lib/repositories/checkoutSettings')
const {
  countTransactions,
  findTransactions,
} = require('../lib/repositories/checkoutTransactions')
const dashboardAuth = require('../middleware/dashboardAuth')
const { createSessionToken } = require('../lib/session')
const {
  ensureCheckoutSettings,
  getSettingsForShop,
  serializeSettings,
  pickSettingsUpdate,
} = require('../lib/checkoutSettings')

const router = express.Router()

function normalizeShop(input) {
  let shop = String(input || '').trim().toLowerCase()
  if (!shop) return null
  if (!shop.includes('.')) shop = `${shop}.myshopify.com`
  if (!shop.endsWith('.myshopify.com')) return null
  return shop
}

router.post('/login', async (req, res) => {
  const shop = normalizeShop(req.body.shop)
  if (!shop) {
    return res.status(400).json({ error: 'Enter a valid Shopify store domain.' })
  }

  const merchant = await findMerchantByShop(shop)
  if (!merchant) {
    return res.status(404).json({
      error: 'Store not found. Install the Moon Checkout app on your Shopify store first.',
    })
  }

  await ensureCheckoutSettings(merchant.id)
  const token = createSessionToken(shop)

  return res.json({
    token,
    shop,
    installedAt: merchant.installedAt,
  })
})

router.get('/me', dashboardAuth, async (req, res) => {
  const settings = await ensureCheckoutSettings(req.merchant.id)
  return res.json({
    shop: req.shop,
    installedAt: req.merchant.installedAt,
    settings: serializeSettings(settings),
  })
})

router.get('/overview', dashboardAuth, async (req, res) => {
  const merchantId = req.merchant.id
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)

  const [totalOrders, todayOrders, transactions] = await Promise.all([
    countTransactions({ merchantId }),
    countTransactions({ merchantId, createdAt: { gte: startOfDay } }),
    findTransactions({
      where: { merchantId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
  ])

  const totalRevenue = transactions.reduce((sum, tx) => sum + tx.amountPaise, 0)
  const todayRevenue = transactions
    .filter((tx) => tx.createdAt >= startOfDay)
    .reduce((sum, tx) => sum + tx.amountPaise, 0)

  const paymentBreakdown = transactions.reduce((acc, tx) => {
    acc[tx.paymentMethod] = (acc[tx.paymentMethod] || 0) + 1
    return acc
  }, {})

  return res.json({
    totalOrders,
    todayOrders,
    totalRevenue,
    todayRevenue,
    paymentBreakdown,
    recentTransactions: transactions.slice(0, 5).map(serializeTransaction),
  })
})

router.get('/settings', dashboardAuth, async (req, res) => {
  const settings = await ensureCheckoutSettings(req.merchant.id)
  return res.json({ settings: serializeSettings(settings) })
})

router.put('/settings', dashboardAuth, async (req, res) => {
  try {
    const update = pickSettingsUpdate(req.body)
    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: 'No settings provided.' })
    }

    await ensureCheckoutSettings(req.merchant.id)
    const settings = await updateSettingsByMerchantId(req.merchant.id, update)

    return res.json({ settings: serializeSettings(settings) })
  } catch (err) {
    console.error('Settings save error:', err)
    return res.status(500).json({
      error: 'Failed to save settings.',
      details: err.message,
    })
  }
})

router.get('/transactions', dashboardAuth, async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1)
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100)
  const skip = (page - 1) * limit
  const paymentMethod = req.query.paymentMethod
  const search = String(req.query.search || '').trim().toLowerCase()

  const where = { merchantId: req.merchant.id }
  if (paymentMethod) where.paymentMethod = paymentMethod

  const [items, total] = await Promise.all([
    findTransactions({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    countTransactions(where),
  ])

  const filtered = search
    ? items.filter((tx) => {
        const haystack = [
          tx.shopifyOrderName,
          tx.customerName,
          tx.customerEmail,
          tx.customerPhone,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return haystack.includes(search)
      })
    : items

  return res.json({
    transactions: filtered.map(serializeTransaction),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  })
})

function serializeTransaction(tx) {
  return {
    id: tx.id,
    shopifyOrderId: tx.shopifyOrderId,
    shopifyOrderName: tx.shopifyOrderName,
    customerName: tx.customerName,
    customerEmail: tx.customerEmail,
    customerPhone: tx.customerPhone,
    paymentMethod: tx.paymentMethod,
    amountPaise: tx.amountPaise,
    status: tx.status,
    createdAt: tx.createdAt,
  }
}

module.exports = router
