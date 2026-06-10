const { STAGE_RANK, resolvePeakStage } = require('./sessionStage')
const { normalizeDelivery, mergeDelivery } = require('./deliveryUtils')

const EVENT_TO_STAGE = {
  session_started: 'started',
  phone_captured: 'phone_captured',
  contact_completed: 'contact_completed',
  address_completed: 'address_completed',
  payment_viewed: 'payment_viewed',
  abandoned: 'abandoned',
  completed: 'completed',
}

function formatIndianPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '')
  if (digits.length === 10) return `+91${digits}`
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`
  if (digits.length > 10) return `+91${digits.slice(-10)}`
  return digits ? `+91${digits}` : null
}

function buildSessionPatch(body = {}) {
  const event = String(body.event || '').trim()
  const funnelStage = EVENT_TO_STAGE[event] || body.funnelStage || 'started'

  return {
    sessionId: body.sessionId,
    shop: body.shop,
    checkoutVariant: body.checkoutVariant,
    lastStep: body.lastStep,
    funnelStage,
    customerPhone: body.customer?.phone ? formatIndianPhone(body.customer.phone) : undefined,
    customerEmail: body.customer?.email,
    customerName: body.customer?.name,
    paymentMethod: body.paymentMethod,
    delivery: normalizeDelivery(body.delivery),
    cartSnapshot: body.cartSnapshot,
    completedOrderId: body.completedOrderId,
    completedOrderName: body.completedOrderName,
  }
}

function parseRangeDays(range) {
  if (range === '30d') return 30
  if (range === '90d') return 90
  if (range === 'all') return null
  return 7
}

function getRangeStart(range) {
  const days = parseRangeDays(range)
  if (!days) return null
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - (days - 1))
  return start
}

function buildDropOffRate(current, next) {
  if (!current) return 0
  return Math.round(((current - next) / current) * 100)
}

function buildFunnelSummary(counts) {
  const steps = [
    { key: 'started', label: 'Checkout opened', count: counts.started },
    { key: 'phone_captured', label: 'Phone entered', count: counts.phone_captured },
    { key: 'contact_completed', label: 'Contact completed', count: counts.contact_completed },
    { key: 'address_completed', label: 'Address completed', count: counts.address_completed },
    { key: 'payment_viewed', label: 'Payment viewed', count: counts.payment_viewed },
    { key: 'completed', label: 'Order completed', count: counts.completed },
  ]

  return steps.map((step, index) => {
    const prev = index > 0 ? steps[index - 1].count : step.count
    const conversionFromPrevious = prev > 0 ? Math.round((step.count / prev) * 100) : 0
    const dropOffFromPrevious = index > 0 ? buildDropOffRate(prev, step.count) : 0
    const overallConversion = counts.started > 0
      ? Math.round((step.count / counts.started) * 100)
      : 0

    return {
      ...step,
      conversionFromPrevious,
      dropOffFromPrevious,
      overallConversion,
    }
  })
}

const { serializeCartSnapshot } = require('./cartSnapshot')

function serializeDropOffLead(session) {
  const peakStage = resolvePeakStage(session)
  const isAbandoned = !!(session.abandonedAt || session.funnelStage === 'abandoned')
  const cartSnapshot = serializeCartSnapshot(session.cartSnapshot)
  return {
    id: session.id,
    sessionId: session.sessionId,
    customerPhone: session.customerPhone,
    customerEmail: session.customerEmail,
    customerName: session.customerName,
    cartSnapshot,
    cartValuePaise: cartSnapshot?.totalPrice || 0,
    itemCount: cartSnapshot?.itemCount || 0,
    checkoutVariant: session.checkoutVariant,
    lastStep: session.lastStep || 1,
    funnelStage: isAbandoned ? 'abandoned' : peakStage,
    peakFunnelStage: peakStage,
    paymentReached: !!session.paymentReached,
    paymentMethodSelected: session.paymentMethodSelected,
    delivery: session.delivery,
    lastActivityAt: session.lastActivityAt,
    createdAt: session.createdAt,
    abandonedAt: session.abandonedAt,
    retargetingReady: !!session.customerPhone && peakStage !== 'completed',
  }
}

function stageLabel(stage) {
  const labels = {
    started: 'Opened checkout',
    phone_captured: 'Phone only',
    contact_completed: 'Contact done',
    address_completed: 'Address done',
    payment_viewed: 'Saw payment',
    abandoned: 'Abandoned',
    completed: 'Converted',
  }
  return labels[stage] || stage
}

module.exports = {
  EVENT_TO_STAGE,
  formatIndianPhone,
  normalizeDelivery,
  mergeDelivery,
  buildSessionPatch,
  parseRangeDays,
  getRangeStart,
  buildFunnelSummary,
  serializeDropOffLead,
  stageLabel,
  STAGE_RANK,
}
