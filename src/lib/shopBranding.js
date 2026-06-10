const { getValidAccessToken } = require('./shopifyTokens')
const { updateMerchantProfile } = require('./repositories/merchants')
const {
  fetchShopProfileFromShopify,
  parseShopProfile,
} = require('./merchantProfile')

async function fetchShopBranding(shop) {
  try {
    const accessToken = await getValidAccessToken(shop)
    if (!accessToken) {
      return { shopName: null, shopLogoUrl: null }
    }

    const profile = await fetchShopProfileFromShopify(shop, accessToken)
    return {
      shopName: profile.shopName,
      shopLogoUrl: profile.shopLogoUrl,
    }
  } catch (err) {
    console.error(`Shop branding fetch error for ${shop}:`, err)
    return { shopName: null, shopLogoUrl: null }
  }
}

async function persistMerchantShopProfile(shop, accessToken) {
  const profile = await fetchShopProfileFromShopify(shop, accessToken)
  const updatedAt = new Date()

  await updateMerchantProfile(shop, {
    shopName: profile.shopName,
    shopLogoUrl: profile.shopLogoUrl,
    myshopifyDomain: profile.myshopifyDomain,
    primaryDomain: profile.primaryDomain,
    primaryDomainUrl: profile.primaryDomainUrl,
    profileUpdatedAt: updatedAt,
  })

  return {
    ...profile,
    profileUpdatedAt: updatedAt,
  }
}

async function refreshMerchantShopProfile(shop) {
  const accessToken = await getValidAccessToken(shop)
  if (!accessToken) return parseShopProfile(null, shop)
  return persistMerchantShopProfile(shop, accessToken)
}

function getMerchantBranding(merchant) {
  if (!merchant) {
    return { shopName: null, shopLogoUrl: null }
  }

  return {
    shopName: merchant.shopName || null,
    shopLogoUrl: merchant.shopLogoUrl || null,
  }
}

module.exports = {
  fetchShopBranding,
  persistMerchantShopProfile,
  refreshMerchantShopProfile,
  getMerchantBranding,
}
