const express = require('express')
const router = express.Router()
const { createTransaction } = require('../lib/repositories/checkoutTransactions')
const { getValidAccessToken } = require('../lib/shopifyTokens')
const { getSettingsForShop, isPaymentMethodAllowed } = require('../lib/checkoutSettings')
const { getCodChargeForCart } = require('../lib/codCharges')

const MOON_ORDER_TAG = 'moon-checkout, moon-media'

function formatRupees(paise) {
  return (Number(paise || 0) / 100).toLocaleString('en-IN')
}

function getPaymentNote(paymentMethod, settings, orderTotalPaise = 0, cartSubtotalPaise = 0) {
  const codCharge = getCodChargeForCart(cartSubtotalPaise, settings)
  if (paymentMethod === 'cod') {
    return codCharge > 0
      ? `Cash on Delivery (COD) + ₹${formatRupees(codCharge)} COD charge`
      : 'Cash on Delivery (COD)'
  }
  if (paymentMethod === 'advance') {
    const onlinePaise = settings?.advanceAmountPaise || 9900
    const balancePaise = Math.max(Number(orderTotalPaise) - onlinePaise, 0)
    return `Partial COD (₹${formatRupees(onlinePaise)} online + ₹${formatRupees(balancePaise)} on delivery)`
  }
  return 'Pay Online'
}

function getPaymentNoteAttributes(paymentMethod, settings, orderTotalPaise = 0, cartSubtotalPaise = 0) {
  const note = getPaymentNote(paymentMethod, settings, orderTotalPaise, cartSubtotalPaise)
  const attrs = [
    { name: 'payment_method', value: note },
    { name: 'checkout_source', value: 'Moon Checkout' },
    { name: 'created_by', value: 'Moon Media' },
  ]

  if (paymentMethod === 'advance') {
    const onlinePaise = settings?.advanceAmountPaise || 9900
    const balancePaise = Math.max(Number(orderTotalPaise) - onlinePaise, 0)
    attrs.push(
      { name: 'partial_cod_online_paise', value: String(onlinePaise) },
      { name: 'partial_cod_balance_paise', value: String(balancePaise) },
    )
  }

  if (paymentMethod === 'cod' || paymentMethod === 'advance') {
    const codCharge = getCodChargeForCart(cartSubtotalPaise, settings)
    if (codCharge > 0) {
      attrs.push({ name: 'cod_charge_paise', value: String(codCharge) })
    }
  }

  return attrs
}

function formatIndianPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '')
  if (digits.length === 10) return `+91${digits}`
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`
  if (digits.length > 10) return `+91${digits.slice(-10)}`
  return `+91${digits}`
}

function splitName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean)
  return {
    first_name: parts[0] || fullName || 'Customer',
    last_name: parts.slice(1).join(' '),
  }
}

async function shopifyAdminFetch(shop, accessToken, path, options = {}) {
  const response = await fetch(`https://${shop}/admin/api/2024-01${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
      ...(options.headers || {}),
    },
  })
  return response
}

async function findCustomerByEmail(shop, accessToken, email) {
  const response = await shopifyAdminFetch(
    shop,
    accessToken,
    `/customers/search.json?query=email:${encodeURIComponent(email)}`
  )
  if (!response.ok) return null
  const data = await response.json()
  return data.customers?.[0] || null
}

function buildOrderCustomer(existingCustomer, first_name, last_name, customerEmail) {
  if (existingCustomer) {
    return { id: existingCustomer.id }
  }
  return {
    first_name,
    last_name,
    email: customerEmail,
  }
}

router.post('/create', async (req, res) => {
  const { shop, lineItems, customer, shippingAddress, paymentMethod, orderTotalPaise, cartSubtotalPaise } = req.body

  if (!shop || !lineItems || !customer || !shippingAddress) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  try {
    const storeConfig = await getSettingsForShop(shop)
    if (!storeConfig) {
      return res.status(404).json({ error: 'Merchant not found. App may not be installed.' })
    }

    const { merchant, settings } = storeConfig
    const subtotalForRules = Number(cartSubtotalPaise) || Number(orderTotalPaise) || 0
    const paymentCheck = isPaymentMethodAllowed(settings, paymentMethod, subtotalForRules)
    if (!paymentCheck.allowed) {
      return res.status(400).json({ error: paymentCheck.reason })
    }

    let accessToken
    try {
      accessToken = await getValidAccessToken(shop)
    } catch (tokenErr) {
      console.error('Token error:', tokenErr)
      return res.status(401).json({
        error: 'Shopify access token expired. Please reinstall the app.',
        details: tokenErr.message,
      })
    }
    const formattedPhone = formatIndianPhone(customer.phone)
    const customerEmail = String(customer.email || '').trim().toLowerCase()
    const { first_name, last_name } = splitName(customer.name)
    const existingCustomer = await findCustomerByEmail(shop, accessToken, customerEmail)

    const response = await shopifyAdminFetch(shop, accessToken, '/orders.json', {
      method: 'POST',
      body: JSON.stringify({
        order: {
          line_items: lineItems,
          email: customerEmail,
          tags: MOON_ORDER_TAG,
          note: getPaymentNote(paymentMethod, settings, orderTotalPaise, subtotalForRules),
          note_attributes: getPaymentNoteAttributes(paymentMethod, settings, orderTotalPaise, subtotalForRules),
          source_name: 'moon-checkout',
          customer: buildOrderCustomer(existingCustomer, first_name, last_name, customerEmail),
          shipping_address: {
            first_name,
            last_name,
            address1: shippingAddress.address1,
            address2: shippingAddress.address2 || '',
            city: shippingAddress.city,
            province: shippingAddress.province,
            zip: shippingAddress.zip,
            country: 'India',
            country_code: 'IN',
            phone: formattedPhone,
          },
          billing_address: {
            first_name,
            last_name,
            address1: shippingAddress.address1,
            address2: shippingAddress.address2 || '',
            city: shippingAddress.city,
            province: shippingAddress.province,
            zip: shippingAddress.zip,
            country: 'India',
            country_code: 'IN',
            phone: formattedPhone,
          },
          financial_status: paymentMethod === 'cod' || paymentMethod === 'advance' ? 'pending' : 'paid',
          send_receipt: false,
          send_fulfillment_receipt: false,
        },
      }),
    })

    if (!response.ok) {
      const err = await response.json()
      console.error('Shopify order error:', err)
      return res.status(500).json({ error: 'Failed to create order', details: err })
    }

    const data = await response.json()

    try {
      await createTransaction({
        merchantId: merchant.id,
        shopifyOrderId: String(data.order.id),
        shopifyOrderName: data.order.name,
        customerName: customer.name || null,
        customerEmail: customerEmail,
        customerPhone: formattedPhone,
        paymentMethod: paymentMethod || 'cod',
        amountPaise: Number(orderTotalPaise) || Math.round(Number(data.order.total_price || 0) * 100),
        status: paymentMethod === 'cod' || paymentMethod === 'advance' ? 'pending' : 'paid',
      })
    } catch (txErr) {
      console.error('Transaction log error:', txErr)
    }

    return res.json({ success: true, orderId: data.order.id, orderName: data.order.name })
  } catch (err) {
    console.error('Order creation error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

module.exports = router
