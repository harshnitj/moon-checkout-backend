const { getDb, toObjectId, normalizeDoc } = require('../db')
const { buildCartSnapshot } = require('../cartSnapshot')

const COLLECTION = 'CheckoutSession'

const FUNNEL_STAGES = [
  'started',
  'phone_captured',
  'contact_completed',
  'address_completed',
  'payment_viewed',
  'completed',
  'abandoned',
]

const STAGE_RANK = {
  started: 0,
  phone_captured: 1,
  contact_completed: 2,
  address_completed: 3,
  payment_viewed: 4,
  completed: 5,
  abandoned: 6,
}

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
  return filter
}

function normalizeStage(stage) {
  return FUNNEL_STAGES.includes(stage) ? stage : 'started'
}

function shouldUpgradeStage(currentStage, nextStage) {
  if (nextStage === 'completed') return true
  if (nextStage === 'abandoned') return currentStage !== 'completed'
  if (currentStage === 'completed' || currentStage === 'abandoned') return false
  return (STAGE_RANK[nextStage] ?? 0) > (STAGE_RANK[currentStage] ?? 0)
}

async function upsertSession(data) {
  const now = new Date()
  const merchantId = toObjectId(data.merchantId)
  const sessionId = String(data.sessionId || '').trim()
  if (!sessionId) throw new Error('sessionId is required')

  const existing = await getDb().collection(COLLECTION).findOne({ merchantId, sessionId })
  const currentStage = normalizeStage(existing?.funnelStage)
  const nextStage = normalizeStage(data.funnelStage || currentStage)
  const funnelStage = shouldUpgradeStage(currentStage, nextStage) ? nextStage : currentStage

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
  if (data.delivery !== undefined) setFields.delivery = data.delivery || null
  if (data.cartSnapshot) setFields.cartSnapshot = buildCartSnapshot(data.cartSnapshot)
  if (data.completedOrderId) setFields.completedOrderId = data.completedOrderId
  if (data.completedOrderName) setFields.completedOrderName = data.completedOrderName
  if (funnelStage === 'abandoned') setFields.abandonedAt = now
  if (funnelStage === 'completed') setFields.completedAt = now

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
    const stage = normalizeStage(doc.funnelStage)
    const rank = STAGE_RANK[stage] ?? 0

    counts.started += 1
    if (rank >= STAGE_RANK.phone_captured || doc.customerPhone) counts.phone_captured += 1
    if (rank >= STAGE_RANK.contact_completed) counts.contact_completed += 1
    if (rank >= STAGE_RANK.address_completed) counts.address_completed += 1
    if (rank >= STAGE_RANK.payment_viewed) counts.payment_viewed += 1
    if (stage === 'completed') counts.completed += 1
    if (stage === 'abandoned') counts.abandoned += 1
  }

  return counts
}

module.exports = {
  FUNNEL_STAGES,
  STAGE_RANK,
  upsertSession,
  markSessionCompleted,
  countSessions,
  findSessions,
  aggregateFunnelCounts,
}
