const { MongoClient, ObjectId } = require('mongodb')

let client
let db

async function connectDb() {
  if (db) return db

  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')

  client = new MongoClient(url)
  await client.connect()
  db = client.db()
  return db
}

function getDb() {
  if (!db) throw new Error('Database not connected. Call connectDb() first.')
  return db
}

function toObjectId(id) {
  if (!id) return null
  if (id instanceof ObjectId) return id
  try {
    return new ObjectId(String(id))
  } catch {
    return null
  }
}

function normalizeDoc(doc) {
  if (!doc) return null
  const { _id, ...rest } = doc
  return { id: _id.toString(), ...rest }
}

module.exports = {
  connectDb,
  getDb,
  toObjectId,
  normalizeDoc,
  ObjectId,
}
