const { getDb, toObjectId } = require('../db')

const SESSIONS = 'CheckoutSession'
const TRANSACTIONS = 'CheckoutTransaction'

const REDACT_FIELDS = {
  customerPhone: null,
  customerEmail: null,
  customerName: null,
  delivery: null,
  shopifyCustomerId: null,
}

function buildCustomerFilter(merchantId, matchers = []) {
  if (!matchers.length) return null
  return {
    merchantId: toObjectId(merchantId),
    $or: matchers,
  }
}

async function exportCustomerRecords(merchantId, matchers = []) {
  const filter = buildCustomerFilter(merchantId, matchers)
  if (!filter) return []

  const [sessions, transactions] = await Promise.all([
    getDb().collection(SESSIONS).find(filter).toArray(),
    getDb().collection(TRANSACTIONS).find(filter).toArray(),
  ])

  return [
    ...sessions.map((doc) => ({
      type: 'checkout_session',
      id: String(doc._id),
      sessionId: doc.sessionId,
      customerPhone: doc.customerPhone,
      customerEmail: doc.customerEmail,
      customerName: doc.customerName,
      delivery: doc.delivery,
      createdAt: doc.createdAt,
      lastActivityAt: doc.lastActivityAt,
    })),
    ...transactions.map((doc) => ({
      type: 'checkout_order',
      id: String(doc._id),
      shopifyOrderId: doc.shopifyOrderId,
      shopifyOrderName: doc.shopifyOrderName,
      customerPhone: doc.customerPhone,
      customerEmail: doc.customerEmail,
      customerName: doc.customerName,
      createdAt: doc.createdAt,
    })),
  ]
}

async function redactCustomerRecords(merchantId, matchers = []) {
  const filter = buildCustomerFilter(merchantId, matchers)
  if (!filter) return 0

  const [sessions, transactions] = await Promise.all([
    getDb().collection(SESSIONS).updateMany(filter, { $set: REDACT_FIELDS }),
    getDb().collection(TRANSACTIONS).updateMany(filter, { $set: REDACT_FIELDS }),
  ])

  return (sessions.modifiedCount || 0) + (transactions.modifiedCount || 0)
}

async function deleteRecordsByMerchantId(merchantId) {
  const id = toObjectId(merchantId)
  const [sessions, transactions] = await Promise.all([
    getDb().collection(SESSIONS).deleteMany({ merchantId: id }),
    getDb().collection(TRANSACTIONS).deleteMany({ merchantId: id }),
  ])
  return {
    sessions: sessions.deletedCount || 0,
    transactions: transactions.deletedCount || 0,
  }
}

module.exports = {
  exportCustomerRecords,
  redactCustomerRecords,
  deleteRecordsByMerchantId,
}
