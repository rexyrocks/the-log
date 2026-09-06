import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import express from 'express'
import cors from 'cors'
import Database from 'better-sqlite3'

const PORT = Number(process.env.PORT || 3000)
const DATABASE_PATH = process.env.DATABASE_PATH || './data/fieldnotes.db'
const ACCESS_PIN = process.env.ACCESS_PIN
const PHASES = new Set(['scoping', 'wbgt-utci', 'ml-model', 'backend-postgis', 'dashboard', 'alert-api', 'integration'])

const databaseDirectory = path.dirname(DATABASE_PATH)
if (databaseDirectory && databaseDirectory !== '.') fs.mkdirSync(databaseDirectory, { recursive: true })

const db = new Database(DATABASE_PATH)
db.pragma('journal_mode = WAL')
db.exec(`
  CREATE TABLE IF NOT EXISTS findings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phase TEXT NOT NULL CHECK (phase IN ('scoping', 'wbgt-utci', 'ml-model', 'backend-postgis', 'dashboard', 'alert-api', 'integration')),
    contributor TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    tags TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    lane TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT ''
  );
`)

const app = express()
app.use(cors({
  origin(origin, callback) {
    const allowedOrigins = (process.env.FRONTEND_URL || '').split(',').map((value) => value.trim()).filter(Boolean)
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) return callback(null, true)
    return callback(new Error('CORS origin is not allowed'))
  },
}))
app.use(express.json({ limit: '100kb' }))

// Authentication Middleware
app.use((request, response, next) => {
  if (!ACCESS_PIN) return next() // If no pin is configured on the backend, skip auth
  if (request.path === '/health') return next()
  
  const providedPin = request.headers['x-access-pin']
  if (providedPin === ACCESS_PIN) return next()
  
  return response.status(401).json({ error: 'Unauthorized: Invalid PIN' })
})

const findingRow = (row) => ({ ...row, tags: JSON.parse(row.tags || '[]') })
const roleRow = (row) => ({ ...row })
const text = (value) => typeof value === 'string' ? value.trim() : ''
const tagsJson = (tags) => JSON.stringify(Array.isArray(tags) ? tags.map(text).filter(Boolean) : text(tags).split(',').map((tag) => tag.trim()).filter(Boolean))

app.get('/health', (_request, response) => response.json({ ok: true }))

app.get('/api/findings', (request, response) => {
  const phase = text(request.query.phase)
  if (phase && !PHASES.has(phase)) return response.status(400).json({ error: `Invalid phase. Expected one of: ${[...PHASES].join(', ')}` })
  const rows = phase
    ? db.prepare('SELECT id, phase, contributor, title, body, tags, created_at FROM findings WHERE phase = ? ORDER BY datetime(created_at) DESC, id DESC').all(phase)
    : db.prepare('SELECT id, phase, contributor, title, body, tags, created_at FROM findings ORDER BY datetime(created_at) DESC, id DESC').all()
  return response.json(rows.map(findingRow))
})

app.post('/api/findings', (request, response) => {
  const phase = text(request.body?.phase)
  const contributor = text(request.body?.contributor)
  const title = text(request.body?.title)
  const body = text(request.body?.body)
  if (!PHASES.has(phase)) return response.status(400).json({ error: 'phase must be a valid project phase slug' })
  if (!contributor || !title || !body) return response.status(400).json({ error: 'contributor, title, and body are required' })
  const result = db.prepare('INSERT INTO findings (phase, contributor, title, body, tags) VALUES (?, ?, ?, ?, ?)').run(phase, contributor, title, body, tagsJson(request.body?.tags))
  const finding = db.prepare('SELECT id, phase, contributor, title, body, tags, created_at FROM findings WHERE id = ?').get(result.lastInsertRowid)
  return response.status(201).json(findingRow(finding))
})

