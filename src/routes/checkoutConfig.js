const express = require('express')
const {
  getSettingsForShop,
  serializeSettings,
  isPaymentMethodAllowed,
} = require('../lib/checkoutSettings')
const { fetchShopBranding, getMerchantBranding } = require('../lib/shopBranding')

const router = express.Router()

function normalizeShop(input) {
  let shop = String(input || '').trim().toLowerCase()
  if (!shop) return null
  if (!shop.includes('.')) shop = `${shop}.myshopify.com`
  if (!shop.endsWith('.myshopify.com')) return null
  return shop
}

router.get('/', async (req, res) => {
  const shop = normalizeShop(req.query.shop)
  if (!shop) {
    return res.status(400).json({ error: 'Missing or invalid shop parameter.' })
  }

  const result = await getSettingsForShop(shop)
  if (!result) {
    return res.status(404).json({ error: 'Store not configured. App may not be installed.' })
  }

  let branding = getMerchantBranding(result.merchant)
  if (!branding.shopName && !branding.shopLogoUrl) {
    branding = await fetchShopBranding(shop)
  }

  return res.json({
    shop,
    settings: serializeSettings(result.settings),
    shopName: branding.shopName,
    shopLogoUrl: branding.shopLogoUrl,
  })
})

router.post('/validate-payment', async (req, res) => {
  const shop = normalizeShop(req.body.shop)
  const {
    paymentMethod,
    cartTotalPaise,
    pincode,
    phone,
    state,
    productIds,
    lineItems,
  } = req.body

  if (!shop || !paymentMethod) {
    return res.status(400).json({ error: 'Missing shop or payment method.' })
  }

  const result = await getSettingsForShop(shop)
  if (!result) {
    return res.status(404).json({ error: 'Store not configured.' })
  }

  const validation = isPaymentMethodAllowed(
    result.settings,
    paymentMethod,
    Number(cartTotalPaise) || 0,
    {
      pincode,
      phone,
      state,
      productIds,
      lineItems,
    }
  )

  return res.json(validation)
})

module.exports = router
