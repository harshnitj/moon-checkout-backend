function isValidShopLogoUrl(url) {
  if (!url || typeof url !== 'string') return false
  const lower = url.toLowerCase()
  if (lower.includes('cover_image')) return false
  if (lower.includes('theme_cover')) return false
  return true
}

function parseShopProfile(shopData, shop) {
  const brand = shopData?.brand
  let shopLogoUrl =
    brand?.logo?.image?.url ||
    brand?.squareLogo?.image?.url ||
    null

  if (!isValidShopLogoUrl(shopLogoUrl)) {
    shopLogoUrl = null
  }

  return {
    shopName: shopData?.name || null,
    shopLogoUrl,
    myshopifyDomain: shopData?.myshopifyDomain || shop,
    primaryDomain: shopData?.primaryDomain?.host || null,
    primaryDomainUrl: shopData?.primaryDomain?.url || null,
  }
}

function serializeMerchantProfile(merchant) {
  if (!merchant) return null

  return {
    shop: merchant.shop,
    shopName: merchant.shopName || null,
    shopLogoUrl: merchant.shopLogoUrl || null,
    myshopifyDomain: merchant.myshopifyDomain || merchant.shop || null,
    primaryDomain: merchant.primaryDomain || null,
    primaryDomainUrl: merchant.primaryDomainUrl || null,
    installedAt: merchant.installedAt || null,
    profileUpdatedAt: merchant.profileUpdatedAt || null,
  }
}

const SHOP_PROFILE_QUERY = `{
  shop {
    name
    myshopifyDomain
    primaryDomain {
      host
      url
    }
    brand {
      logo {
        image {
          url
        }
      }
      squareLogo {
        image {
          url
        }
      }
    }
  }
}`

async function fetchShopProfileFromShopify(shop, accessToken) {
  if (!accessToken) {
    return parseShopProfile(null, shop)
  }

  const response = await fetch(`https://${shop}/admin/api/2024-01/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
    },
    body: JSON.stringify({ query: SHOP_PROFILE_QUERY }),
  })

  if (!response.ok) {
    throw new Error(`Shop profile fetch failed: ${await response.text()}`)
  }

  const data = await response.json()
  if (data?.errors?.length) {
    throw new Error(data.errors.map((err) => err.message).join('; '))
  }

  return parseShopProfile(data?.data?.shop, shop)
}

module.exports = {
  isValidShopLogoUrl,
  parseShopProfile,
  serializeMerchantProfile,
  fetchShopProfileFromShopify,
  SHOP_PROFILE_QUERY,
}
