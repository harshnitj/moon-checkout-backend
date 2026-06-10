function normalizeDelivery(delivery = {}) {
  if (!delivery || typeof delivery !== 'object') return null
  const normalized = {
    name: String(delivery.name || '').trim() || null,
    houseNumber: String(delivery.houseNumber || '').trim() || null,
    street: String(delivery.street || delivery.address1 || '').trim() || null,
    landmark: String(delivery.landmark || delivery.address2 || '').trim() || null,
    pincode: String(delivery.pincode || delivery.zip || '').replace(/\D/g, '').slice(0, 6) || null,
    city: String(delivery.city || '').trim() || null,
    state: String(delivery.state || delivery.province || '').trim() || null,
  }
  return Object.values(normalized).some(Boolean) ? normalized : null
}

function mergeDelivery(existing = null, incoming = null) {
  if (!incoming) return existing || null
  if (!existing) return incoming
  const merged = { ...existing }
  Object.entries(incoming).forEach(([key, value]) => {
    if (value) merged[key] = value
  })
  return Object.values(merged).some(Boolean) ? merged : null
}

module.exports = {
  normalizeDelivery,
  mergeDelivery,
}
