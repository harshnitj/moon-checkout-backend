require('dotenv').config()
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const { connectDb } = require('./lib/db')

const authRoutes = require('./routes/auth')
const orderRoutes = require('./routes/orders')
const paymentRoutes = require('./routes/payments')
const dashboardRoutes = require('./routes/dashboard')
const checkoutConfigRoutes = require('./routes/checkoutConfig')
const checkoutFunnelRoutes = require('./routes/checkoutFunnel')
const marketingRoutes = require('./routes/marketing')

const app = express()
const PORT = process.env.PORT || 3000

app.use(helmet())
app.use(cors())
app.use(express.json())

app.get('/health', (req, res) => res.json({ status: 'ok', app: 'moon-checkout-backend' }))

app.use('/auth', authRoutes)
app.use('/api/orders', orderRoutes)
app.use('/api/payments', paymentRoutes)
app.use('/api/dashboard', dashboardRoutes)
app.use('/api/checkout/config', checkoutConfigRoutes)
app.use('/api/checkout/funnel', checkoutFunnelRoutes)
app.use('/api/marketing', marketingRoutes)

connectDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🌙 Moon Checkout backend running on http://localhost:${PORT}`)
    })
  })
  .catch((err) => {
    console.error('Failed to connect to database:', err)
    process.exit(1)
  })
