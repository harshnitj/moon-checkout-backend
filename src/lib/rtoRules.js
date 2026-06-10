const { getValidAccessToken } = require('./shopifyTokens')

const PAYMENT_METHODS = ['cod', 'online', 'advance']

const DEFAULT_RTO_SETTINGS = {
  rtoEngineEnabled: false,
  rtoDefaultBlockMessage: 'This payment method is not available for your order.',
  rtoMitigationPincodeEnabled: false,
  rtoBlockedPincodes: [],
  rtoPincodeBlockCod: true,
  rtoPincodeBlockAdvance: true,
  rtoPincodeBlockOnline: false,
  rtoMitigationPhoneEnabled: false,
  rtoBlockedPhonePrefixes: [],
  rtoPhoneBlockCod: true,
  rtoPhoneBlockAdvance: false,
  rtoPhoneBlockOnline: false,
  rtoMitigationProductEnabled: false,
  rtoBlockedProductIds: [],
  rtoProductBlockCod: true,
  rtoProductBlockAdvance: true,
  rtoProductBlockOnline: false,
  rtoMitigationCollectionEnabled: false,
  rtoBlockedCollectionIds: [],
  rtoCollectionProductIds: [],
  rtoCollectionBlockCod: true,
  rtoCollectionBlockAdvance: true,
  rtoCollectionBlockOnline: false,
  rtoMitigationStateEnabled: false,
  rtoBlockedStates: [],
  rtoStateBlockCod: true,
  rtoStateBlockAdvance: false,
  rtoStateBlockOnline: false,
  rtoRules: [],
}

function parseStringList(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) {
    return raw.map((value) => String(value || '').trim()).filter(Boolean)
  }
  if (typeof raw === 'string') {
    return raw
      .split(/[\n,]+/)
      .map((value) => value.trim())
      .filter(Boolean)
  }
  return []
}

function parseIdList(raw) {
  return parseStringList(raw)
    .map((value) => Number(String(value).replace(/\D/g, '')))
    .filter((value) => Number.isFinite(value) && value > 0)
}

function parsePincodeList(raw) {
  return parseStringList(raw)
    .map((value) => String(value).replace(/\D/g, '').slice(0, 6))
    .filter((value) => value.length === 6)
}

function normalizePhoneDigits(phone) {
  const digits = String(phone || '').replace(/\D/g, '')
  if (digits.length >= 10) return digits.slice(-10)
  return digits
}

function normalizeState(state) {
  return String(state || '').trim().toLowerCase()
}

function normalizeRuleActions(rule = {}) {
  return {
    blockCod: rule.blockCod !== false,
    blockAdvance: !!rule.blockAdvance,
    blockOnline: !!rule.blockOnline,
    blockCheckout: !!rule.blockCheckout,
    message: String(rule.message || '').trim(),
  }
}

function normalizeRtoRule(rule, index) {
  const actions = normalizeRuleActions(rule)
  return {
    id: rule.id || `rto-rule-${index + 1}`,
    name: String(rule.name || `Rule ${index + 1}`).trim(),
    enabled: rule.enabled !== false,
    matchMode: rule.matchMode === 'all' ? 'all' : 'any',
    pincodes: parsePincodeList(rule.pincodes),
    phonePrefixes: parseStringList(rule.phonePrefixes),
    productIds: parseIdList(rule.productIds),
    collectionIds: parseIdList(rule.collectionIds),
    states: parseStringList(rule.states).map(normalizeState),
    minCartPaise: rule.minCartPaise == null || rule.minCartPaise === ''
      ? null
      : Math.max(Number(rule.minCartPaise) || 0, 0),
    maxCartPaise: rule.maxCartPaise == null || rule.maxCartPaise === ''
      ? null
      : Math.max(Number(rule.maxCartPaise) || 0, 0),
    ...actions,
  }
}

function normalizeRtoRules(rules) {
  if (!Array.isArray(rules)) return []
  return rules.map((rule, index) => normalizeRtoRule(rule, index))
}

function parseRtoRulesRaw(settings) {
  const raw = settings?.rtoRules
  if (!raw) return []
  try {
    const rules = typeof raw === 'string' ? JSON.parse(raw) : raw
    return Array.isArray(rules) ? normalizeRtoRules(rules) : []
  } catch {
    return []
  }
}

function serializeRtoRules(settings) {
  return parseRtoRulesRaw(settings)
}

