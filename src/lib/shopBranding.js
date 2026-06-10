const { getValidAccessToken } = require('./shopifyTokens')

async function fetchShopBranding(shop) {
  const accessToken = await getValidAccessToken(shop)
  if (!accessToken) {
    return { shopName: null, shopLogoUrl: null }
  }

  const query = `{
    shop {
      name
      brand {
        logo {
          image {
            url
          }
        }
      }
    }
  }`

  try {
    const response = await fetch(`https://${shop}/admin/api/2024-01/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      body: JSON.stringify({ query }),
    })

    if (!response.ok) {
      console.error(`Shop branding fetch failed for ${shop}:`, await response.text())
      return { shopName: null, shopLogoUrl: null }
    }

    const data = await response.json()
    const shopData = data?.data?.shop

    return {
      shopName: shopData?.name || null,
      shopLogoUrl: shopData?.brand?.logo?.image?.url || null,
    }
  } catch (err) {
    console.error(`Shop branding fetch error for ${shop}:`, err)
    return { shopName: null, shopLogoUrl: null }
  }
}

module.exports = {
  fetchShopBranding,
}
