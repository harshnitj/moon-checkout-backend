const { getDb, normalizeDoc } = require('../db')

const COLLECTION = 'Merchant'

async function findMerchantByShop(shop) {
  const doc = await getDb().collection(COLLECTION).findOne({ shop })
  return normalizeDoc(doc)
}

async function upsertMerchant(shop, data) {
  const now = new Date()
  const result = await getDb().collection(COLLECTION).findOneAndUpdate(
    { shop },
    {
      $set: {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        expiresAt: data.expiresAt,
        refreshTokenExpiresAt: data.refreshTokenExpiresAt,
        updatedAt: now,
      },
      $setOnInsert: {
        shop,
        installedAt: now,
      },
    },
    { upsert: true, returnDocument: 'after' },
  )
  return normalizeDoc(result)
}

async function updateMerchantProfile(shop, profile) {
  const now = new Date()
  const result = await getDb().collection(COLLECTION).findOneAndUpdate(
    { shop },
    {
      $set: {
        ...profile,
        updatedAt: now,
      },
    },
    { returnDocument: 'after' },
  )
  return normalizeDoc(result)
}

async function deleteMerchantByShop(shop) {
  const result = await getDb().collection(COLLECTION).deleteOne({ shop })
  return result.deletedCount > 0
}

module.exports = {
  findMerchantByShop,
  upsertMerchant,
  updateMerchantProfile,
  deleteMerchantByShop,
}
