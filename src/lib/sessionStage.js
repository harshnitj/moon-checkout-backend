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

function normalizeStage(stage) {
  return FUNNEL_STAGES.includes(stage) ? stage : 'started'
}

function hasAddressData(delivery = {}) {
  return !!(
    delivery.pincode
    || delivery.city
    || delivery.street
    || delivery.houseNumber
    || (delivery.city && delivery.state)
  )
}

function resolvePeakStage(session = {}) {
  const storedStage = normalizeStage(session.funnelStage)

  if (storedStage !== 'abandoned') return storedStage

  const variant = session.checkoutVariant || 'single-page'
  const lastStep = session.lastStep || 1
  const delivery = session.delivery || {}

  if (variant === 'three-step') {
    if (lastStep >= 3 || session.paymentReached) return 'payment_viewed'
    if (lastStep >= 2) return hasAddressData(delivery) ? 'address_completed' : 'contact_completed'
    if (session.customerPhone && (session.customerEmail || session.customerName)) return 'contact_completed'
    if (session.customerPhone) return 'phone_captured'
    return 'started'
  }

  if (session.paymentReached) return 'payment_viewed'
  if (hasAddressData(delivery)) return 'address_completed'
  if (session.customerPhone && (session.customerEmail || session.customerName)) return 'contact_completed'
  if (session.customerPhone) return 'phone_captured'
  return 'started'
}

function shouldUpgradeStage(currentStage, nextStage) {
  if (nextStage === 'completed') return true
  if (nextStage === 'abandoned') return false
  if (currentStage === 'completed') return false
  return (STAGE_RANK[nextStage] ?? 0) > (STAGE_RANK[currentStage] ?? 0)
}

module.exports = {
  FUNNEL_STAGES,
  STAGE_RANK,
  normalizeStage,
  hasAddressData,
  resolvePeakStage,
  shouldUpgradeStage,
}
