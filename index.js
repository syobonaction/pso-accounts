import 'dotenv/config'
import fs from 'fs'
import { Appservice } from 'matrix-bot-sdk'
import express from 'express'
import session from 'express-session'
import WebSocket from 'ws'
import crypto from 'crypto'
import Database from 'better-sqlite3'
import * as client from 'openid-client'

const config = await client.discovery(
  new URL(process.env.KEYCLOAK_ISSUER),
  process.env.OIDC_CLIENT_ID,
  process.env.OIDC_CLIENT_SECRET
)

const encrypt = (plaintext) => {
  const iv = crypto.randomBytes(16)
  const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex')
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return [iv.toString('hex'), authTag.toString('hex'), encrypted.toString('hex')].join(':')
}

const decrypt = (combined) => {
  const [ivHex, authTagHex, encryptedHex] = combined.split(':')
  const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex')
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'))
  const decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedHex, 'hex')), decipher.final()])
  return decrypted.toString('utf8')
}

const generateCredentials = () => {
  let sn
  do {
    sn = String(crypto.randomInt(1000000000, 4294967295))
  } while (db.prepare('SELECT 1 FROM accounts WHERE serial_number = ?').get(sn))

  const key = String(crypto.randomInt(0, 999999999999)).padStart(12, '0')
  return { sn, key }
}

const appservice = new Appservice({
  port: 8000,
  bindAddress: '0.0.0.0',
  homeserverName: 'matrix.netreality.world',
  homeserverUrl: 'https://matrix.netreality.world',
  registration: {
    id: 'pso-chat-bridge',
    url: 'http://pso-accounts:8000',
    as_token: process.env.MATRIX_AS_TOKEN,
    hs_token: process.env.MATRIX_HS_TOKEN,
    sender_localpart: 'nol',
    rate_limited: false,
    namespaces: {
      users: [{ exclusive: false, regex: '^@nol:matrix\\.netreality\\.world$' }],
      aliases: [],
      rooms: [],
    },
  },
})

const app = appservice.expressAppInstance
app.set('trust proxy', 1)

let db = new Database(process.env.DB_PATH)
db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    keycloak_user_id TEXT PRIMARY KEY,
    username TEXT,
    serial_number TEXT NOT NULL,
    access_key_encrypted TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_serial_number ON accounts(serial_number);
`)

const exportLinks = () => {
  const rows = db.prepare('SELECT serial_number, keycloak_user_id FROM accounts').all()
  const linksObject = rows.reduce((accumulator, row) => {
    accumulator[row.serial_number] = row.keycloak_user_id
    return accumulator
  }, {})
  fs.writeFileSync('/links/accounts.json', JSON.stringify(linksObject))
}

const connectChatSocket = () => {
  const socket = new WebSocket('ws://169.254.1.2:9600/y/events/stream?events=CHAT_MESSAGE', { perMessageDeflate: false })

  socket.on('message', async (data) => {
    const event = JSON.parse(data.toString())
    if (event.EventType !== 'CHAT_MESSAGE') {
      return
    }

    const linked = db.prepare('SELECT username FROM accounts WHERE serial_number = ?').get(String(event.AccountID))
    const label = linked ? `${event.FromName} (${linked.username})` : event.FromName

    try {
      await appservice.botClient.sendText(process.env.MATRIX_ROOM_ID, `${label}: ${event.Text}`)
    } catch (err) {
      console.error('Failed to relay chat to Matrix:', err.message)
    }
  })

  socket.on('error', (err) => {
    console.error('Chat WebSocket error:', err.message)
  })

  socket.on('close', () => {
    console.log('Chat WebSocket closed, reconnecting in 5s...')
    setTimeout(connectChatSocket, 5000)
  })
}

connectChatSocket()

appservice.on('room.message', async (roomId, event) => {
  if (event.content?.msgtype !== 'm.text') return
  if (roomId !== process.env.MATRIX_ROOM_ID) return
  if (event.sender === '@nol:matrix.netreality.world') return

  const MAX_LENGTH = 150
  const senderName = event.sender.split(':')[0].replace('@', '')
  const text = `${senderName}: ${event.content.body}`
  if (text.length > MAX_LENGTH) {
    text = text.slice(0, MAX_LENGTH - 3) + '...'
  }

  try {
    await fetch('http://169.254.1.2:9600/y/relay-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lobby_id: 1, text }),
    })
  } catch (err) {
    console.error('Failed to relay Matrix message to PSO:', err.message)
  }
})

app.use(express.static('public'))
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
  })
)

app.get('/api/credentials', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not logged in' })
  }
  const account = db.prepare('SELECT serial_number, access_key_encrypted FROM accounts WHERE keycloak_user_id = ?').get(req.session.userId)
  res.json({ sn: account.serial_number, key: decrypt(account.access_key_encrypted) })
})

app.get('/login', async (req, res) => {
  const code_verifier = client.randomPKCECodeVerifier()
  const challenge =  await client.calculatePKCECodeChallenge(code_verifier)
  const state = client.randomState()

  req.session.codeVerifier = code_verifier
  req.session.state = state

  const authURL = client.buildAuthorizationUrl(config, {
    redirect_uri: 'https://pso.netreality.world/callback',
    scope: 'openid profile',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state: state,
  })

  res.redirect(authURL.href)
})

app.get('/callback', async (req, res) => {
  const url = new URL(req.originalUrl, `${req.protocol}://${req.get('host')}`)
  const tokens = await client.authorizationCodeGrant(config, url, {
    pkceCodeVerifier: req.session.codeVerifier,
    expectedState: req.session.state,
  })

  const sub = tokens.claims().sub
  req.session.userId = sub
  req.session.idToken = tokens.id_token
  const account = db.prepare('SELECT * FROM accounts WHERE keycloak_user_id = ?').get(sub)
  let credentials = {}

  if(!account) {
    credentials = generateCredentials()
    db.prepare('INSERT INTO accounts (keycloak_user_id, username, serial_number, access_key_encrypted) VALUES (?, ?, ?, ?)').run(sub, tokens.claims().preferred_username, credentials.sn, encrypt(credentials.key))
    exportLinks()
  } else {
    credentials = {
      sn: account.serial_number,
      key: decrypt(account.access_key_encrypted),
    }
  }
  res.redirect('/')
})

app.get('/logout', (req, res) => {
  const idToken = req.session.idToken
  req.session.destroy(() => {
    const endSessionUrl = new URL(config.serverMetadata().end_session_endpoint)
    endSessionUrl.searchParams.set('id_token_hint', idToken)
    endSessionUrl.searchParams.set('post_logout_redirect_uri', 'https://pso.netreality.world/')
    res.redirect(endSessionUrl.href)
  })
})

await appservice.begin()
await appservice.botClient.joinRoom(process.env.MATRIX_ROOM_ID)
console.log("listening on port 8000")
