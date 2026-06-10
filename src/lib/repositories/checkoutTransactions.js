const { getDb, toObjectId, normalizeDoc } = require('../db')
const { buildCartSnapshot, serializeCartSnapshot } = require('../cartSnapshot')

const COLLECTION = 'CheckoutTransaction'

function buildFilter(where = {}) {
  const filter = {}
  if (where.merchantId) filter.merchantId = toObjectId(where.merchantId)
  if (where.paymentMethod) filter.paymentMethod = where.paymentMethod
  if (where.createdAt?.gte) filter.createdAt = { $gte: where.createdAt.gte }
  return filter
}

async function createTransaction(data) {
  const now = new Date()
  const doc = {
    merchantId: toObjectId(data.merchantId),
    shopifyOrderId: data.shopifyOrderId,
    shopifyOrderName: data.shopifyOrderName,
    customerName: data.customerName ?? null,
    customerEmail: data.customerEmail ?? null,
    customerPhone: data.customerPhone ?? null,
    paymentMethod: data.paymentMethod,
    amountPaise: data.amountPaise ?? 0,
    status: data.status ?? 'pending',
    cartSnapshot: data.cartSnapshot ? buildCartSnapshot(data.cartSnapshot) : null,
    createdAt: now,
  }
  const result = await getDb().collection(COLLECTION).insertOne(doc)
  return normalizeDoc({ _id: result.insertedId, ...doc })
}

async function countTransactions(where = {}) {
  return getDb().collection(COLLECTION).countDocuments(buildFilter(where))
}

async function findTransactions({ where = {}, orderBy, take, skip } = {}) {
  let cursor = getDb().collection(COLLECTION).find(buildFilter(where))
  if (orderBy?.createdAt === 'desc') cursor = cursor.sort({ createdAt: -1 })
  if (skip) cursor = cursor.skip(skip)
  if (take) cursor = cursor.limit(take)
  const docs = await cursor.toArray()
  return docs.map(normalizeDoc)
}

function serializeTransactionDoc(tx) {
  if (!tx) return null
  return {
    ...tx,
    cartSnapshot: serializeCartSnapshot(tx.cartSnapshot),
  }
}

module.exports = {
  createTransaction,
  countTransactions,
  findTransactions,
  serializeTransactionDoc,
}