function pickRtoUpdates(body) {
  const update = {}
  const fields = [
    'rtoEngineEnabled',
    'rtoDefaultBlockMessage',
    'rtoMitigationPincodeEnabled',
    'rtoPincodeBlockCod',
    'rtoPincodeBlockAdvance',
    'rtoPincodeBlockOnline',
    'rtoMitigationPhoneEnabled',
    'rtoPhoneBlockCod',
    'rtoPhoneBlockAdvance',
    'rtoPhoneBlockOnline',
    'rtoMitigationProductEnabled',
    'rtoProductBlockCod',
    'rtoProductBlockAdvance',
    'rtoProductBlockOnline',
    'rtoMitigationCollectionEnabled',
    'rtoCollectionBlockCod',
    'rtoCollectionBlockAdvance',
    'rtoCollectionBlockOnline',
    'rtoMitigationStateEnabled',
    'rtoStateBlockCod',
    'rtoStateBlockAdvance',
    'rtoStateBlockOnline',
  ]

  for (const field of fields) {
    if (body[field] !== undefined) update[field] = body[field]
  }

  if (body.rtoBlockedPincodes !== undefined) {
    update.rtoBlockedPincodes = parsePincodeList(body.rtoBlockedPincodes)
  }
  if (body.rtoBlockedPhonePrefixes !== undefined) {
    update.rtoBlockedPhonePrefixes = parseStringList(body.rtoBlockedPhonePrefixes)
  }
  if (body.rtoBlockedProductIds !== undefined) {
    update.rtoBlockedProductIds = parseIdList(body.rtoBlockedProductIds)
  }
  if (body.rtoBlockedCollectionIds !== undefined) {
    update.rtoBlockedCollectionIds = parseIdList(body.rtoBlockedCollectionIds)
  }
  if (body.rtoBlockedStates !== undefined) {
    update.rtoBlockedStates = parseStringList(body.rtoBlockedStates).map(normalizeState)
  }
  if (body.rtoRules !== undefined) {
    update.rtoRules = normalizeRtoRules(body.rtoRules)
  }

  return update
}

function serializeRtoSettings(settings) {
  return {
    rtoEngineEnabled: !!settings.rtoEngineEnabled,
    rtoDefaultBlockMessage: settings.rtoDefaultBlockMessage || DEFAULT_RTO_SETTINGS.rtoDefaultBlockMessage,
    rtoMitigationPincodeEnabled: !!settings.rtoMitigationPincodeEnabled,
    rtoBlockedPincodes: parsePincodeList(settings.rtoBlockedPincodes),
    rtoPincodeBlockCod: settings.rtoPincodeBlockCod !== false,
    rtoPincodeBlockAdvance: settings.rtoPincodeBlockAdvance !== false,
    rtoPincodeBlockOnline: !!settings.rtoPincodeBlockOnline,
    rtoMitigationPhoneEnabled: !!settings.rtoMitigationPhoneEnabled,
    rtoBlockedPhonePrefixes: parseStringList(settings.rtoBlockedPhonePrefixes),
    rtoPhoneBlockCod: settings.rtoPhoneBlockCod !== false,
    rtoPhoneBlockAdvance: !!settings.rtoPhoneBlockAdvance,
    rtoPhoneBlockOnline: !!settings.rtoPhoneBlockOnline,
    rtoMitigationProductEnabled: !!settings.rtoMitigationProductEnabled,
    rtoBlockedProductIds: parseIdList(settings.rtoBlockedProductIds),
    rtoProductBlockCod: settings.rtoProductBlockCod !== false,
    rtoProductBlockAdvance: settings.rtoProductBlockAdvance !== false,
    rtoProductBlockOnline: !!settings.rtoProductBlockOnline,
    rtoMitigationCollectionEnabled: !!settings.rtoMitigationCollectionEnabled,
    rtoBlockedCollectionIds: parseIdList(settings.rtoBlockedCollectionIds),
    rtoCollectionProductIds: parseIdList(settings.rtoCollectionProductIds),
    rtoCollectionBlockCod: settings.rtoCollectionBlockCod !== false,
    rtoCollectionBlockAdvance: settings.rtoCollectionBlockAdvance !== false,
    rtoCollectionBlockOnline: !!settings.rtoCollectionBlockOnline,
    rtoMitigationStateEnabled: !!settings.rtoMitigationStateEnabled,
    rtoBlockedStates: parseStringList(settings.rtoBlockedStates).map(normalizeState),
    rtoStateBlockCod: settings.rtoStateBlockCod !== false,
    rtoStateBlockAdvance: !!settings.rtoStateBlockAdvance,
    rtoStateBlockOnline: !!settings.rtoStateBlockOnline,
    rtoRules: serializeRtoRules(settings),
  }
}

function buildRtoContext(input = {}) {
  const cartItems = Array.isArray(input.lineItems)
    ? input.lineItems
    : (input.cartData?.items || [])

  const productIds = cartItems
    .map((item) => Number(item.productId || item.product_id))
    .filter((value) => Number.isFinite(value) && value > 0)

  const pincode = String(input.pincode || input.zip || '').replace(/\D/g, '').slice(0, 6)
  const phone = normalizePhoneDigits(input.phone)
  const state = normalizeState(input.state || input.province)

  return {
    cartTotalPaise: Number(input.cartTotalPaise ?? input.cartData?.totalPrice) || 0,
    productIds,
    pincode,
    phone,
    state,
  }
}

