const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { DatabaseSync } = require('node:sqlite');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3800;
const DB_PATH = path.join(__dirname, 'al.sqlite');
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
const JWT_SECRET = process.env.JWT_SECRET || 'al_super_secret_session_key_2026';

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Setup Database
const db = new DatabaseSync(DB_PATH);

// Initialize & migrate schema
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS locations (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    name TEXT NOT NULL,
    category TEXT DEFAULT 'Other',
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    address TEXT,
    notes TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    location_id TEXT NOT NULL,
    name TEXT NOT NULL,
    date TEXT NOT NULL,
    description TEXT,
    score REAL NOT NULL DEFAULT 5.0,
    photo_url TEXT,
    audio_url TEXT,
    favorite INTEGER NOT NULL DEFAULT 0,
    tags TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);

// Migration helper: Add user_id and audio_url columns if older table didn't have it
try {
  db.exec('ALTER TABLE locations ADD COLUMN user_id TEXT;');
} catch (e) {}
try {
  db.exec('ALTER TABLE events ADD COLUMN user_id TEXT;');
} catch (e) {}
try {
  db.exec('ALTER TABLE events ADD COLUMN audio_url TEXT;');
} catch (e) {}

// Indices (created after columns exist)
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_locations_user_id ON locations(user_id);
  CREATE INDEX IF NOT EXISTS idx_events_user_id ON events(user_id);
  CREATE INDEX IF NOT EXISTS idx_events_location_id ON events(location_id);
  CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);
  CREATE INDEX IF NOT EXISTS idx_events_favorite ON events(favorite);
  CREATE INDEX IF NOT EXISTS idx_events_score ON events(score);
`);

// ==========================================
// AUTHENTICATION UTILS
// ==========================================
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const verifyHash = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(verifyHash, 'hex'));
}

function createToken(user) {
  const payload = {
    id: user.id,
    username: user.username,
    email: user.email || '',
    exp: Date.now() + 30 * 86400000 // 30 days expiration
  };
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [data, sig] = token.split('.');
  const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(data).digest('base64url');
  if (sig !== expectedSig) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf-8'));
    if (payload.exp && payload.exp < Date.now()) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  let token = null;
  if (authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  } else if (req.query.token) {
    token = req.query.token;
  }

  const user = verifyToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized. Please sign in to access your personal map and logs.' });
  }
  req.user = user;
  next();
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Multer Storage for Photo Uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const uniqueName = `al_${Date.now()}_${crypto.randomBytes(6).toString('hex')}${ext}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// ==========================================
// AUTHENTICATION API ROUTES
// ==========================================

