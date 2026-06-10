const { getDb, toObjectId } = require('./db')
const { findMerchantByShop, deleteMerchantByShop } = require('./repositories/merchants')
const { deleteSettingsByMerchantId } = require('./repositories/checkoutSettings')
const {
  exportCustomerRecords,
  redactCustomerRecords,
  deleteRecordsByMerchantId,
} = require('./repositories/gdpr')

function normalizeShopDomain(input) {
  let shop = String(input || '').trim().toLowerCase()
  if (!shop) return null
  if (!shop.includes('.')) shop = `${shop}.myshopify.com`
  return shop.endsWith('.myshopify.com') ? shop : null
}

function buildCustomerMatchers(payload = {}) {
  const customer = payload.customer || {}
  const matchers = []

  if (customer.email) {
    matchers.push({ customerEmail: String(customer.email).trim().toLowerCase() })
  }
  if (customer.phone) {
    const digits = String(customer.phone).replace(/\D/g, '').slice(-10)
    if (digits) {
      matchers.push({ customerPhone: { $regex: digits } })
    }
  }
  if (customer.id) {
    matchers.push({ shopifyCustomerId: Number(customer.id) })
  }

  return matchers
}

async function handleCustomerDataRequest(payload) {
  const shop = normalizeShopDomain(payload.shop_domain)
  if (!shop) return { shop, records: [] }

  const merchant = await findMerchantByShop(shop)
  if (!merchant) return { shop, records: [] }

  const records = await exportCustomerRecords(merchant.id, buildCustomerMatchers(payload))
  return { shop, records }
}

async function handleCustomerRedact(payload) {
  const shop = normalizeShopDomain(payload.shop_domain)
  if (!shop) return { shop, redacted: 0 }

  const merchant = await findMerchantByShop(shop)
  if (!merchant) return { shop, redacted: 0 }

  const redacted = await redactCustomerRecords(merchant.id, buildCustomerMatchers(payload))
  return { shop, redacted }
}

async function handleShopRedact(payload) {
  const shop = normalizeShopDomain(payload.shop_domain)
  if (!shop) return { shop, deleted: false }

  const merchant = await findMerchantByShop(shop)
  if (!merchant) return { shop, deleted: false }

  await deleteRecordsByMerchantId(merchant.id)
  await deleteSettingsByMerchantId(merchant.id)
  await deleteMerchantByShop(shop)
  return { shop, deleted: true }
}

async function handleAppUninstalled(payload) {
  const shop = normalizeShopDomain(payload.shop_domain || payload.myshopify_domain)
  if (!shop) return { shop, uninstalled: false }

  const merchant = await findMerchantByShop(shop)
  if (!merchant) return { shop, uninstalled: false }

  await getDb().collection('Merchant').updateOne(
    { shop },
    {
      $set: {
        accessToken: null,
        refreshToken: null,
        expiresAt: null,
        refreshTokenExpiresAt: null,
        uninstalledAt: new Date(),
        updatedAt: new Date(),
      },
    },
  )

  return { shop, uninstalled: true }
}

module.exports = {
  handleCustomerDataRequest,
  handleCustomerRedact,
  handleShopRedact,
  handleAppUninstalled,
}
