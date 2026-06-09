const CryptoJS = require('crypto-js')
const KEY = process.env.TOKEN_ENCRYPTION_KEY

function encryptToken(token) {
  return CryptoJS.AES.encrypt(token, KEY).toString()
}

function decryptToken(encrypted) {
  const bytes = CryptoJS.AES.decrypt(encrypted, KEY)
  return bytes.toString(CryptoJS.enc.Utf8)
}

module.exports = { encryptToken, decryptToken }
