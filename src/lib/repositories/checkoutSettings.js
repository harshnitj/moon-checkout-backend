const { getDb, toObjectId, normalizeDoc } = require('../db')

const COLLECTION = 'CheckoutSettings'

async function findSettingsByMerchantId(merchantId) {
  const doc = await getDb().collection(COLLECTION).findOne({
    merchantId: toObjectId(merchantId),
  })
  return normalizeDoc(doc)
}

async function createSettings(merchantId, data) {
  const now = new Date()
  const doc = {
    merchantId: toObjectId(merchantId),
    ...data,
    updatedAt: now,
  }
  const result = await getDb().collection(COLLECTION).insertOne(doc)
  return normalizeDoc({ _id: result.insertedId, ...doc })
}

async function updateSettingsByMerchantId(merchantId, update) {
  const now = new Date()
  const result = await getDb().collection(COLLECTION).findOneAndUpdate(
    { merchantId: toObjectId(merchantId) },
    { $set: { ...update, updatedAt: now } },
    { returnDocument: 'after' },
  )
  return normalizeDoc(result)
}

async function deleteSettingsByMerchantId(merchantId) {
  const result = await getDb().collection(COLLECTION).deleteOne({
    merchantId: toObjectId(merchantId),
  })
  return result.deletedCount > 0
}

module.exports = {
  findSettingsByMerchantId,
  createSettings,
  updateSettingsByMerchantId,
  deleteSettingsByMerchantId,
}
