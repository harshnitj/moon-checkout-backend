function parseCodChargeRulesRaw(settings) {
  const raw = settings?.codChargeRules
  if (!raw) return []

  try {
    const rules = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!Array.isArray(rules)) return []
    return rules
      .map((rule) => ({
        id: rule.id,
        minCartPaise: Number(rule.minCartPaise) || 0,
        maxCartPaise: rule.maxCartPaise == null ? null : Number(rule.maxCartPaise),
        chargePaise: Number(rule.chargePaise) || 0,
      }))
      .sort((a, b) => a.minCartPaise - b.minCartPaise)
  } catch {
    return []
  }
}

function getCodChargeForCart(cartValuePaise, settings) {
  if (!settings?.codChargeEnabled) return 0
  const rules = parseCodChargeRulesRaw(settings)
  const value = Number(cartValuePaise) || 0

  for (const rule of rules) {
    const withinMin = value >= rule.minCartPaise
    const withinMax = rule.maxCartPaise == null || value <= rule.maxCartPaise
    if (withinMin && withinMax) {
      return rule.chargePaise
    }
  }

  return 0
}

function serializeCodChargeRules(settings) {
  return parseCodChargeRulesRaw(settings)
}

function normalizeCodChargeRules(rules) {
  if (!Array.isArray(rules)) return []

  return rules
    .map((rule, index) => ({
      id: rule.id || `rule-${index + 1}`,
      minCartPaise: Math.max(Number(rule.minCartPaise) || 0, 0),
      maxCartPaise: rule.maxCartPaise == null || rule.maxCartPaise === ''
        ? null
        : Math.max(Number(rule.maxCartPaise) || 0, 0),
      chargePaise: Math.max(Number(rule.chargePaise) || 0, 0),
    }))
    .filter((rule) => rule.chargePaise > 0)
    .sort((a, b) => a.minCartPaise - b.minCartPaise)
}

module.exports = {
  parseCodChargeRulesRaw,
  getCodChargeForCart,
  serializeCodChargeRules,
  normalizeCodChargeRules,
}