function matchesPhonePrefix(phone, prefixes) {
  if (!phone || !prefixes.length) return false
  return prefixes.some((prefix) => phone.startsWith(String(prefix).replace(/\D/g, '')))
}

function matchesProductIds(cartProductIds, blockedIds) {
  if (!blockedIds.length || !cartProductIds.length) return false
  const blocked = new Set(blockedIds)
  return cartProductIds.some((id) => blocked.has(id))
}

function applyMethodBlocks(result, actions, defaultMessage) {
  if (actions.blockCheckout) {
    result.blockCheckout = true
    PAYMENT_METHODS.forEach((method) => {
      result.blockedMethods.add(method)
    })
  }
  if (actions.blockCod) result.blockedMethods.add('cod')
  if (actions.blockAdvance) result.blockedMethods.add('advance')
  if (actions.blockOnline) result.blockedMethods.add('online')

  const message = actions.message || defaultMessage
  if (message) result.messages.push(message)
}

function evaluateGlobalMitigations(settings, context) {
  const result = {
    blockedMethods: new Set(),
    blockCheckout: false,
    messages: [],
  }
  const defaultMessage = settings.rtoDefaultBlockMessage || DEFAULT_RTO_SETTINGS.rtoDefaultBlockMessage

  if (settings.rtoMitigationPincodeEnabled && context.pincode) {
    const pincodes = parsePincodeList(settings.rtoBlockedPincodes)
    if (pincodes.includes(context.pincode)) {
      applyMethodBlocks(result, {
        blockCod: settings.rtoPincodeBlockCod !== false,
        blockAdvance: settings.rtoPincodeBlockAdvance !== false,
        blockOnline: !!settings.rtoPincodeBlockOnline,
        blockCheckout: false,
        message: '',
      }, defaultMessage)
    }
  }

  if (settings.rtoMitigationPhoneEnabled && context.phone) {
    const prefixes = parseStringList(settings.rtoBlockedPhonePrefixes)
    if (matchesPhonePrefix(context.phone, prefixes)) {
      applyMethodBlocks(result, {
        blockCod: settings.rtoPhoneBlockCod !== false,
        blockAdvance: !!settings.rtoPhoneBlockAdvance,
        blockOnline: !!settings.rtoPhoneBlockOnline,
        blockCheckout: false,
        message: '',
      }, defaultMessage)
    }
  }

  if (settings.rtoMitigationProductEnabled) {
    const productIds = parseIdList(settings.rtoBlockedProductIds)
    if (matchesProductIds(context.productIds, productIds)) {
      applyMethodBlocks(result, {
        blockCod: settings.rtoProductBlockCod !== false,
        blockAdvance: settings.rtoProductBlockAdvance !== false,
        blockOnline: !!settings.rtoProductBlockOnline,
        blockCheckout: false,
        message: '',
      }, defaultMessage)
    }
  }

  if (settings.rtoMitigationCollectionEnabled) {
    const collectionProductIds = parseIdList(settings.rtoCollectionProductIds)
    if (matchesProductIds(context.productIds, collectionProductIds)) {
      applyMethodBlocks(result, {
        blockCod: settings.rtoCollectionBlockCod !== false,
        blockAdvance: settings.rtoCollectionBlockAdvance !== false,
        blockOnline: !!settings.rtoCollectionBlockOnline,
        blockCheckout: false,
        message: '',
      }, defaultMessage)
    }
  }

  if (settings.rtoMitigationStateEnabled && context.state) {
    const states = parseStringList(settings.rtoBlockedStates).map(normalizeState)
    if (states.includes(context.state)) {
      applyMethodBlocks(result, {
        blockCod: settings.rtoStateBlockCod !== false,
        blockAdvance: !!settings.rtoStateBlockAdvance,
        blockOnline: !!settings.rtoStateBlockOnline,
        blockCheckout: false,
        message: '',
      }, defaultMessage)
    }
  }

  return result
}

function ruleConditionMatches(rule, context, collectionProductIds) {
  const checks = []

  if (rule.pincodes.length) {
    checks.push(context.pincode && rule.pincodes.includes(context.pincode))
  }
  if (rule.phonePrefixes.length) {
    checks.push(matchesPhonePrefix(context.phone, rule.phonePrefixes))
  }
  if (rule.productIds.length) {
    checks.push(matchesProductIds(context.productIds, rule.productIds))
  }
  if (rule.collectionIds.length && collectionProductIds.length) {
    checks.push(matchesProductIds(context.productIds, collectionProductIds))
  }
  if (rule.states.length) {
    checks.push(context.state && rule.states.includes(context.state))
  }
  if (rule.minCartPaise != null) {
    checks.push(context.cartTotalPaise >= rule.minCartPaise)
  }
  if (rule.maxCartPaise != null) {
    checks.push(context.cartTotalPaise <= rule.maxCartPaise)
  }

  if (!checks.length) return false
  return rule.matchMode === 'all' ? checks.every(Boolean) : checks.some(Boolean)
}

