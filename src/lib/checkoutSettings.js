const { findMerchantByShop } = require('./repositories/merchants')
const {
  findSettingsByMerchantId,
  createSettings,
} = require('./repositories/checkoutSettings')
const { normalizeCodChargeRules, serializeCodChargeRules } = require('./codCharges')

const CHECKOUT_VARIANTS = ['single-page', 'three-step']

const DEFAULT_SETTINGS = {
  checkoutEnabled: true,
  checkoutVariant: 'single-page',
  codEnabled: true,
  onlineEnabled: true,
  advanceEnabled: true,
  codMinCartPaise: 0,
  codMaxCartPaise: null,
  codChargeEnabled: false,
  codChargeRules: [],
  onlineDiscountPercent: 10,
  onlineDiscountMaxPaise: 15000,
  advanceDiscountPercent: 5,
  advanceDiscountMaxPaise: 10000,
  advanceAmountPaise: 9900,
  codLabel: 'Pay COD (Cash on Delivery)',
  onlineLabel: 'Pay Online',
  advanceLabel: 'Partial COD',
  onlineBadge: '10% off up to ₹150',
  advanceBadge: '5% off up to ₹100',
  emailEnabled: true,
  emailRequired: true,
  nameMinLength: 2,
  nameMaxLength: 50,
  phoneLength: 10,
  phoneStartDigits: '6789',
  houseNumberEnabled: true,
  houseNumberRequired: true,
  houseNumberLabel: 'House / Flat No.',
  houseNumberMaxLength: 30,
  streetEnabled: true,
  streetRequired: true,
  streetLabel: 'Street / Area',
  streetMaxLength: 120,
  landmarkEnabled: true,
  landmarkRequired: false,
  landmarkLabel: 'Nearest Landmark',
  landmarkMaxLength: 100,
}

const SETTINGS_FIELDS = Object.keys(DEFAULT_SETTINGS)

async function ensureCheckoutSettings(merchantId) {
  const existing = await findSettingsByMerchantId(merchantId)
  if (existing) return existing

  return createSettings(merchantId, DEFAULT_SETTINGS)
}

async function getSettingsForShop(shop) {
  const merchant = await findMerchantByShop(shop)
  if (!merchant) return null

  const settings = await ensureCheckoutSettings(merchant.id)
  return { merchant, settings }
}

function serializeSettings(settings) {
  return {
    checkoutEnabled: settings.checkoutEnabled,
    checkoutVariant: CHECKOUT_VARIANTS.includes(settings.checkoutVariant)
      ? settings.checkoutVariant
      : 'single-page',
    codEnabled: settings.codEnabled,
    onlineEnabled: settings.onlineEnabled,
    advanceEnabled: settings.advanceEnabled,
    codMinCartPaise: settings.codMinCartPaise,
    codMaxCartPaise: settings.codMaxCartPaise,
    codChargeEnabled: settings.codChargeEnabled,
    codChargeRules: serializeCodChargeRules(settings),
    onlineDiscountPercent: settings.onlineDiscountPercent,
    onlineDiscountMaxPaise: settings.onlineDiscountMaxPaise,
    advanceDiscountPercent: settings.advanceDiscountPercent,
    advanceDiscountMaxPaise: settings.advanceDiscountMaxPaise,
    advanceAmountPaise: settings.advanceAmountPaise,
    codLabel: settings.codLabel,
    onlineLabel: settings.onlineLabel,
    advanceLabel: settings.advanceLabel,
    onlineBadge: settings.onlineBadge,
    advanceBadge: settings.advanceBadge,
    emailEnabled: settings.emailEnabled,
    emailRequired: settings.emailRequired,
    nameMinLength: settings.nameMinLength,
    nameMaxLength: settings.nameMaxLength,
    phoneLength: settings.phoneLength,
    phoneStartDigits: settings.phoneStartDigits,
    houseNumberEnabled: settings.houseNumberEnabled,
    houseNumberRequired: settings.houseNumberRequired,
    houseNumberLabel: settings.houseNumberLabel,
    houseNumberMaxLength: settings.houseNumberMaxLength,
    streetEnabled: settings.streetEnabled,
    streetRequired: settings.streetRequired,
    streetLabel: settings.streetLabel,
    streetMaxLength: settings.streetMaxLength,
    landmarkEnabled: settings.landmarkEnabled,
    landmarkRequired: settings.landmarkRequired,
    landmarkLabel: settings.landmarkLabel,
    landmarkMaxLength: settings.landmarkMaxLength,
    updatedAt: settings.updatedAt,
  }
}

function pickSettingsUpdate(body) {
  const update = {}
  for (const field of SETTINGS_FIELDS) {
    if (field === 'codChargeRules') continue
    if (body[field] === undefined) continue
    if (field === 'checkoutVariant') {
      update[field] = CHECKOUT_VARIANTS.includes(body[field]) ? body[field] : 'single-page'
      continue
    }
    update[field] = body[field]
  }
  if (body.codChargeRules !== undefined) {
    update.codChargeRules = normalizeCodChargeRules(body.codChargeRules)
  }
  return update
}

function isPaymentMethodAllowed(settings, paymentMethod, cartTotalPaise = 0) {
  if (!settings.checkoutEnabled) {
    return { allowed: false, reason: 'Checkout is currently disabled for this store.' }
  }

  if (paymentMethod === 'cod') {
    if (!settings.codEnabled) return { allowed: false, reason: 'COD is not available for this order.' }
    if (cartTotalPaise < settings.codMinCartPaise) {
      return { allowed: false, reason: `COD is available for orders of ₹${settings.codMinCartPaise / 100} or more.` }
    }
    if (settings.codMaxCartPaise != null && cartTotalPaise > settings.codMaxCartPaise) {
      return { allowed: false, reason: `COD is not available for orders above ₹${settings.codMaxCartPaise / 100}.` }
    }
  }

  if (paymentMethod === 'online' && !settings.onlineEnabled) {
    return { allowed: false, reason: 'Online payment is not available.' }
  }

  if (paymentMethod === 'advance' && !settings.advanceEnabled) {
    return { allowed: false, reason: 'Partial COD is not available for this order.' }
  }

  return { allowed: true }
}

module.exports = {
  DEFAULT_SETTINGS,
  SETTINGS_FIELDS,
  ensureCheckoutSettings,
  getSettingsForShop,
  serializeSettings,
  pickSettingsUpdate,
  isPaymentMethodAllowed,
}