app.delete('/api/findings/:id', (request, response) => {
  const id = Number(request.params.id)
  const currentUser = text(request.headers['x-current-user'])
  
  if (!id) return response.status(400).json({ error: 'id is required' })
  if (!currentUser) return response.status(400).json({ error: 'x-current-user header is required' })

  const finding = db.prepare('SELECT * FROM findings WHERE id = ?').get(id)
  if (!finding) return response.status(404).json({ error: 'finding not found' })

  const userRole = db.prepare('SELECT lane FROM roles WHERE name = ?').get(currentUser)
  const isAdmin = userRole && userRole.lane.toLowerCase().includes('admin')

  if (finding.contributor !== currentUser && !isAdmin) {
    return response.status(403).json({ error: 'Forbidden: You can only delete your own findings unless you are an admin' })
  }

  db.prepare('DELETE FROM findings WHERE id = ?').run(id)
  return response.status(200).json({ success: true })
})

app.get('/api/roles', (_request, response) => {
  const roles = db.prepare('SELECT id, name, lane, description FROM roles ORDER BY id ASC').all()
  return response.json(roles.map(roleRow))
})

app.post('/api/roles', (request, response) => {
  const currentUser = text(request.headers['x-current-user'])
  const rolesCount = db.prepare('SELECT COUNT(*) as count FROM roles').get().count
  
  if (rolesCount > 0) {
    if (!currentUser) return response.status(403).json({ error: 'Must select a user profile to add roles' })
    const userRole = db.prepare('SELECT lane FROM roles WHERE name = ?').get(currentUser)
    const isAdmin = userRole && userRole.lane.toLowerCase().includes('admin')
    if (!isAdmin) {
       return response.status(403).json({ error: 'Only admins can add or edit team roles' })
    }
  }

  const id = Number(request.body?.id)
  const name = text(request.body?.name)
  const lane = text(request.body?.lane)
  const description = text(request.body?.description)
  if (!name || !lane) return response.status(400).json({ error: 'name and lane are required' })
  if (Number.isInteger(id) && id > 0) {
    const result = db.prepare('UPDATE roles SET name = ?, lane = ?, description = ? WHERE id = ?').run(name, lane, description, id)
    if (!result.changes) return response.status(404).json({ error: 'Role not found' })
    return response.json(db.prepare('SELECT id, name, lane, description FROM roles WHERE id = ?').get(id))
  }
  const result = db.prepare('INSERT INTO roles (name, lane, description) VALUES (?, ?, ?)').run(name, lane, description)
  return response.status(201).json(db.prepare('SELECT id, name, lane, description FROM roles WHERE id = ?').get(result.lastInsertRowid))
})

app.put('/api/roles/:id', (request, response) => {
  const id = Number(request.params.id)
  if (!Number.isInteger(id) || id < 1) return response.status(400).json({ error: 'Role id must be a positive integer' })
  const current = db.prepare('SELECT id, name, lane, description FROM roles WHERE id = ?').get(id)
  if (!current) return response.status(404).json({ error: 'Role not found' })
  const name = request.body?.name === undefined ? current.name : text(request.body.name)
  const lane = request.body?.lane === undefined ? current.lane : text(request.body.lane)
  const description = request.body?.description === undefined ? current.description : text(request.body.description)
  if (!name || !lane) return response.status(400).json({ error: 'name and lane are required' })
  db.prepare('UPDATE roles SET name = ?, lane = ?, description = ? WHERE id = ?').run(name, lane, description, id)
  return response.json(db.prepare('SELECT id, name, lane, description FROM roles WHERE id = ?').get(id))
})

app.use((error, _request, response, _next) => {
  if (error.message === 'CORS origin is not allowed') return response.status(403).json({ error: error.message })
  console.error(error)
  return response.status(500).json({ error: 'Internal server error' })
})

app.listen(PORT, () => console.log(`Fieldnotes API listening on port ${PORT}; database: ${DATABASE_PATH}`))
