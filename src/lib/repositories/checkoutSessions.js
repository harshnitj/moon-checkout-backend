const { getDb, toObjectId, normalizeDoc } = require('../db')
const { buildCartSnapshot } = require('../cartSnapshot')
const { mergeDelivery } = require('../deliveryUtils')
const {
  FUNNEL_STAGES,
  STAGE_RANK,
  normalizeStage,
  resolvePeakStage,
  shouldUpgradeStage,
} = require('../sessionStage')

const COLLECTION = 'CheckoutSession'

function buildFilter(where = {}) {
  const filter = {}
  if (where.merchantId) filter.merchantId = toObjectId(where.merchantId)
  if (where.funnelStage) {
    filter.funnelStage = Array.isArray(where.funnelStage)
      ? { $in: where.funnelStage }
      : where.funnelStage
  }
  if (where.customerPhone) filter.customerPhone = where.customerPhone
  if (where.sessionId) filter.sessionId = where.sessionId
  if (where.createdAt?.gte) {
    filter.createdAt = { ...(filter.createdAt || {}), $gte: where.createdAt.gte }
  }
  if (where.createdAt?.lte) {
    filter.createdAt = { ...(filter.createdAt || {}), $lte: where.createdAt.lte }
  }
  if (where.hasPhone) {
    filter.customerPhone = { $nin: [null, ''] }
  }
  if (where.dropOff) {
    filter.customerPhone = { $nin: [null, ''] }
    filter.funnelStage = { $nin: ['completed'] }
  }

  const search = String(where.search || '').trim()
  if (search) {
    const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    const searchClause = {
      $or: [
        { sessionId: regex },
        { customerPhone: regex },
        { customerEmail: regex },
        { customerName: regex },
        { 'delivery.city': regex },
        { 'delivery.state': regex },
      ],
    }
    if (Object.keys(filter).length === 0) return searchClause
    return { $and: [filter, searchClause] }
  }

  return filter
}

async function upsertSession(data) {
  const now = new Date()
  const merchantId = toObjectId(data.merchantId)
  const sessionId = String(data.sessionId || '').trim()
  if (!sessionId) throw new Error('sessionId is required')

  const existing = await getDb().collection(COLLECTION).findOne({ merchantId, sessionId })
  const currentStage = resolvePeakStage(existing || {})
  const nextStage = normalizeStage(data.funnelStage || currentStage)
  const isAbandonEvent = nextStage === 'abandoned'
  const funnelStage = isAbandonEvent
    ? currentStage
    : (shouldUpgradeStage(currentStage, nextStage) ? nextStage : currentStage)

  const setFields = {
    shop: data.shop,
    checkoutVariant: data.checkoutVariant || existing?.checkoutVariant || 'single-page',
    lastStep: data.lastStep ?? existing?.lastStep ?? 1,
    funnelStage,
    lastActivityAt: now,
    updatedAt: now,
  }

  if (data.customerPhone) setFields.customerPhone = data.customerPhone
  if (data.customerEmail !== undefined) setFields.customerEmail = data.customerEmail || null
  if (data.customerName !== undefined) setFields.customerName = data.customerName || null
  if (data.paymentMethod !== undefined) setFields.paymentMethodSelected = data.paymentMethod || null
  if (data.delivery !== undefined) {
    setFields.delivery = mergeDelivery(existing?.delivery, data.delivery)
  }
  if (data.cartSnapshot) setFields.cartSnapshot = buildCartSnapshot(data.cartSnapshot)
  if (data.completedOrderId) setFields.completedOrderId = data.completedOrderId
  if (data.completedOrderName) setFields.completedOrderName = data.completedOrderName
  if (isAbandonEvent) setFields.abandonedAt = now
  if (funnelStage === 'completed') setFields.completedAt = now
  if (funnelStage === 'payment_viewed' || nextStage === 'payment_viewed') {
    setFields.paymentReached = true
  }
  if (funnelStage === 'completed') setFields.paymentReached = true

  const result = await getDb().collection(COLLECTION).findOneAndUpdate(
    { merchantId, sessionId },
    {
      $set: setFields,
      $setOnInsert: {
        merchantId,
        sessionId,
        createdAt: now,
      },
    },
    { upsert: true, returnDocument: 'after' },
  )

  return normalizeDoc(result)
}

async function markSessionCompleted({ merchantId, sessionId, customerPhone, completedOrderId, completedOrderName }) {
  const filter = { merchantId: toObjectId(merchantId) }
  if (sessionId) filter.sessionId = sessionId
  else if (customerPhone) {
    filter.customerPhone = customerPhone
    filter.funnelStage = { $nin: ['completed'] }
  } else {
    return null
  }

  const now = new Date()
  const result = await getDb().collection(COLLECTION).findOneAndUpdate(
    filter,
    {
      $set: {
        funnelStage: 'completed',
        completedAt: now,
        lastActivityAt: now,
        updatedAt: now,
        completedOrderId: completedOrderId || null,
        completedOrderName: completedOrderName || null,
      },
    },
    { sort: { lastActivityAt: -1 }, returnDocument: 'after' },
  )

  return result ? normalizeDoc(result) : null
}

async function countSessions(where = {}) {
  return getDb().collection(COLLECTION).countDocuments(buildFilter(where))
}

async function findSessions({ where = {}, orderBy, take, skip } = {}) {
  let cursor = getDb().collection(COLLECTION).find(buildFilter(where))
  if (orderBy?.lastActivityAt === 'desc') cursor = cursor.sort({ lastActivityAt: -1 })
  if (orderBy?.createdAt === 'desc') cursor = cursor.sort({ createdAt: -1 })
  if (skip) cursor = cursor.skip(skip)
  if (take) cursor = cursor.limit(take)
  const docs = await cursor.toArray()
  return docs.map(normalizeDoc)
}

async function aggregateFunnelCounts(merchantId, since = null) {
  const match = { merchantId: toObjectId(merchantId) }
  if (since) match.createdAt = { $gte: since }

  const docs = await getDb().collection(COLLECTION).find(match).toArray()

  const counts = {
    started: 0,
    phone_captured: 0,
    contact_completed: 0,
    address_completed: 0,
    payment_viewed: 0,
    completed: 0,
    abandoned: 0,
  }

  for (const doc of docs) {
    const peakStage = resolvePeakStage(doc)
    const rank = STAGE_RANK[peakStage] ?? 0

    counts.started += 1
    if (rank >= STAGE_RANK.phone_captured || doc.customerPhone) counts.phone_captured += 1
    if (rank >= STAGE_RANK.contact_completed) counts.contact_completed += 1
    if (rank >= STAGE_RANK.address_completed) counts.address_completed += 1
    if (rank >= STAGE_RANK.payment_viewed) counts.payment_viewed += 1
    if (peakStage === 'completed') counts.completed += 1
    if (doc.abandonedAt || doc.funnelStage === 'abandoned') counts.abandoned += 1
  }

  return counts
}

module.exports = {
  FUNNEL_STAGES,
  STAGE_RANK,
  resolvePeakStage,
  upsertSession,
  markSessionCompleted,
  countSessions,
  findSessions,
  aggregateFunnelCounts,
}
