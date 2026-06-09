const { findMerchantByShop } = require('../lib/repositories/merchants')
const { verifySessionToken } = require('../lib/session')

async function dashboardAuth(req, res, next) {
  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

  const shop = verifySessionToken(token)
  if (!shop) {
    return res.status(401).json({ error: 'Unauthorized. Please log in again.' })
  }

  const merchant = await findMerchantByShop(shop)
  if (!merchant) {
    return res.status(404).json({ error: 'Merchant not found.' })
  }

  req.merchant = merchant
  req.shop = shop
  return next()
}

module.exports = dashboardAuth
