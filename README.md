# AL — Map & Event Intelligence Web App 🗺️⭐

**AL** is a full-featured, mobile-responsive web application for discovering, logging, and scoring private locations and memorable events on an interactive map.

---

## 🌟 Key Features

- **🗺️ Interactive Map & Custom Pins:**
  - Fast, responsive Leaflet map using free, zero-API-key OpenStreetMap and CartoDB tiles.
  - Custom glowing markers displaying location score badges and name tags.
  - Interactive bottom location carousel to quickly jump to any saved spot.
  - Click-to-pin anywhere on the globe with auto-filled GPS coordinates.

- **📝 Named Events & Scoring:**
  - Log events with title, date/time, 1.0–10.0 rating score slider, notes/review, and tags.
  - Multi-image photo upload support with camera integration on mobile devices.
  - Built-in high-resolution photo lightbox viewer.
  - Favorite toggle to bookmark top experiences.

- **📊 Comprehensive KPIs & Analytics Dashboard:**
  - Live metric cards: Total Events, Total Locations, Events per Location, Overall Average Score.
  - Spotlight highlights: Top Rated Location by Score & Most Frequented Spot.
  - Interactive Chart.js Score Distribution bar chart and Category breakdown doughnut chart.
  - Top 5 Locations Leaderboard.

- **📋 Searchable & Filterable Summary Table:**
  - Full data ledger with thumbnail previews, location tags, dates, and scores.
  - Filter by location, minimum score threshold, and sort by date or rating.
  - One-click export of complete dataset to **CSV** or **JSON**.

- **🔐 Multi-User Authentication & Privacy Isolation:**
  - Built-in User Management (Sign In & Account Registration).
  - Secure `scrypt` password hashing and HMAC-SHA256 bearer tokens.
  - Complete data isolation per user: all locations, events, and analytics are strictly private to each account.

- **📤 Event Sharing:**
  - Native Web Share API integration for instant sharing via iOS/Android/macOS apps.
  - Formatted text summary copyable with one click.

---

## 🚀 Quick Start

### Prerequisites
- Node.js 20+ (Node 24 recommended)
- npm

### Installation
```bash
git clone https://github.com/dimax-dev-team/al-map-logger.git
cd al-map-logger
npm install
```

### Running Locally
```bash
PORT=3800 npm start
```
Open [http://localhost:3800](http://localhost:3800) in your browser.

---

## 🐳 Docker Deployment

```bash
docker build -t al-map-logger .
docker run -d -p 3800:3800 -v al-data:/app al-map-logger
```

---

## 🏗️ Architecture & Tech Stack

- **Backend:** Node.js, Express, `node:sqlite` (SQLite with WAL mode), Multer
- **Frontend:** Vanilla JavaScript (SPA), Tailwind CSS, Leaflet.js, Chart.js, Lucide Icons
- **Security:** Scrypt password hashing, signed HMAC-SHA256 session tokens, CORS & input sanitization
