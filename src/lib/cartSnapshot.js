function normalizeCartItem(item = {}) {
  return {
    productId: item.productId || item.product_id || null,
    variantId: item.variantId || item.variant_id || null,
    title: item.title || null,
    variantTitle: item.variantTitle || item.variant_title || null,
    quantity: Math.max(Number(item.quantity) || 1, 1),
    price: Math.max(Number(item.price) || 0, 0),
    sku: item.sku || null,
    image: item.image || null,
  }
}

function buildCartSnapshot(cart = {}) {
  const items = Array.isArray(cart.items) ? cart.items : []
  const normalizedItems = items.slice(0, 30).map(normalizeCartItem)

  return {
    itemCount: Number(cart.itemCount) || normalizedItems.reduce((sum, item) => sum + item.quantity, 0),
    totalPrice: Number(cart.totalPrice) || 0,
    currency: cart.currency || 'INR',
    items: normalizedItems,
  }
}

function serializeCartSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return null
  return buildCartSnapshot(snapshot)
}

module.exports = {
  buildCartSnapshot,
  serializeCartSnapshot,
  normalizeCartItem,
}
