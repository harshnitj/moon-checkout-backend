const { findMerchantByShop, upsertMerchant } = require('./repositories/merchants')
const { encryptToken, decryptToken } = require('./crypto')
const { ensureCheckoutSettings } = require('./checkoutSettings')
const { persistMerchantShopProfile } = require('./shopBranding')
const {
  exchangeCodeForToken,
  refreshAccessToken,
  migrateToExpiringToken,
} = require('./shopify')

const REFRESH_BUFFER_MS = 5 * 60 * 1000

function tokenExpiryDate(seconds) {
  return new Date(Date.now() + seconds * 1000)
}

async function saveMerchantTokens(shop, tokenData) {
  const expiresAt = tokenData.expires_in
    ? tokenExpiryDate(tokenData.expires_in)
    : null
  const refreshTokenExpiresAt = tokenData.refresh_token_expires_in
    ? tokenExpiryDate(tokenData.refresh_token_expires_in)
    : null

  const merchant = await upsertMerchant(shop, {
    accessToken: encryptToken(tokenData.access_token),
    refreshToken: tokenData.refresh_token
      ? encryptToken(tokenData.refresh_token)
      : null,
    expiresAt,
    refreshTokenExpiresAt,
  })

  await ensureCheckoutSettings(merchant.id)

  try {
    await persistMerchantShopProfile(shop, tokenData.access_token)
    console.log(`✅ Saved merchant profile for ${shop}`)
  } catch (err) {
    console.error(`Failed to save merchant profile for ${shop}:`, err)
  }
}

function isExpired(expiresAt) {
  if (!expiresAt) return false
  return Date.now() >= new Date(expiresAt).getTime() - REFRESH_BUFFER_MS
}

async function getValidAccessToken(shop) {
  const merchant = await findMerchantByShop(shop)
  if (!merchant) return null

  let accessToken = decryptToken(merchant.accessToken)

  // Migrate legacy non-expiring token to expiring token
  if (!merchant.refreshToken && !merchant.expiresAt) {
    console.log(`🔄 Migrating ${shop} to expiring offline token...`)
    const migrated = await migrateToExpiringToken(shop, accessToken)
    await saveMerchantTokens(shop, migrated)
    return migrated.access_token
  }

  if (isExpired(merchant.expiresAt)) {
    if (!merchant.refreshToken) {
      throw new Error('Access token expired and no refresh token. Reinstall the app.')
    }

    const refreshToken = decryptToken(merchant.refreshToken)
    const refreshed = await refreshAccessToken(shop, refreshToken)
    await saveMerchantTokens(shop, refreshed)
    return refreshed.access_token
  }

  return accessToken
}

module.exports = {
  saveMerchantTokens,
  getValidAccessToken,
  exchangeAndSaveToken: async (shop, code) => {
    const tokenData = await exchangeCodeForToken(shop, code)
    await saveMerchantTokens(shop, tokenData)
    return tokenData
  },
}
