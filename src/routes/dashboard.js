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
const { resolveCollectionProductIds } = require('../lib/rtoRules')
const {
  buildFunnelSummary,
  getRangeStart,
  serializeDropOffLead,
  stageLabel,
} = require('../lib/funnelSessions')
const {
  aggregateFunnelCounts,
  countSessions,
  findSessions,
} = require('../lib/repositories/checkoutSessions')

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
    settings: serializeSettings(settings, { includeDashboardFields: true }),
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
    recentOrders: transactions.slice(0, 5).map(serializeOrder),
    recentTransactions: transactions.slice(0, 5).map(serializeOrder),
  })
})

router.get('/settings', dashboardAuth, async (req, res) => {
  const settings = await ensureCheckoutSettings(req.merchant.id)
  return res.json({ settings: serializeSettings(settings, { includeDashboardFields: true }) })
})

router.put('/settings', dashboardAuth, async (req, res) => {
  try {
    const update = pickSettingsUpdate(req.body)
    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: 'No settings provided.' })
    }

    await ensureCheckoutSettings(req.merchant.id)
    const existing = await ensureCheckoutSettings(req.merchant.id)
    const mergedForCollections = { ...existing, ...update }
    if (
      update.rtoBlockedCollectionIds !== undefined
      || update.rtoRules !== undefined
      || update.rtoMitigationCollectionEnabled !== undefined
    ) {
      update.rtoCollectionProductIds = await resolveCollectionProductIds(req.shop, mergedForCollections)
    }
    const settings = await updateSettingsByMerchantId(req.merchant.id, update)

    return res.json({ settings: serializeSettings(settings, { includeDashboardFields: true }) })
  } catch (err) {
    console.error('Settings save error:', err)
    const status = /invalid|required when/i.test(err.message) ? 400 : 500
    return res.status(status).json({
      error: status === 400 ? err.message : 'Failed to save settings.',
      details: err.message,
    })
  }
})

router.get('/funnel', dashboardAuth, async (req, res) => {
  try {
    const range = String(req.query.range || '7d')
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1)
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100)
    const skip = (page - 1) * limit
    const search = String(req.query.search || '').trim().toLowerCase()
    const since = getRangeStart(range)
    const merchantId = req.merchant.id

    const where = { merchantId }
    if (since) where.createdAt = { gte: since }

    const dropOffWhere = {
      ...where,
      dropOff: true,
      ...(search ? { search } : {}),
    }

    const [counts, dropOffTotal, dropOffItems] = await Promise.all([
      aggregateFunnelCounts(merchantId, since),
      countSessions(dropOffWhere),
      findSessions({
        where: dropOffWhere,
        orderBy: { lastActivityAt: 'desc' },
        skip,
        take: limit,
      }),
    ])

    const funnel = buildFunnelSummary(counts)

    return res.json({
      range,
      funnel,
      summary: {
        sessionsStarted: counts.started,
        phoneCaptured: counts.phone_captured,
        ordersCompleted: counts.completed,
        abandoned: counts.abandoned,
        retargetingReady: Math.max(counts.phone_captured - counts.completed, 0),
        overallConversion: counts.started > 0
          ? Math.round((counts.completed / counts.started) * 100)
          : 0,
      },
      dropOffs: dropOffItems.map(serializeDropOffLead),
      stageLabels: {
        started: stageLabel('started'),
        phone_captured: stageLabel('phone_captured'),
        contact_completed: stageLabel('contact_completed'),
        address_completed: stageLabel('address_completed'),
        payment_viewed: stageLabel('payment_viewed'),
        abandoned: stageLabel('abandoned'),
        completed: stageLabel('completed'),
      },
      pagination: {
        page,
        limit,
        total: dropOffTotal,
        totalPages: Math.ceil(dropOffTotal / limit),
      },
    })
  } catch (err) {
    console.error('Funnel load error:', err)
    return res.status(500).json({ error: 'Failed to load funnel data.' })
  }
})

async function listOrders(req, res) {
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
    orders: filtered.map(serializeOrder),
    transactions: filtered.map(serializeOrder),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  })
}

router.get('/orders', dashboardAuth, listOrders)
router.get('/transactions', dashboardAuth, listOrders)

function serializeOrder(tx) {
  const { serializeCartSnapshot } = require('../lib/cartSnapshot')
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
    cartSnapshot: serializeCartSnapshot(tx.cartSnapshot),
    createdAt: tx.createdAt,
  }
}

module.exports = router