// Register New User (Starts with a clean, private slate)
app.post('/api/auth/register', (req, res) => {
  try {
    const { username, password, email } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }
    const cleanUsername = username.trim().toLowerCase();
    if (cleanUsername.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters long.' });
    }
    if (password.length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters long.' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(cleanUsername);
    if (existing) {
      return res.status(409).json({ error: 'Username already taken. Please choose another or sign in.' });
    }

    const id = `usr_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const passwordHash = hashPassword(password);
    const now = Date.now();

    db.prepare(`
      INSERT INTO users (id, username, email, password_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, cleanUsername, email ? email.trim() : null, passwordHash, now, now);

    const newUser = { id, username: cleanUsername, email: email ? email.trim() : '' };
    const token = createToken(newUser);
    res.status(201).json({
      success: true,
      message: 'Account created successfully!',
      user: newUser,
      token
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Login User
app.post('/api/auth/login', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }
    const cleanUsername = username.trim().toLowerCase();
    const userRow = db.prepare('SELECT * FROM users WHERE username = ?').get(cleanUsername);
    
    if (!userRow || !verifyPassword(password, userRow.password_hash)) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const user = {
      id: userRow.id,
      username: userRow.username,
      email: userRow.email || ''
    };
    const token = createToken(user);
    res.json({
      success: true,
      message: 'Signed in successfully!',
      user,
      token
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Change Password Endpoint
app.post('/api/auth/change-password', requireAuth, (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required.' });
    }
    if (newPassword.length < 4) {
      return res.status(400).json({ error: 'New password must be at least 4 characters long.' });
    }

    const userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!userRow || !verifyPassword(currentPassword, userRow.password_hash)) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }

    const newHash = hashPassword(newPassword);
    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(newHash, Date.now(), req.user.id);

    res.json({ success: true, message: 'Password changed successfully!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Current User Profile
app.get('/api/auth/me', requireAuth, (req, res) => {
  try {
    const userRow = db.prepare('SELECT id, username, email, created_at FROM users WHERE id = ?').get(req.user.id);
    if (!userRow) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user: userRow });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// PROTECTED USER-SCOPED API ROUTES
// ==========================================

// 1. Upload Photo Endpoint
app.post('/api/upload', requireAuth, upload.single('photo'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file uploaded' });
    }
    const photoUrl = `/uploads/${req.file.filename}`;
    res.json({ success: true, url: photoUrl, filename: req.file.filename });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Locations Endpoints (Private to user)
app.get('/api/locations', requireAuth, (req, res) => {
  try {
    const query = `
      SELECT 
        l.*,
        COUNT(e.id) as event_count,
        COALESCE(AVG(e.score), 0) as avg_score,
        MAX(e.date) as latest_event_date,
        SUM(CASE WHEN e.favorite = 1 THEN 1 ELSE 0 END) as favorite_events_count
      FROM locations l
      LEFT JOIN events e ON l.id = e.location_id AND e.user_id = ?
      WHERE l.user_id = ?
      GROUP BY l.id
      ORDER BY l.created_at DESC
    `;
    const locations = db.prepare(query).all(req.user.id, req.user.id);
    res.json(locations);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/locations', requireAuth, (req, res) => {
  try {
    const { name, category, lat, lng, address, notes } = req.body;
    if (!name || lat === undefined || lng === undefined) {
      return res.status(400).json({ error: 'Name, latitude, and longitude are required.' });
    }
    const id = `loc_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const now = Date.now();
    const insert = db.prepare(`
      INSERT INTO locations (id, user_id, name, category, lat, lng, address, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insert.run(id, req.user.id, name.trim(), category || 'Other', parseFloat(lat), parseFloat(lng), address || '', notes || '', now, now);
    const newLoc = db.prepare('SELECT * FROM locations WHERE id = ? AND user_id = ?').get(id, req.user.id);
    res.status(201).json(newLoc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/locations/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { name, category, lat, lng, address, notes } = req.body;
    const existing = db.prepare('SELECT * FROM locations WHERE id = ? AND user_id = ?').get(id, req.user.id);
    if (!existing) {
      return res.status(404).json({ error: 'Location not found' });
    }
    const now = Date.now();
    const update = db.prepare(`
      UPDATE locations 
      SET name = ?, category = ?, lat = ?, lng = ?, address = ?, notes = ?, updated_at = ?
      WHERE id = ? AND user_id = ?
    `);
    update.run(
      name !== undefined ? name.trim() : existing.name,
      category !== undefined ? category : existing.category,
      lat !== undefined ? parseFloat(lat) : existing.lat,
      lng !== undefined ? parseFloat(lng) : existing.lng,
      address !== undefined ? address : existing.address,
      notes !== undefined ? notes : existing.notes,
      now,
      id,
      req.user.id
    );
    const updatedLoc = db.prepare('SELECT * FROM locations WHERE id = ? AND user_id = ?').get(id, req.user.id);
    res.json(updatedLoc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/locations/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const del = db.prepare('DELETE FROM locations WHERE id = ? AND user_id = ?');
    const result = del.run(id, req.user.id);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Location not found' });
    }
    res.json({ success: true, message: 'Location and associated events deleted.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Events Endpoints (Private to user)
app.get('/api/events', requireAuth, (req, res) => {
  try {
    const { location_id, favorite, search, sort = 'date', order = 'desc', min_score } = req.query;
    let sql = `
      SELECT 
        e.*,
        l.name as location_name,
        l.category as location_category,
        l.lat as location_lat,
        l.lng as location_lng,
        l.address as location_address
      FROM events e
      JOIN locations l ON e.location_id = l.id
      WHERE e.user_id = ?
    `;
    const params = [req.user.id];

    if (location_id) {
      sql += ' AND e.location_id = ?';
      params.push(location_id);
    }
    if (favorite === 'true' || favorite === '1') {
      sql += ' AND e.favorite = 1';
    }
    if (min_score) {
      sql += ' AND e.score >= ?';
      params.push(parseFloat(min_score));
    }
    if (search) {
      sql += ' AND (e.name LIKE ? OR e.description LIKE ? OR l.name LIKE ? OR e.tags LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }

    const allowedSorts = {
      date: 'e.date',
      score: 'e.score',
      name: 'e.name',
      location: 'l.name',
      created_at: 'e.created_at'
    };
    const sortCol = allowedSorts[sort] || 'e.date';
    const sortOrder = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    sql += ` ORDER BY ${sortCol} ${sortOrder}`;

    const events = db.prepare(sql).all(...params);
    res.json(events);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/events/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const event = db.prepare(`
      SELECT 
        e.*,
        l.name as location_name,
        l.category as location_category,
        l.lat as location_lat,
        l.lng as location_lng,
        l.address as location_address
      FROM events e
      JOIN locations l ON e.location_id = l.id
      WHERE e.id = ? AND e.user_id = ?
    `).get(id, req.user.id);

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }
    res.json(event);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/events', requireAuth, (req, res) => {
  try {
    const { location_id, name, date, description, score, photo_url, audio_url, favorite, tags } = req.body;
    if (!location_id || !name || !date) {
      return res.status(400).json({ error: 'Location ID, Event Name, and Date are required.' });
    }
    const loc = db.prepare('SELECT id FROM locations WHERE id = ? AND user_id = ?').get(location_id, req.user.id);
    if (!loc) {
      return res.status(400).json({ error: 'Selected location does not exist in your account.' });
    }

    const id = `evt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const now = Date.now();
    const scoreVal = score !== undefined ? parseFloat(score) : 5.0;
    const favVal = favorite === true || favorite === 1 || favorite === '1' ? 1 : 0;

    const insert = db.prepare(`
      INSERT INTO events (id, user_id, location_id, name, date, description, score, photo_url, audio_url, favorite, tags, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insert.run(id, req.user.id, location_id, name.trim(), date, description || '', scoreVal, photo_url || '', audio_url || '', favVal, tags || '', now, now);

    const newEvent = db.prepare(`
      SELECT e.*, l.name as location_name 
      FROM events e 
      JOIN locations l ON e.location_id = l.id 
      WHERE e.id = ? AND e.user_id = ?
    `).get(id, req.user.id);
    res.status(201).json(newEvent);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/events/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { location_id, name, date, description, score, photo_url, audio_url, favorite, tags } = req.body;
    const existing = db.prepare('SELECT * FROM events WHERE id = ? AND user_id = ?').get(id, req.user.id);
    if (!existing) {
      return res.status(404).json({ error: 'Event not found' });
    }
    const now = Date.now();
    const update = db.prepare(`
      UPDATE events 
      SET location_id = ?, name = ?, date = ?, description = ?, score = ?, photo_url = ?, audio_url = ?, favorite = ?, tags = ?, updated_at = ?
      WHERE id = ? AND user_id = ?
    `);
    update.run(
      location_id !== undefined ? location_id : existing.location_id,
      name !== undefined ? name.trim() : existing.name,
      date !== undefined ? date : existing.date,
      description !== undefined ? description : existing.description,
      score !== undefined ? parseFloat(score) : existing.score,
      photo_url !== undefined ? photo_url : existing.photo_url,
      audio_url !== undefined ? audio_url : (existing.audio_url || ''),
      favorite !== undefined ? (favorite === true || favorite === 1 || favorite === '1' ? 1 : 0) : existing.favorite,
      tags !== undefined ? tags : existing.tags,
      now,
      id,
      req.user.id
    );
    const updatedEvent = db.prepare(`
      SELECT e.*, l.name as location_name 
      FROM events e 
      JOIN locations l ON e.location_id = l.id 
      WHERE e.id = ? AND e.user_id = ?
    `).get(id, req.user.id);
    res.json(updatedEvent);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/events/:id/favorite', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT favorite FROM events WHERE id = ? AND user_id = ?').get(id, req.user.id);
    if (!existing) {
      return res.status(404).json({ error: 'Event not found' });
    }
    const newFav = existing.favorite === 1 ? 0 : 1;
    db.prepare('UPDATE events SET favorite = ?, updated_at = ? WHERE id = ? AND user_id = ?').run(newFav, Date.now(), id, req.user.id);
    res.json({ id, favorite: newFav });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/events/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const result = db.prepare('DELETE FROM events WHERE id = ? AND user_id = ?').run(id, req.user.id);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }
    res.json({ success: true, message: 'Event deleted.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. KPI & Analytics Dashboard (Private to user)
app.get('/api/kpis', requireAuth, (req, res) => {
  try {
    const uid = req.user.id;
    const totalEvents = db.prepare('SELECT COUNT(*) as count FROM events WHERE user_id = ?').get(uid).count;
    const totalLocations = db.prepare('SELECT COUNT(*) as count FROM locations WHERE user_id = ?').get(uid).count;
    const totalFavorites = db.prepare('SELECT COUNT(*) as count FROM events WHERE user_id = ? AND favorite = 1').get(uid).count;
    
    // Average score overall
    const avgScoreRow = db.prepare('SELECT AVG(score) as avg_score, MIN(score) as min_score, MAX(score) as max_score FROM events WHERE user_id = ?').get(uid);
    const avgScore = avgScoreRow.avg_score !== null ? parseFloat(avgScoreRow.avg_score.toFixed(2)) : 0;

    // Events per location
    const eventsPerLocation = totalLocations > 0 ? parseFloat((totalEvents / totalLocations).toFixed(2)) : 0;

    // Favorite location by score (highest average score with at least 1 event)
    const favoriteByScore = db.prepare(`
      SELECT 
        l.id, l.name, l.category, l.lat, l.lng,
        COUNT(e.id) as event_count,
        AVG(e.score) as avg_score
      FROM locations l
      JOIN events e ON l.id = e.location_id AND e.user_id = ?
      WHERE l.user_id = ?
      GROUP BY l.id
      HAVING COUNT(e.id) >= 1
      ORDER BY avg_score DESC, event_count DESC
      LIMIT 1
    `).get(uid, uid) || null;

    if (favoriteByScore) {
      favoriteByScore.avg_score = parseFloat(favoriteByScore.avg_score.toFixed(2));
    }

    // Most frequented location (highest event count)
    const mostFrequented = db.prepare(`
      SELECT 
        l.id, l.name, l.category, l.lat, l.lng,
        COUNT(e.id) as event_count,
        COALESCE(AVG(e.score), 0) as avg_score
      FROM locations l
      JOIN events e ON l.id = e.location_id AND e.user_id = ?
      WHERE l.user_id = ?
      GROUP BY l.id
      ORDER BY event_count DESC, avg_score DESC
      LIMIT 1
    `).get(uid, uid) || null;

    if (mostFrequented) {
      mostFrequented.avg_score = parseFloat(mostFrequented.avg_score.toFixed(2));
    }

    // Top 5 Locations Leaderboard
    const topLocations = db.prepare(`
      SELECT 
        l.id, l.name, l.category,
        COUNT(e.id) as event_count,
        ROUND(AVG(e.score), 2) as avg_score
      FROM locations l
      JOIN events e ON l.id = e.location_id AND e.user_id = ?
      WHERE l.user_id = ?
      GROUP BY l.id
      ORDER BY avg_score DESC, event_count DESC
      LIMIT 5
    `).all(uid, uid);

    // Category breakdown
    const categoryBreakdown = db.prepare(`
      SELECT 
        l.category,
        COUNT(DISTINCT l.id) as location_count,
        COUNT(e.id) as event_count,
        ROUND(COALESCE(AVG(e.score), 0), 2) as avg_score
      FROM locations l
      LEFT JOIN events e ON l.id = e.location_id AND e.user_id = ?
      WHERE l.user_id = ?
      GROUP BY l.category
      ORDER BY event_count DESC
    `).all(uid, uid);

    // Score distribution
    const scoreDistribution = [
      { range: '9.0 - 10.0', count: db.prepare('SELECT COUNT(*) as count FROM events WHERE user_id = ? AND score >= 9.0').get(uid).count },
      { range: '7.0 - 8.9', count: db.prepare('SELECT COUNT(*) as count FROM events WHERE user_id = ? AND score >= 7.0 AND score < 9.0').get(uid).count },
      { range: '5.0 - 6.9', count: db.prepare('SELECT COUNT(*) as count FROM events WHERE user_id = ? AND score >= 5.0 AND score < 7.0').get(uid).count },
      { range: '3.0 - 4.9', count: db.prepare('SELECT COUNT(*) as count FROM events WHERE user_id = ? AND score >= 3.0 AND score < 5.0').get(uid).count },
      { range: '1.0 - 2.9', count: db.prepare('SELECT COUNT(*) as count FROM events WHERE user_id = ? AND score < 3.0').get(uid).count }
    ];

    // Recent activity
    const recentEvents = db.prepare(`
      SELECT e.*, l.name as location_name 
      FROM events e 
      JOIN locations l ON e.location_id = l.id 
      WHERE e.user_id = ?
      ORDER BY e.date DESC 
      LIMIT 5
    `).all(uid);

    res.json({
      total_events: totalEvents,
      total_locations: totalLocations,
      total_favorites: totalFavorites,
      average_score_overall: avgScore,
      events_per_location: eventsPerLocation,
      favorite_location_by_score: favoriteByScore,
      most_frequented_location: mostFrequented,
      top_locations: topLocations,
      category_breakdown: categoryBreakdown,
      score_distribution: scoreDistribution,
      recent_events: recentEvents
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Export Data Endpoint (Private to user)
app.get('/api/export', requireAuth, (req, res) => {
  try {
    const locations = db.prepare('SELECT * FROM locations WHERE user_id = ?').all(req.user.id);
    const events = db.prepare('SELECT * FROM events WHERE user_id = ?').all(req.user.id);
    res.json({
      app: 'AL',
      version: '1.0.0',
      user: req.user.username,
      exported_at: new Date().toISOString(),
      locations,
      events
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve Single Page App
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[AL] Map & Event Logger (Multi-User) running on http://0.0.0.0:${PORT}`);
});