function evaluateAdvancedRules(settings, context) {
  const result = {
    blockedMethods: new Set(),
    blockCheckout: false,
    messages: [],
  }
  const defaultMessage = settings.rtoDefaultBlockMessage || DEFAULT_RTO_SETTINGS.rtoDefaultBlockMessage
  const collectionProductIds = parseIdList(settings.rtoCollectionProductIds)
  const rules = parseRtoRulesRaw(settings).filter((rule) => rule.enabled)

  for (const rule of rules) {
    if (!ruleConditionMatches(rule, context, collectionProductIds)) continue
    applyMethodBlocks(result, rule, defaultMessage)
  }

  return result
}

function mergeRtoResults(...results) {
  const merged = {
    blockedMethods: new Set(),
    blockCheckout: false,
    messages: [],
  }

  for (const result of results) {
    result.blockedMethods.forEach((method) => merged.blockedMethods.add(method))
    merged.blockCheckout = merged.blockCheckout || result.blockCheckout
    merged.messages.push(...result.messages.filter(Boolean))
  }

  return merged
}

function evaluateRto(settings, context = {}) {
  if (!settings?.rtoEngineEnabled) {
    return {
      blockedMethods: [],
      blockCheckout: false,
      messages: [],
      reason: null,
    }
  }

  const normalizedContext = buildRtoContext(context)
  const evaluation = mergeRtoResults(
    evaluateGlobalMitigations(settings, normalizedContext),
    evaluateAdvancedRules(settings, normalizedContext),
  )

  const uniqueMessages = [...new Set(evaluation.messages)]
  const defaultMessage = settings.rtoDefaultBlockMessage || DEFAULT_RTO_SETTINGS.rtoDefaultBlockMessage

  return {
    blockedMethods: [...evaluation.blockedMethods],
    blockCheckout: evaluation.blockCheckout,
    messages: uniqueMessages,
    reason: uniqueMessages[0] || defaultMessage,
  }
}

function getRtoPaymentBlockReason(settings, paymentMethod, context = {}) {
  const evaluation = evaluateRto(settings, context)
  if (evaluation.blockCheckout) {
    return evaluation.reason || settings.rtoDefaultBlockMessage
  }
  if (evaluation.blockedMethods.includes(paymentMethod)) {
    return evaluation.reason || settings.rtoDefaultBlockMessage
  }
  return null
}

function collectCollectionIdsFromSettings(settings = {}) {
  const ids = new Set(parseIdList(settings.rtoBlockedCollectionIds))
  for (const rule of parseRtoRulesRaw(settings)) {
    for (const id of rule.collectionIds) ids.add(id)
  }
  return [...ids]
}

async function shopifyAdminFetch(shop, accessToken, path) {
  const response = await fetch(`https://${shop}/admin/api/2024-01${path}`, {
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
    },
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Shopify request failed (${response.status}): ${text}`)
  }
  return response.json()
}

async function fetchCollectionProductIds(shop, accessToken, collectionId) {
  const productIds = new Set()
  let pageInfo = null

  do {
    const query = pageInfo
      ? pageInfo
      : `/collections/${collectionId}/products.json?limit=250&fields=id`
    const data = await shopifyAdminFetch(shop, accessToken, query)
    for (const product of data.products || []) {
      if (product?.id) productIds.add(Number(product.id))
    }
    pageInfo = null
  } while (pageInfo)

  return [...productIds]
}

async function resolveCollectionProductIds(shop, settings = {}) {
  const collectionIds = collectCollectionIdsFromSettings(settings)
  if (!collectionIds.length) return []

  try {
    const accessToken = await getValidAccessToken(shop)
    const productIds = new Set()
    for (const collectionId of collectionIds) {
      const ids = await fetchCollectionProductIds(shop, accessToken, collectionId)
      ids.forEach((id) => productIds.add(id))
    }
    return [...productIds]
  } catch (err) {
    console.error('RTO collection product resolve failed:', err)
    return parseIdList(settings.rtoCollectionProductIds)
  }
}

module.exports = {
  DEFAULT_RTO_SETTINGS,
  PAYMENT_METHODS,
  parsePincodeList,
  parseStringList,
  parseIdList,
  normalizeRtoRules,
  serializeRtoRules,
  serializeRtoSettings,
  pickRtoUpdates,
  buildRtoContext,
  evaluateRto,
  getRtoPaymentBlockReason,
  collectCollectionIdsFromSettings,
  resolveCollectionProductIds,
}
