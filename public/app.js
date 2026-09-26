// AL - Map & Event Logger (Multi-User & Hybrid Client/Server Storage)

// State Management
let state = {
  activeTab: 'map',
  currentUser: null,
  authToken: localStorage.getItem('al_auth_token') || null,
  authMode: 'login', // 'login' or 'register'
  locations: [],
  events: [],
  kpis: null,
  selectedLocation: null,
  activeShareEvent: null,
  activeCategoryFilter: 'all',
  mapSearchQuery: '',
  charts: {
    scoreDist: null,
    category: null
  },
  isStandaloneClient: false // detected if static hosting like GitHub Pages
};

let map = null;
let markersLayer = null;
let searchDebounceTimer = null;

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  initIcons();
  initMap();
  checkAuthAndLoad();
  setDefaultEventDate();
});

function initIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// ==========================================
// CLIENT-SIDE DATABASE FOR GITHUB PAGES / STANDALONE
// ==========================================
const ClientDB = {
  getUsers() {
    try {
      return JSON.parse(localStorage.getItem('al_users') || '[]');
    } catch (e) {
      return [];
    }
  },
  saveUsers(users) {
    localStorage.setItem('al_users', JSON.stringify(users));
  },
  getLocations(userId) {
    try {
      const all = JSON.parse(localStorage.getItem('al_locations') || '[]');
      return userId ? all.filter(l => l.user_id === userId) : all;
    } catch (e) {
      return [];
    }
  },
  saveLocations(locations, userId) {
    try {
      let all = JSON.parse(localStorage.getItem('al_locations') || '[]');
      if (userId) {
        all = all.filter(l => l.user_id !== userId).concat(locations);
      } else {
        all = locations;
      }
      localStorage.setItem('al_locations', JSON.stringify(all));
    } catch (e) {}
  },
  getEvents(userId) {
    try {
      const all = JSON.parse(localStorage.getItem('al_events') || '[]');
      return userId ? all.filter(e => e.user_id === userId) : all;
    } catch (e) {
      return [];
    }
  },
  saveEvents(events, userId) {
    try {
      let all = JSON.parse(localStorage.getItem('al_events') || '[]');
      if (userId) {
        all = all.filter(e => e.user_id !== userId).concat(events);
      } else {
        all = events;
      }
      localStorage.setItem('al_events', JSON.stringify(all));
    } catch (e) {}
  },
  seedInitialData(userId) {
    const now = Date.now();
    const starterLocations = [
      {
        id: `loc_${Date.now()}_1`,
        user_id: userId,
        name: 'Piazza De Ferrari',
        category: 'Culture & Landmark',
        lat: 44.4072,
        lng: 8.9340,
        address: 'Piazza Raffaele De Ferrari, 16121 Genova GE, Italy',
        notes: 'The main square of Genoa with the iconic central bronze fountain.',
        created_at: now - 30 * 86400000,
        updated_at: now - 30 * 86400000
      },
      {
        id: `loc_${Date.now()}_2`,
        user_id: userId,
        name: 'Bogliasco Cliffside Viewpoint',
        category: 'Nature & Coast',
        lat: 44.3789,
        lng: 9.0682,
        address: 'Via Giuseppe Mazzini, 16031 Bogliasco GE, Italy',
        notes: 'Scenic rocky coastline overlooking the Golfo Paradiso.',
        created_at: now - 25 * 86400000,
        updated_at: now - 25 * 86400000
      },
      {
        id: `loc_${Date.now()}_3`,
        user_id: userId,
        name: 'Trattoria Cavour 21',
        category: 'Restaurant & Dining',
        lat: 44.4089,
        lng: 8.9288,
        address: 'Piazza Cavour 21r, 16128 Genova GE, Italy',
        notes: 'Authentic Genovese pesto and fresh seafood in the old port area.',
        created_at: now - 20 * 86400000,
        updated_at: now - 20 * 86400000
      },
      {
        id: `loc_${Date.now()}_4`,
        user_id: userId,
        name: 'Portofino Promontory Lighthouse',
        category: 'Travel & Exploration',
        lat: 44.3005,
        lng: 9.2178,
        address: 'Faro di Portofino, 16034 Portofino GE, Italy',
        notes: 'Panoramic coastal hike leading to the historic lighthouse.',
        created_at: now - 15 * 86400000,
        updated_at: now - 15 * 86400000
      }
    ];

    const starterEvents = [
      {
        id: `evt_${Date.now()}_1`,
        user_id: userId,
        location_id: starterLocations[0].id,
        name: 'Late Summer Symphony at the Fountain',
        date: '2026-09-02T19:30',
        description: 'Outdoor classical concert right in the heart of Genoa. Beautiful evening breeze and vibrant atmosphere.',
        score: 9.5,
        photo_url: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=1200&q=80',
        favorite: 1,
        tags: 'concert, music, outdoor'
      },
      {
        id: `evt_${Date.now()}_2`,
        user_id: userId,
        location_id: starterLocations[1].id,
        name: 'Sunset Espresso & Coastal Walk',
        date: '2026-09-08T18:00',
        description: 'Watched surfers on Bogliasco beach with an espresso. The light over the cliffs was stunning.',
        score: 9.8,
        photo_url: 'https://images.unsplash.com/photo-1533105079780-92b9be482077?auto=format&fit=crop&w=1200&q=80',
        favorite: 1,
        tags: 'sunset, coffee, sea'
      },
      {
        id: `evt_${Date.now()}_3`,
        user_id: userId,
        location_id: starterLocations[2].id,
        name: 'Traditional Pesto & Trofie Dinner',
        date: '2026-09-12T20:30',
        description: 'World-class Genovese pesto trofie with potatoes and green beans. Incredible house white wine.',
        score: 9.2,
        photo_url: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1200&q=80',
        favorite: 1,
        tags: 'food, dinner, pasta'
      }
    ];

    this.saveLocations(starterLocations, userId);
    this.saveEvents(starterEvents, userId);
  },
  computeKPIs(userId) {
    const locs = this.getLocations(userId);
    const evts = this.getEvents(userId);

    const totalEvents = evts.length;
    const totalLocations = locs.length;
    const totalFavorites = evts.filter(e => e.favorite === 1 || e.favorite === true).length;
    const avgScoreOverall = totalEvents > 0
      ? evts.reduce((sum, e) => sum + (parseFloat(e.score) || 0), 0) / totalEvents
      : 0;

    const eventsPerLocation = totalLocations > 0 ? totalEvents / totalLocations : 0;

    // Calculate per-location stats
    const locStats = locs.map(l => {
      const locEvts = evts.filter(e => e.location_id === l.id);
      const avg = locEvts.length > 0
        ? locEvts.reduce((sum, e) => sum + (parseFloat(e.score) || 0), 0) / locEvts.length
        : 0;
      return {
        ...l,
        event_count: locEvts.length,
        avg_score: avg,
        latest_event_date: locEvts.length > 0 ? locEvts[0].date : null
      };
    });

    // Favorite by score
    const withEvents = locStats.filter(l => l.event_count >= 1);
    withEvents.sort((a, b) => b.avg_score - a.avg_score || b.event_count - a.event_count);
    const favoriteByScore = withEvents.length > 0 ? withEvents[0] : null;

    // Most frequented
    const byFreq = [...locStats].sort((a, b) => b.event_count - a.event_count || b.avg_score - a.avg_score);
    const mostFrequented = byFreq.length > 0 && byFreq[0].event_count > 0 ? byFreq[0] : null;

    // Category breakdown
    const catMap = {};
    locStats.forEach(l => {
      const cat = l.category || 'Other';
      if (!catMap[cat]) catMap[cat] = { category: cat, location_count: 0, event_count: 0, total_score: 0 };
      catMap[cat].location_count += 1;
      catMap[cat].event_count += l.event_count;
      catMap[cat].total_score += l.avg_score * l.event_count;
    });

    const categoryBreakdown = Object.values(catMap).map(c => ({
      category: c.category,
      location_count: c.location_count,
      event_count: c.event_count,
      avg_score: c.event_count > 0 ? c.total_score / c.event_count : 0
    })).sort((a, b) => b.event_count - a.event_count);

    // Score distribution
    const scoreDistribution = [
      { range: '9.0 - 10.0', count: evts.filter(e => e.score >= 9.0).length },
      { range: '7.0 - 8.9', count: evts.filter(e => e.score >= 7.0 && e.score < 9.0).length },
      { range: '5.0 - 6.9', count: evts.filter(e => e.score >= 5.0 && e.score < 7.0).length },
      { range: '3.0 - 4.9', count: evts.filter(e => e.score >= 3.0 && e.score < 5.0).length },
      { range: '1.0 - 2.9', count: evts.filter(e => e.score < 3.0).length }
    ];

    return {
      total_events: totalEvents,
      total_locations: totalLocations,
      total_favorites: totalFavorites,
      average_score_overall: avgScoreOverall,
      events_per_location: eventsPerLocation,
      favorite_location_by_score: favoriteByScore,
      most_frequented_location: mostFrequented,
      top_locations: withEvents.slice(0, 5),
      category_breakdown: categoryBreakdown,
      score_distribution: scoreDistribution
    };
  }
};

// ==========================================
// AUTHENTICATION CLIENT LOGIC
// ==========================================
function checkAuthAndLoad() {
  if (!state.authToken) {
    renderUserHeader();
    openAuthModal('login');
    return;
  }

  // Attempt server authentication first; if on static GitHub Pages, use client auth
  fetchWithAuth('/api/auth/me')
    .then(res => {
      if (!res.ok) {
        if (res.status === 404 || res.status === 405) {
          // Static host detected (e.g. GitHub Pages)
          state.isStandaloneClient = true;
          return loadClientSession();
        }
        throw new Error('Session expired');
      }
      return res.json();
    })
    .then(data => {
      if (data && data.user) {
        state.currentUser = data.user;
        renderUserHeader();
        closeModal('modal-auth');
        loadAllData();
      }
    })
    .catch(err => {
      console.warn('Server auth failed, checking client store:', err);
      loadClientSession();
    });
}

function loadClientSession() {
  const token = state.authToken;
  if (!token) {
    renderUserHeader();
    openAuthModal('login');
    return;
  }

  try {
    const rawUser = localStorage.getItem('al_current_user');
    if (rawUser) {
      state.currentUser = JSON.parse(rawUser);
      renderUserHeader();
      closeModal('modal-auth');
      loadAllData();
      return;
    }
  } catch (e) {}

  logout(false);
}

function fetchWithAuth(url, options = {}) {
  const headers = options.headers ? new Headers(options.headers) : new Headers();
  if (state.authToken) {
    headers.set('Authorization', `Bearer ${state.authToken}`);
  }
  options.headers = headers;

  return fetch(url, options).catch(err => {
    // Return synthetic 404 for offline/static pages
    return new Response(JSON.stringify({ error: 'Static host' }), { status: 404 });
  });
}

function renderUserHeader() {
  const container = document.getElementById('user-header-container');
  if (!container) return;

  if (state.currentUser) {
    const initials = state.currentUser.username.slice(0, 2).toUpperCase();
    container.innerHTML = `
      <div class="flex items-center gap-2">
        <div class="flex items-center gap-2 bg-dark-700/80 px-2.5 py-1.5 rounded-xl border border-slate-700">
          <div class="w-6 h-6 rounded-lg bg-gradient-to-tr from-brand-600 to-accent-500 text-white font-black text-xs flex items-center justify-center">
            ${initials}
          </div>
          <span class="text-xs font-bold text-white max-w-[100px] truncate">${escapeHtml(state.currentUser.username)}</span>
        </div>
        <button onclick="logout(true)" class="p-2 rounded-xl text-slate-400 hover:text-red-400 hover:bg-dark-700 transition" title="Sign Out">
          <i data-lucide="log-out" class="w-4 h-4"></i>
        </button>
      </div>
    `;
  } else {
    container.innerHTML = `
      <button onclick="openAuthModal('login')" class="px-3 py-1.5 rounded-xl bg-brand-600/20 hover:bg-brand-600/30 text-brand-300 text-xs font-bold border border-brand-500/30 transition">
        Sign In
      </button>
    `;
  }
  initIcons();
}

function openAuthModal(mode = 'login') {
  toggleAuthMode(mode);
  openModal('modal-auth');
}

function toggleAuthMode(mode) {
  state.authMode = mode;
  const isReg = mode === 'register';

  document.getElementById('auth-modal-title').innerText = isReg ? 'Create Account on AL' : 'Sign In to AL';
  document.getElementById('auth-modal-subtitle').innerText = isReg
    ? 'Start logging your private spots, reviews, and event scores.'
    : 'Access your private locations, logs, and score analytics.';

  document.getElementById('auth-tab-login').className = !isReg
    ? 'flex-1 py-2 text-xs font-bold rounded-lg transition bg-brand-600 text-white shadow'
    : 'flex-1 py-2 text-xs font-bold rounded-lg transition text-slate-400 hover:text-white';

  document.getElementById('auth-tab-register').className = isReg
    ? 'flex-1 py-2 text-xs font-bold rounded-lg transition bg-brand-600 text-white shadow'
    : 'flex-1 py-2 text-xs font-bold rounded-lg transition text-slate-400 hover:text-white';

  document.getElementById('auth-email-group').classList.toggle('hidden', !isReg);
  document.getElementById('auth-submit-btn').innerText = isReg ? 'Create Account' : 'Sign In';
}

function handleAuthSubmit(e) {
  e.preventDefault();
  const username = document.getElementById('auth-input-username').value.trim();
  const *** = document.getElementById('auth-input-***').value;
  const email = document.getElementById('auth-input-email')?.value.trim() || '';

  const endpoint = state.authMode === 'register' ? '/api/auth/register' : '/api/auth/login';
  const payload = { username, ***, email };

  fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
    .then(r => {
      if (r.status === 404 || r.status === 405) {
        // Fallback to client-side authentication for static GitHub Pages hosting
        return handleClientAuth(state.authMode, username, ***, email);
      }
      return r.json().then(data => ({ status: r.status, data }));
    })
    .then(({ status, data }) => {
      if (status >= 400 || !data.token) {
        showToast(data.error || 'Authentication failed', 'error');
        return;
      }

      state.authToken = data.token;
      state.currentUser = data.user;
      localStorage.setItem('al_auth_token', data.token);
      localStorage.setItem('al_current_user', JSON.stringify(data.user));

      closeModal('modal-auth');
      renderUserHeader();
      showToast(state.authMode === 'register' ? 'Welcome to AL! 🎉 Account created.' : `Welcome back, ${data.user.username}! ⚡`, 'success');
      loadAllData();
    })
    .catch(err => {
      // Offline fallback
      handleClientAuth(state.authMode, username, ***, email).then(({ status, data }) => {
        if (status < 400) {
          state.authToken = data.token;
          state.currentUser = data.user;
          localStorage.setItem('al_auth_token', data.token);
          localStorage.setItem('al_current_user', JSON.stringify(data.user));
          closeModal('modal-auth');
          renderUserHeader();
          showToast(`Welcome, ${data.user.username}! (Local Session)`, 'success');
          loadAllData();
        } else {
          showToast(data.error || 'Authentication error', 'error');
        }
      });
    });
}

function handleClientAuth(mode, username, ***, email) {
  const users = ClientDB.getUsers();
  const cleanUsername = username.toLowerCase();

  if (mode === 'register') {
    if (users.find(u => u.username === cleanUsername)) {
      return Promise.resolve({ status: 409, data: { error: 'Username already registered.' } });
    }
    const user = {
      id: `usr_${Date.now()}`,
      username: cleanUsername,
      email: email || '',
      ***: ***
    };
    users.push(user);
    ClientDB.saveUsers(users);
    ClientDB.seedInitialData(user.id);
    return Promise.resolve({
      status: 201,
      data: { user: { id: user.id, username: user.username, email: user.email }, token: `client_token_${user.id}` }
    });
  } else {
    const user = users.find(u => u.username === cleanUsername && u.*** === ***);
    if (!user) {
      // Auto-create default user if first time on GitHub Pages
      if (users.length === 0 && cleanUsername) {
        return handleClientAuth('register', username, ***, email);
      }
      return Promise.resolve({ status: 401, data: { error: 'Invalid username or ***.' } });
    }
    return Promise.resolve({
      status: 200,
      data: { user: { id: user.id, username: user.username, email: user.email }, token: `client_token_${user.id}` }
    });
  }
}

function logout(notify = true) {
  state.authToken = null;
  state.currentUser = null;
  state.locations = [];
  state.events = [];
  state.kpis = null;
  localStorage.removeItem('al_auth_token');
  localStorage.removeItem('al_current_user');

  renderUserHeader();
  if (markersLayer) markersLayer.clearLayers();
  renderLocationCarousel();
  renderEventsTable([]);
  renderFavoritesGrid([]);

  if (notify) showToast('Signed out successfully', 'info');
  openAuthModal('login');
}

// ==========================================
// NAVIGATION & TABS
// ==========================================
function switchTab(tabId) {
  state.activeTab = tabId;

  document.querySelectorAll('.tab-content').forEach(el => {
    el.classList.add('hidden');
  });
  const targetTab = document.getElementById(`tab-${tabId}`);
  if (targetTab) {
    targetTab.classList.remove('hidden');
    targetTab.classList.add('animate-fade-in');
  }

  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.classList.remove('active', 'bg-brand-600', 'text-white', 'shadow');
    btn.classList.add('text-slate-400');
  });
  const activeNavBtn = document.getElementById(`nav-btn-${tabId}`);
  if (activeNavBtn) {
    activeNavBtn.classList.add('active', 'bg-brand-600', 'text-white', 'shadow');
    activeNavBtn.classList.remove('text-slate-400');
  }

  ['map', 'events', 'kpis', 'favorites'].forEach(t => {
    const mBtn = document.getElementById(`mobile-nav-${t}`);
    if (mBtn) {
      if (t === tabId) {
        mBtn.className = 'flex flex-col items-center gap-1 text-brand-400 text-[10px] font-semibold py-1';
      } else {
        mBtn.className = 'flex flex-col items-center gap-1 text-slate-400 text-[10px] font-medium py-1';
      }
    }
  });

  if (tabId === 'map') {
    setTimeout(() => {
      if (map) map.invalidateSize();
    }, 200);
  } else if (tabId === 'events') {
    loadEventsTable();
  } else if (tabId === 'kpis') {
    loadKPIs();
  } else if (tabId === 'favorites') {
    loadFavoritesGrid();
  }

  initIcons();
}

// ==========================================
// MAP INITIALIZATION & LOGIC
// ==========================================
function initMap() {
  const defaultCenter = [44.4072, 8.9340];
  const defaultZoom = 12;

  const mapEl = document.getElementById('leaflet-map');
  if (!mapEl) return;

  try {
    map = L.map('leaflet-map').setView(defaultCenter, defaultZoom);

    // Standard OpenStreetMap tiles (100% reliable, zero API key)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    markersLayer = L.layerGroup().addTo(map);

    map.on('click', (e) => {
      if (e && e.latlng) {
        openAddLocationModal(e.latlng.lat, e.latlng.lng);
      }
    });

    setTimeout(() => {
      if (map) map.invalidateSize();
    }, 200);

    window.addEventListener('resize', () => {
      if (map) map.invalidateSize();
    });
  } catch (err) {
    console.error('Error initializing map:', err);
  }
}

function renderMapMarkers() {
  if (!markersLayer || !map) return;
  markersLayer.clearLayers();

  let bounds = [];
  const query = (state.mapSearchQuery || '').toLowerCase();
  const categoryFilter = state.activeCategoryFilter;

  if (!state.locations || state.locations.length === 0) {
    return;
  }

  state.locations.forEach(loc => {
    if (categoryFilter !== 'all' && loc.category !== categoryFilter) return;

    if (query) {
      const matchName = (loc.name || '').toLowerCase().includes(query);
      const matchAddress = (loc.address || '').toLowerCase().includes(query);
      const matchCat = (loc.category || '').toLowerCase().includes(query);
      if (!matchName && !matchAddress && !matchCat) return;
    }

    const lat = parseFloat(loc.lat);
    const lng = parseFloat(loc.lng);
    if (isNaN(lat) || isNaN(lng)) return;

    bounds.push([lat, lng]);

    const avgScore = parseFloat(loc.avg_score || 0);
    const scoreDisplay = loc.event_count > 0 ? avgScore.toFixed(1) : '📍';
    const pinColor = avgScore >= 9.0 ? '#8b5cf6' : avgScore >= 7.0 ? '#0ea5e9' : '#f59e0b';

    const customIcon = L.divIcon({
      className: '',
      html: `
        <div style="position:relative; width:44px; height:44px; display:flex; align-items:center; justify-content:center; cursor:pointer; filter:drop-shadow(0 4px 8px rgba(0,0,0,0.6));">
          <div style="width:36px; height:36px; border-radius:50% 50% 50% 0; background:${pinColor}; transform:rotate(-45deg); display:flex; align-items:center; justify-content:center; border:2px solid #ffffff; box-shadow:0 0 15px ${pinColor};">
            <span style="transform:rotate(45deg); color:#ffffff; font-weight:800; font-size:11px; font-family:sans-serif; text-shadow:0 1px 2px rgba(0,0,0,0.5);">${scoreDisplay}</span>
          </div>
          <div style="position:absolute; bottom:-16px; left:50%; transform:translateX(-50%); background:rgba(15,23,42,0.92); color:#ffffff; font-size:10px; font-weight:700; padding:1px 6px; border-radius:6px; border:1px solid rgba(255,255,255,0.25); white-space:nowrap; box-shadow:0 2px 6px rgba(0,0,0,0.4);">
            ${escapeHtml(loc.name)}
          </div>
        </div>
      `,
      iconSize: [44, 44],
      iconAnchor: [22, 36],
      popupAnchor: [0, -36]
    });

    const marker = L.marker([lat, lng], { icon: customIcon });

    const popupHtml = `
      <div style="width:260px; padding:12px; background:#111622; color:#ffffff; border-radius:14px; font-family:sans-serif;">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">
          <span style="font-size:10px; text-transform:uppercase; font-weight:700; background:rgba(139,92,246,0.2); color:#c4b5fd; padding:2px 8px; border-radius:999px; border:1px solid rgba(139,92,246,0.3);">
            ${escapeHtml(loc.category || 'Location')}
          </span>
          <span style="font-size:12px; font-weight:800; color:#fbbf24;">
            ⭐ ${loc.event_count > 0 ? avgScore.toFixed(1) : 'No events'}
          </span>
        </div>
        <h4 style="font-weight:700; font-size:15px; color:#ffffff; margin:0 0 4px 0; line-height:1.3;">${escapeHtml(loc.name)}</h4>
        <p style="font-size:11px; color:#94a3b8; margin:0 0 8px 0;">${escapeHtml(loc.address || 'Lat: ' + lat.toFixed(3) + ', Lng: ' + lng.toFixed(3))}</p>
        
        <div style="display:flex; align-items:center; justify-content:space-between; font-size:11px; color:#cbd5e1; padding-top:8px; border-top:1px solid rgba(255,255,255,0.1);">
          <span>${loc.event_count} event${loc.event_count === 1 ? '' : 's'} logged</span>
          <button onclick="selectLocationById('${loc.id}')" style="background:#7c3aed; color:#ffffff; border:none; border-radius:8px; padding:4px 10px; font-size:11px; font-weight:700; cursor:pointer;">
            View Details &rarr;
          </button>
        </div>
      </div>
    `;

    marker.bindPopup(popupHtml);
    marker.on('click', () => {
      openLocationDrawer(loc);
    });

    markersLayer.addLayer(marker);
  });

  if (bounds.length > 0 && !state.selectedLocation) {
    try {
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 13, animate: true });
    } catch (e) {}
  }
}

function handleMapSearch(val) {
  state.mapSearchQuery = val;
  const clearBtn = document.getElementById('map-clear-search');
  if (clearBtn) {
    clearBtn.classList.toggle('hidden', !val);
  }
  renderMapMarkers();
}

function clearMapSearch() {
  const input = document.getElementById('map-search-input');
  if (input) input.value = '';
  handleMapSearch('');
}

function filterMapCategory(cat) {
  state.activeCategoryFilter = cat;
  document.querySelectorAll('.cat-pill').forEach(btn => {
    if (btn.innerText.toLowerCase().includes(cat.toLowerCase()) || (cat === 'all' && btn.innerText === 'All')) {
      btn.className = 'cat-pill active text-xs px-3 py-1.5 rounded-xl font-medium transition bg-brand-600 text-white';
    } else {
      btn.className = 'cat-pill text-xs px-3 py-1.5 rounded-xl font-medium transition text-slate-300 hover:bg-dark-700';
    }
  });
  renderMapMarkers();
}

function locateUserPosition() {
  if (!navigator.geolocation) {
    showToast('Geolocation is not supported by your browser', 'error');
    return;
  }
  navigator.geolocation.getCurrentPosition(
    pos => {
      const { latitude, longitude } = pos.coords;
      if (map) {
        map.flyTo([latitude, longitude], 15, { duration: 1.5 });
        L.circleMarker([latitude, longitude], {
          radius: 8,
          fillColor: '#0ea5e9',
          color: '#ffffff',
          weight: 2,
          opacity: 1,
          fillOpacity: 0.9
        }).addTo(map).bindPopup("You are here").openPopup();
      }
    },
    err => {
      showToast('Could not retrieve GPS position: ' + err.message, 'error');
    }
  );
}

// ==========================================
// LOCATION DRAWER
// ==========================================
function openLocationDrawer(loc) {
  state.selectedLocation = loc;
  const drawer = document.getElementById('location-drawer');
  if (!drawer) return;

  document.getElementById('drawer-title').innerText = loc.name;
  document.getElementById('drawer-category-badge').innerText = loc.category || 'Spot';
  document.getElementById('drawer-address').innerHTML = `<i data-lucide="map-pin" class="w-3.5 h-3.5 text-accent-400 shrink-0"></i> <span>${escapeHtml(loc.address || 'No address set')}</span>`;
  document.getElementById('drawer-notes').innerText = loc.notes || 'No description notes added for this location.';
  document.getElementById('drawer-notes').style.display = loc.notes ? 'block' : 'none';
  document.getElementById('drawer-avg-score').innerHTML = `<i data-lucide="star" class="w-3.5 h-3.5 fill-amber-400"></i> ${loc.avg_score > 0 ? Number(loc.avg_score).toFixed(1) : 'N/A'}`;
  document.getElementById('drawer-event-count').innerText = loc.event_count || '0';

  const addEvtBtn = document.getElementById('drawer-add-event-btn');
  if (addEvtBtn) {
    addEvtBtn.onclick = () => openAddEventModal(loc.id);
  }

  // Filter events for this location
  if (state.isStandaloneClient) {
    const evts = state.events.filter(e => e.location_id === loc.id);
    renderDrawerEventsList(evts);
  } else {
    fetchWithAuth(`/api/events?location_id=${loc.id}&sort=date&order=desc`)
      .then(res => res.json())
      .then(events => {
        if (Array.isArray(events)) {
          renderDrawerEventsList(events);
        } else {
          const evts = state.events.filter(e => e.location_id === loc.id);
          renderDrawerEventsList(evts);
        }
      })
      .catch(() => {
        const evts = state.events.filter(e => e.location_id === loc.id);
        renderDrawerEventsList(evts);
      });
  }

  drawer.classList.remove('translate-y-full', 'md:translate-x-[120%]');
  drawer.classList.add('translate-y-0', 'md:translate-x-0');
  initIcons();
}

function closeLocationDrawer() {
  state.selectedLocation = null;
  const drawer = document.getElementById('location-drawer');
  if (!drawer) return;
  drawer.classList.add('translate-y-full', 'md:translate-x-[120%]');
  drawer.classList.remove('translate-y-0', 'md:translate-x-0');
}

function selectLocationById(id) {
  const loc = state.locations.find(l => l.id === id);
  if (loc) {
    if (map) map.flyTo([loc.lat, loc.lng], 14, { duration: 1 });
    openLocationDrawer(loc);
  }
}

function renderDrawerEventsList(events) {
  const container = document.getElementById('drawer-events-list');
  if (!container) return;

  if (!events || events.length === 0) {
    container.innerHTML = `
      <div class="p-6 text-center text-slate-400 text-xs bg-dark-900/40 rounded-xl border border-slate-800">
        No events logged at this location yet. Click "Add Event" above to create the first one!
      </div>
    `;
    return;
  }

  container.innerHTML = events.map(evt => `
    <div class="bg-dark-900/90 rounded-xl border border-slate-800 p-3 hover:border-slate-700 transition flex flex-col gap-2">
      ${evt.photo_url ? `
        <div class="h-28 rounded-lg overflow-hidden relative cursor-pointer group" onclick="openLightbox('${escapeHtml(evt.photo_url)}', '${escapeHtml(evt.name)}')">
          <img src="${escapeHtml(evt.photo_url)}" alt="${escapeHtml(evt.name)}" class="w-full h-full object-cover group-hover:scale-105 transition duration-300">
          <div class="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition flex items-center justify-center opacity-0 group-hover:opacity-100">
            <i data-lucide="maximize-2" class="w-5 h-5 text-white"></i>
          </div>
        </div>
      ` : ''}
      <div class="flex items-start justify-between gap-2">
        <h4 class="text-sm font-bold text-white leading-tight">${escapeHtml(evt.name)}</h4>
        <div class="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 text-xs font-bold shrink-0 flex items-center gap-1 border border-amber-500/20">
          <i data-lucide="star" class="w-3 h-3 fill-amber-400"></i> ${Number(evt.score).toFixed(1)}
        </div>
      </div>
      <p class="text-xs text-slate-300 line-clamp-2">${escapeHtml(evt.description || '')}</p>
      <div class="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800/80">
        <span>${formatDate(evt.date)}</span>
        <div class="flex items-center gap-2">
          <button onclick="toggleFavorite('${evt.id}', event)" class="p-1 text-slate-400 hover:text-amber-400 transition" title="Favorite">
            <i data-lucide="star" class="w-3.5 h-3.5 ${evt.favorite ? 'fill-amber-400 text-amber-400' : ''}"></i>
          </button>
          <button onclick="openShareModal('${evt.id}')" class="p-1 text-slate-400 hover:text-accent-400 transition" title="Share">
            <i data-lucide="share-2" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      </div>
    </div>
  `).join('');

  initIcons();
}

// ==========================================
// LOCATION BOTTOM CAROUSEL
// ==========================================
function renderLocationCarousel() {
  const container = document.getElementById('map-locations-carousel');
  if (!container) return;

  if (!state.locations || state.locations.length === 0) {
    container.innerHTML = `
      <div class="bg-dark-800/95 backdrop-blur-md px-4 py-2 rounded-2xl border border-slate-700 text-xs text-slate-300 shadow-xl flex items-center gap-2">
        <span>📍 Click anywhere on the map to add your first private location</span>
      </div>
    `;
    return;
  }

  container.innerHTML = state.locations.map(loc => {
    const avgScore = parseFloat(loc.avg_score || 0);
    return `
      <button onclick="selectLocationById('${loc.id}')" class="bg-dark-800/95 hover:bg-dark-700/95 backdrop-blur-md px-3.5 py-2 rounded-2xl border border-slate-700 hover:border-brand-500 shadow-xl text-left transition duration-200 shrink-0 flex items-center gap-2.5 group">
        <div class="w-8 h-8 rounded-xl bg-gradient-to-tr from-brand-600 to-accent-500 text-white font-black text-xs flex items-center justify-center shadow">
          ${avgScore > 0 ? avgScore.toFixed(1) : '📍'}
        </div>
        <div>
          <div class="text-xs font-bold text-white group-hover:text-brand-300 truncate max-w-[140px]">${escapeHtml(loc.name)}</div>
          <div class="text-[10px] text-slate-400 truncate max-w-[140px]">${loc.event_count} event${loc.event_count === 1 ? '' : 's'}</div>
        </div>
      </button>
    `;
  }).join('');
}

// ==========================================
// DATA LOADING (Locations, Events, KPIs)
// ==========================================
function loadAllData() {
  if (!state.authToken || !state.currentUser) return;

  Promise.all([
    fetchWithAuth('/api/locations').then(r => r.json()),
    fetchWithAuth('/api/events').then(r => r.json()),
    fetchWithAuth('/api/kpis').then(r => r.json())
  ]).then(([locations, events, kpis]) => {
    if (Array.isArray(locations)) {
      state.locations = locations;
      state.events = Array.isArray(events) ? events : [];
      state.kpis = kpis || null;
    } else {
      // Standalone client storage mode
      loadFromClientDB();
      return;
    }

    updateLocationSelectOptions();
    renderMapMarkers();
    renderLocationCarousel();
    loadEventsTable();
    loadKPIs();
  }).catch(() => {
    loadFromClientDB();
  });
}

function loadFromClientDB() {
  const uid = state.currentUser.id;
  const rawLocs = ClientDB.getLocations(uid);
  const rawEvts = ClientDB.getEvents(uid);

  // Compute stats on client
  state.events = rawEvts.map(e => {
    const loc = rawLocs.find(l => l.id === e.location_id);
    return { ...e, location_name: loc ? loc.name : 'Unknown' };
  });

  state.locations = rawLocs.map(l => {
    const locEvts = rawEvts.filter(e => e.location_id === l.id);
    const avg = locEvts.length > 0
      ? locEvts.reduce((sum, e) => sum + (parseFloat(e.score) || 0), 0) / locEvts.length
      : 0;
    return {
      ...l,
      event_count: locEvts.length,
      avg_score: avg,
      latest_event_date: locEvts.length > 0 ? locEvts[0].date : null
    };
  });

  state.kpis = ClientDB.computeKPIs(uid);

  updateLocationSelectOptions();
  renderMapMarkers();
  renderLocationCarousel();
  loadEventsTable();
  loadKPIs();
}

function updateLocationSelectOptions() {
  const selects = ['events-location-filter', 'evt-input-location-id'];
  selects.forEach(selectId => {
    const el = document.getElementById(selectId);
    if (!el) return;
    const currentVal = el.value;
    const isFilter = selectId === 'events-location-filter';

    let html = isFilter ? '<option value="">All Locations</option>' : '<option value="" disabled selected>Select a location...</option>';
    html += state.locations.map(loc => `
      <option value="${loc.id}">${escapeHtml(loc.name)} (${escapeHtml(loc.category)})</option>
    `).join('');

    el.innerHTML = html;
    if (currentVal) el.value = currentVal;
  });
}

// ==========================================
// EVENTS TABLE VIEW & FILTERING
// ==========================================
function debounceLoadEvents() {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(loadEventsTable, 250);
}

function loadEventsTable() {
  if (!state.authToken) return;

  const search = (document.getElementById('events-search-filter')?.value || '').trim().toLowerCase();
  const locationId = document.getElementById('events-location-filter')?.value || '';
  const minScore = document.getElementById('events-score-filter')?.value || '';
  const sortOption = document.getElementById('events-sort-filter')?.value || 'date_desc';

  let [sort, order] = sortOption.split('_');
  if (!sort) sort = 'date';
  if (!order) order = 'desc';

  if (state.isStandaloneClient) {
    let filtered = [...state.events];
    if (locationId) filtered = filtered.filter(e => e.location_id === locationId);
    if (minScore) filtered = filtered.filter(e => e.score >= parseFloat(minScore));
    if (search) {
      filtered = filtered.filter(e =>
        (e.name || '').toLowerCase().includes(search) ||
        (e.description || '').toLowerCase().includes(search) ||
        (e.location_name || '').toLowerCase().includes(search)
      );
    }

    filtered.sort((a, b) => {
      if (sort === 'score') return order === 'asc' ? a.score - b.score : b.score - a.score;
      if (sort === 'name') return order === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      return order === 'asc' ? new Date(a.date) - new Date(b.date) : new Date(b.date) - new Date(a.date);
    });

    renderEventsTable(filtered);
    return;
  }

  const params = new URLSearchParams();
  if (search) params.append('search', search);
  if (locationId) params.append('location_id', locationId);
  if (minScore) params.append('min_score', minScore);
  params.append('sort', sort);
  params.append('order', order);

  fetchWithAuth(`/api/events?${params.toString()}`)
    .then(r => r.json())
    .then(events => {
      if (Array.isArray(events)) {
        renderEventsTable(events);
      } else {
        loadEventsTableClientFallback(search, locationId, minScore, sort, order);
      }
    })
    .catch(() => {
      loadEventsTableClientFallback(search, locationId, minScore, sort, order);
    });
}

function loadEventsTableClientFallback(search, locationId, minScore, sort, order) {
  let filtered = [...state.events];
  if (locationId) filtered = filtered.filter(e => e.location_id === locationId);
  if (minScore) filtered = filtered.filter(e => e.score >= parseFloat(minScore));
  if (search) {
    filtered = filtered.filter(e =>
      (e.name || '').toLowerCase().includes(search) ||
      (e.description || '').toLowerCase().includes(search) ||
      (e.location_name || '').toLowerCase().includes(search)
    );
  }

  filtered.sort((a, b) => {
    if (sort === 'score') return order === 'asc' ? a.score - b.score : b.score - a.score;
    if (sort === 'name') return order === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
    return order === 'asc' ? new Date(a.date) - new Date(b.date) : new Date(b.date) - new Date(a.date);
  });

  renderEventsTable(filtered);
}

function renderEventsTable(events) {
  const tbody = document.getElementById('events-table-body');
  const emptyState = document.getElementById('events-empty-state');
  const totalBadge = document.getElementById('events-total-badge');

  if (totalBadge) totalBadge.innerText = `${events.length} event${events.length === 1 ? '' : 's'}`;

  if (!events || events.length === 0) {
    if (tbody) tbody.innerHTML = '';
    if (emptyState) emptyState.classList.remove('hidden');
    return;
  }

  if (emptyState) emptyState.classList.add('hidden');

  tbody.innerHTML = events.map(evt => `
    <tr class="hover:bg-dark-700/50 transition duration-150">
      <td class="px-4 py-3">
        ${evt.photo_url ? `
          <div class="w-12 h-12 rounded-xl overflow-hidden bg-dark-900 cursor-pointer group relative border border-slate-700" onclick="openLightbox('${escapeHtml(evt.photo_url)}', '${escapeHtml(evt.name)}')">
            <img src="${escapeHtml(evt.photo_url)}" alt="Thumb" class="w-full h-full object-cover group-hover:scale-110 transition duration-200">
          </div>
        ` : `
          <div class="w-12 h-12 rounded-xl bg-dark-700/60 border border-slate-700 flex items-center justify-center text-slate-500">
            <i data-lucide="image" class="w-5 h-5"></i>
          </div>
        `}
      </td>
      <td class="px-4 py-3">
        <div class="font-bold text-white">${escapeHtml(evt.name)}</div>
        <div class="text-xs text-slate-400 line-clamp-1">${escapeHtml(evt.description || 'No description')}</div>
      </td>
      <td class="px-4 py-3">
        <button onclick="switchTab('map'); selectLocationById('${evt.location_id}')" class="text-brand-300 hover:text-brand-200 font-medium text-xs flex items-center gap-1">
          <i data-lucide="map-pin" class="w-3.5 h-3.5 text-accent-400"></i> ${escapeHtml(evt.location_name || 'Location')}
        </button>
      </td>
      <td class="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
        ${formatDate(evt.date)}
      </td>
      <td class="px-4 py-3">
        <div class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 text-xs font-bold border border-amber-500/20">
          <i data-lucide="star" class="w-3.5 h-3.5 fill-amber-400"></i>
          <span>${Number(evt.score).toFixed(1)}</span>
        </div>
      </td>
      <td class="px-4 py-3 text-center">
        <button onclick="toggleFavorite('${evt.id}', event)" class="p-1 text-slate-400 hover:text-amber-400 transition" title="Toggle Favorite">
          <i data-lucide="star" class="w-4 h-4 ${evt.favorite ? 'fill-amber-400 text-amber-400' : ''}"></i>
        </button>
      </td>
      <td class="px-4 py-3 text-right whitespace-nowrap">
        <div class="flex items-center justify-end gap-1.5">
          <button onclick="openShareModal('${evt.id}')" class="p-1.5 rounded-lg bg-dark-700/60 hover:bg-dark-600 text-slate-300 hover:text-white transition" title="Share Event">
            <i data-lucide="share-2" class="w-3.5 h-3.5"></i>
          </button>
          <button onclick="editEvent('${evt.id}')" class="p-1.5 rounded-lg bg-dark-700/60 hover:bg-dark-600 text-slate-300 hover:text-white transition" title="Edit Event">
            <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
          </button>
          <button onclick="deleteEvent('${evt.id}')" class="p-1.5 rounded-lg bg-dark-700/60 hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition" title="Delete Event">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      </td>
    </tr>
  `).join('');

  initIcons();
}

// ==========================================
// KPIS & CHARTS LOGIC
// ==========================================
function loadKPIs() {
  if (!state.authToken) return;

  if (state.isStandaloneClient) {
    state.kpis = ClientDB.computeKPIs(state.currentUser.id);
    renderKPIDashboard(state.kpis);
    return;
  }

  fetchWithAuth('/api/kpis')
    .then(r => r.json())
    .then(kpis => {
      if (kpis && kpis.total_events !== undefined) {
        state.kpis = kpis;
        renderKPIDashboard(kpis);
      } else {
        state.kpis = ClientDB.computeKPIs(state.currentUser.id);
        renderKPIDashboard(state.kpis);
      }
    })
    .catch(() => {
      state.kpis = ClientDB.computeKPIs(state.currentUser.id);
      renderKPIDashboard(state.kpis);
    });
}

function renderKPIDashboard(kpis) {
  if (!kpis) return;

  document.getElementById('kpi-total-events').innerText = kpis.total_events || 0;
  document.getElementById('kpi-total-locations').innerText = kpis.total_locations || 0;
  document.getElementById('kpi-events-per-loc').innerText = Number(kpis.events_per_location || 0).toFixed(1);
  document.getElementById('kpi-avg-score').innerHTML = `${Number(kpis.average_score_overall || 0).toFixed(1)} <span class="text-xs text-slate-400 font-normal">/ 10</span>`;

  if (kpis.favorite_location_by_score) {
    const fav = kpis.favorite_location_by_score;
    document.getElementById('kpi-fav-loc-name').innerText = fav.name;
    document.getElementById('kpi-fav-loc-cat').innerText = fav.category || 'Category';
    document.getElementById('kpi-fav-score-badge').innerHTML = `<i data-lucide="star" class="w-4 h-4 fill-amber-400"></i> ${Number(fav.avg_score).toFixed(1)}`;
    document.getElementById('kpi-fav-loc-events').innerText = `${fav.event_count} logged event${fav.event_count === 1 ? '' : 's'}`;
    document.getElementById('kpi-fav-loc-btn').onclick = () => {
      switchTab('map');
      selectLocationById(fav.id);
    };
  } else {
    document.getElementById('kpi-fav-loc-name').innerText = 'No locations yet';
  }

  if (kpis.most_frequented_location) {
    const freq = kpis.most_frequented_location;
    document.getElementById('kpi-freq-loc-name').innerText = freq.name;
    document.getElementById('kpi-freq-loc-cat').innerText = freq.category || 'Category';
    document.getElementById('kpi-freq-count-badge').innerText = `${freq.event_count} visits`;
    document.getElementById('kpi-freq-loc-avg').innerText = `Avg Score: ${Number(freq.avg_score).toFixed(1)}`;
    document.getElementById('kpi-freq-loc-btn').onclick = () => {
      switchTab('map');
      selectLocationById(freq.id);
    };
  } else {
    document.getElementById('kpi-freq-loc-name').innerText = 'No locations yet';
  }

  const tbody = document.getElementById('kpis-leaderboard-body');
  if (tbody) {
    if (kpis.top_locations && kpis.top_locations.length > 0) {
      tbody.innerHTML = kpis.top_locations.map((loc, idx) => `
        <tr class="hover:bg-dark-700/40 transition">
          <td class="py-3 px-4 font-extrabold ${idx === 0 ? 'text-amber-400' : idx === 1 ? 'text-slate-300' : idx === 2 ? 'text-amber-600' : 'text-slate-500'}">
            #${idx + 1}
          </td>
          <td class="py-3 px-4 font-bold text-white">
            <button onclick="switchTab('map'); selectLocationById('${loc.id}')" class="text-white hover:text-brand-300">
              ${escapeHtml(loc.name)}
            </button>
          </td>
          <td class="py-3 px-4 text-xs text-slate-400">${escapeHtml(loc.category)}</td>
          <td class="py-3 px-4 text-center font-semibold text-brand-300">${loc.event_count}</td>
          <td class="py-3 px-4 text-right font-black text-amber-400">⭐ ${Number(loc.avg_score).toFixed(1)}</td>
        </tr>
      `).join('');
    } else {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center py-6 text-slate-500">No data available yet</td></tr>';
    }
  }

  if (kpis.score_distribution) renderScoreDistChart(kpis.score_distribution);
  if (kpis.category_breakdown) renderCategoryChart(kpis.category_breakdown);
  initIcons();
}

function renderScoreDistChart(distribution) {
  const ctx = document.getElementById('scoreDistChart');
  if (!ctx) return;

  if (state.charts.scoreDist) {
    state.charts.scoreDist.destroy();
  }

  const labels = distribution.map(d => d.range);
  const data = distribution.map(d => d.count);

  state.charts.scoreDist = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Number of Events',
        data: data,
        backgroundColor: [
          'rgba(168, 85, 247, 0.85)',
          'rgba(59, 130, 246, 0.85)',
          'rgba(16, 185, 129, 0.85)',
          'rgba(245, 158, 11, 0.85)',
          'rgba(239, 68, 68, 0.85)'
        ],
        borderRadius: 8,
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: {
          grid: { display: false, drawBorder: false },
          ticks: { color: '#94a3b8', font: { size: 11 } }
        },
        y: {
          grid: { color: 'rgba(148, 163, 184, 0.1)', drawBorder: false },
          ticks: { color: '#94a3b8', stepSize: 1, font: { size: 11 } },
          beginAtZero: true
        }
      }
    }
  });
}

function renderCategoryChart(categories) {
  const ctx = document.getElementById('categoryChart');
  if (!ctx) return;

  if (state.charts.category) {
    state.charts.category.destroy();
  }

  const labels = categories.map(c => c.category || 'Other');
  const data = categories.map(c => c.event_count);

  state.charts.category = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: [
          '#8b5cf6', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#6366f1', '#14b8a6'
        ],
        borderWidth: 2,
        borderColor: '#111622'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: { color: '#94a3b8', boxWidth: 12, font: { size: 11 } }
        }
      },
      cutout: '70%'
    }
  });
}

// ==========================================
// FAVORITES VIEW
// ==========================================
function loadFavoritesGrid() {
  if (!state.authToken) return;

  if (state.isStandaloneClient) {
    const favs = state.events.filter(e => e.favorite === 1 || e.favorite === true);
    renderFavoritesGrid(favs);
    return;
  }

  fetchWithAuth('/api/events?favorite=1&sort=score&order=desc')
    .then(r => r.json())
    .then(favs => {
      if (Array.isArray(favs)) {
        renderFavoritesGrid(favs);
      } else {
        const f = state.events.filter(e => e.favorite === 1 || e.favorite === true);
        renderFavoritesGrid(f);
      }
    })
    .catch(() => {
      const f = state.events.filter(e => e.favorite === 1 || e.favorite === true);
      renderFavoritesGrid(f);
    });
}

function renderFavoritesGrid(events) {
  const grid = document.getElementById('favorites-grid');
  const empty = document.getElementById('favorites-empty-state');
  if (!grid) return;

  if (!events || events.length === 0) {
    grid.innerHTML = '';
    if (empty) empty.classList.remove('hidden');
    return;
  }

  if (empty) empty.classList.add('hidden');

  grid.innerHTML = events.map(evt => `
    <div class="bg-dark-800 rounded-2xl overflow-hidden border border-slate-700/80 shadow-xl flex flex-col hover:border-amber-500/40 transition duration-300 group">
      <div class="h-48 bg-dark-950 relative overflow-hidden">
        ${evt.photo_url ? `
          <img src="${escapeHtml(evt.photo_url)}" alt="${escapeHtml(evt.name)}" class="w-full h-full object-cover group-hover:scale-105 transition duration-500 cursor-pointer" onclick="openLightbox('${escapeHtml(evt.photo_url)}', '${escapeHtml(evt.name)}')">
        ` : `
          <div class="w-full h-full flex items-center justify-center text-slate-600 bg-dark-900">
            <i data-lucide="image" class="w-12 h-12"></i>
          </div>
        `}
        <div class="absolute top-3 right-3 px-3 py-1 rounded-full bg-black/75 backdrop-blur-md text-amber-400 text-xs font-extrabold flex items-center gap-1 border border-amber-500/30">
          <i data-lucide="star" class="w-3.5 h-3.5 fill-amber-400"></i> ${Number(evt.score).toFixed(1)}
        </div>
      </div>

      <div class="p-5 flex-1 flex flex-col justify-between">
        <div>
          <h3 class="font-bold text-lg text-white mb-1 leading-snug">${escapeHtml(evt.name)}</h3>
          <p class="text-xs text-brand-400 font-medium flex items-center gap-1 mb-3">
            <i data-lucide="map-pin" class="w-3.5 h-3.5"></i> ${escapeHtml(evt.location_name || 'Spot')}
          </p>
          <p class="text-xs text-slate-300 line-clamp-3 mb-4 italic">"${escapeHtml(evt.description || 'No notes added.')}"</p>
        </div>

        <div class="pt-3 border-t border-slate-700/60 flex items-center justify-between text-xs text-slate-400">
          <span>${formatDate(evt.date)}</span>
          <div class="flex items-center gap-2">
            <button onclick="openShareModal('${evt.id}')" class="p-1.5 rounded-lg bg-dark-700 hover:bg-dark-600 text-slate-300 transition" title="Share">
              <i data-lucide="share-2" class="w-4 h-4"></i>
            </button>
            <button onclick="toggleFavorite('${evt.id}', event)" class="p-1.5 rounded-lg bg-dark-700 hover:bg-dark-600 text-amber-400 transition" title="Unfavorite">
              <i data-lucide="star" class="w-4 h-4 fill-amber-400"></i>
            </button>
          </div>
        </div>
      </div>
    </div>
  `).join('');

  initIcons();
}

// ==========================================
// MODAL CONTROLS & FORM SUBMISSION
// ==========================================
function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.remove('hidden');
    initIcons();
  }
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.add('hidden');
  }
}

function openAddLocationModal(lat = null, lng = null) {
  if (!state.authToken) {
    openAuthModal('login');
    return;
  }

  document.getElementById('location-modal-title').innerHTML = `<i data-lucide="map-pin" class="w-5 h-5 text-accent-400"></i> Add New Location`;
  document.getElementById('loc-input-id').value = '';
  document.getElementById('loc-input-name').value = '';
  document.getElementById('loc-input-address').value = '';
  document.getElementById('loc-input-notes').value = '';
  document.getElementById('loc-input-category').value = 'Nature & Coast';
  
  if (lat !== null && lng !== null) {
    document.getElementById('loc-input-lat').value = parseFloat(lat).toFixed(6);
    document.getElementById('loc-input-lng').value = parseFloat(lng).toFixed(6);
  } else {
    document.getElementById('loc-input-lat').value = '';
    document.getElementById('loc-input-lng').value = '';
  }

  openModal('modal-location');
}

function handleLocationSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('loc-input-id').value;
  const name = document.getElementById('loc-input-name').value;
  const category = document.getElementById('loc-input-category').value;
  const lat = parseFloat(document.getElementById('loc-input-lat').value);
  const lng = parseFloat(document.getElementById('loc-input-lng').value);
  const address = document.getElementById('loc-input-address').value;
  const notes = document.getElementById('loc-input-notes').value;

  const payload = { name, category, lat, lng, address, notes };
  const method = id ? 'PUT' : 'POST';
  const url = id ? `/api/locations/${id}` : '/api/locations';

  fetchWithAuth(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
    .then(r => {
      if (r.status === 404 || r.status === 405) {
        // Fallback to client-side store
        return handleClientLocationSave(id, payload);
      }
      return r.json();
    })
    .then(data => {
      closeModal('modal-location');
      showToast(id ? 'Location updated successfully' : 'Location created successfully!', 'success');
      loadAllData();
      if (map && !id) {
        map.flyTo([lat, lng], 14);
      }
    })
    .catch(() => {
      handleClientLocationSave(id, payload).then(() => {
        closeModal('modal-location');
        showToast('Location saved locally!', 'success');
        loadAllData();
      });
    });
}

function handleClientLocationSave(id, payload) {
  const uid = state.currentUser.id;
  let locs = ClientDB.getLocations(uid);
  if (id) {
    locs = locs.map(l => l.id === id ? { ...l, ...payload, updated_at: Date.now() } : l);
  } else {
    const newLoc = {
      id: `loc_${Date.now()}`,
      user_id: uid,
      ...payload,
      created_at: Date.now(),
      updated_at: Date.now()
    };
    locs.push(newLoc);
  }
  ClientDB.saveLocations(locs, uid);
  return Promise.resolve();
}

function setCurrentGpsLocation() {
  if (!navigator.geolocation) {
    showToast('Geolocation not available', 'error');
    return;
  }
  navigator.geolocation.getCurrentPosition(pos => {
    document.getElementById('loc-input-lat').value = pos.coords.latitude.toFixed(6);
    document.getElementById('loc-input-lng').value = pos.coords.longitude.toFixed(6);
    showToast('GPS coordinates populated!', 'success');
  }, err => {
    showToast('Could not fetch location: ' + err.message, 'error');
  });
}

function setDefaultEventDate() {
  const dateInput = document.getElementById('evt-input-date');
  if (dateInput) {
    const now = new Date();
    const isoLocal = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    dateInput.value = isoLocal;
  }
}

function openAddEventModal(locationId = null) {
  if (!state.authToken) {
    openAuthModal('login');
    return;
  }

  document.getElementById('event-modal-title').innerHTML = `<i data-lucide="calendar-plus" class="w-5 h-5 text-brand-400"></i> Log Named Event`;
  document.getElementById('evt-input-id').value = '';
  document.getElementById('evt-input-name').value = '';
  document.getElementById('evt-input-description').value = '';
  document.getElementById('evt-input-score').value = '9.0';
  document.getElementById('score-display-val').innerText = '9.0';
  document.getElementById('evt-input-favorite').checked = false;
  removeSelectedPhoto();
  setDefaultEventDate();

  if (locationId) {
    document.getElementById('evt-input-location-id').value = locationId;
  }

  openModal('modal-event');
}

function editEvent(id) {
  const evt = state.events.find(e => e.id === id);
  if (!evt) return;

  document.getElementById('event-modal-title').innerHTML = `<i data-lucide="edit-3" class="w-5 h-5 text-brand-400"></i> Edit Event`;
  document.getElementById('evt-input-id').value = evt.id;
  document.getElementById('evt-input-location-id').value = evt.location_id;
  document.getElementById('evt-input-name').value = evt.name;
  document.getElementById('evt-input-date').value = (evt.date || '').slice(0, 16);
  document.getElementById('evt-input-description').value = evt.description || '';
  document.getElementById('evt-input-score').value = evt.score;
  document.getElementById('score-display-val').innerText = Number(evt.score).toFixed(1);
  document.getElementById('evt-input-favorite').checked = evt.favorite === 1 || evt.favorite === true;

  if (evt.photo_url) {
    setPhotoPreview(evt.photo_url);
  } else {
    removeSelectedPhoto();
  }

  openModal('modal-event');
}

function handlePhotoFileSelected(input) {
  if (!input.files || !input.files[0]) return;
  const file = input.files[0];

  // If running on static host (GitHub Pages), convert to compact Data URL
  if (state.isStandaloneClient || location.hostname.includes('github.io')) {
    const reader = new FileReader();
    reader.onload = (e) => {
      setPhotoPreview(e.target.result);
      showToast('Photo attached!', 'success');
    };
    reader.readAsDataURL(file);
    return;
  }

  const formData = new FormData();
  formData.append('photo', file);

  showToast('Uploading photo...', 'info');

  fetchWithAuth('/api/upload', {
    method: 'POST',
    body: formData
  })
    .then(r => r.json())
    .then(data => {
      if (data.url) {
        setPhotoPreview(data.url);
        showToast('Photo uploaded successfully!', 'success');
      } else {
        // Fallback to data URL
        const reader = new FileReader();
        reader.onload = (e) => setPhotoPreview(e.target.result);
        reader.readAsDataURL(file);
      }
    })
    .catch(() => {
      const reader = new FileReader();
      reader.onload = (e) => setPhotoPreview(e.target.result);
      reader.readAsDataURL(file);
    });
}

function handlePhotoUrlInput(val) {
  if (val && (val.startsWith('http://') || val.startsWith('https://') || val.startsWith('data:image') || val.startsWith('/uploads/'))) {
    setPhotoPreview(val);
  }
}

function setPhotoPreview(url) {
  const container = document.getElementById('photo-preview-container');
  const img = document.getElementById('photo-preview-img');
  const urlInput = document.getElementById('evt-input-photo-url');
  if (container && img) {
    img.src = url;
    container.classList.remove('hidden');
    if (urlInput) urlInput.value = url;
  }
}

function removeSelectedPhoto() {
  const container = document.getElementById('photo-preview-container');
  const img = document.getElementById('photo-preview-img');
  const urlInput = document.getElementById('evt-input-photo-url');
  const fileInput = document.getElementById('evt-input-file');
  if (container) container.classList.add('hidden');
  if (img) img.src = '';
  if (urlInput) urlInput.value = '';
  if (fileInput) fileInput.value = '';
}

function handleEventSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('evt-input-id').value;
  const location_id = document.getElementById('evt-input-location-id').value;
  const name = document.getElementById('evt-input-name').value;
  const date = document.getElementById('evt-input-date').value;
  const score = parseFloat(document.getElementById('evt-input-score').value);
  const description = document.getElementById('evt-input-description').value;
  const photo_url = document.getElementById('evt-input-photo-url').value;
  const favorite = document.getElementById('evt-input-favorite').checked ? 1 : 0;

  const payload = { location_id, name, date, score, description, photo_url, favorite };
  const method = id ? 'PUT' : 'POST';
  const url = id ? `/api/events/${id}` : '/api/events';

  fetchWithAuth(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
    .then(r => {
      if (r.status === 404 || r.status === 405) {
        return handleClientEventSave(id, payload);
      }
      return r.json();
    })
    .then(() => {
      closeModal('modal-event');
      showToast(id ? 'Event updated!' : 'Event logged successfully! ⭐', 'success');
      loadAllData();
      if (state.selectedLocation && state.selectedLocation.id === location_id) {
        openLocationDrawer(state.selectedLocation);
      }
    })
    .catch(() => {
      handleClientEventSave(id, payload).then(() => {
        closeModal('modal-event');
        showToast('Event saved locally! ⭐', 'success');
        loadAllData();
      });
    });
}

function handleClientEventSave(id, payload) {
  const uid = state.currentUser.id;
  let evts = ClientDB.getEvents(uid);
  if (id) {
    evts = evts.map(e => e.id === id ? { ...e, ...payload, updated_at: Date.now() } : e);
  } else {
    const newEvt = {
      id: `evt_${Date.now()}`,
      user_id: uid,
      ...payload,
      created_at: Date.now(),
      updated_at: Date.now()
    };
    evts.push(newEvt);
  }
  ClientDB.saveEvents(evts, uid);
  return Promise.resolve();
}

function toggleFavorite(id, e) {
  if (e) e.stopPropagation();
  fetchWithAuth(`/api/events/${id}/favorite`, { method: 'POST' })
    .then(r => {
      if (r.status === 404 || r.status === 405) {
        return toggleClientFavorite(id);
      }
      return r.json();
    })
    .then(res => {
      showToast(res && res.favorite ? 'Added to favorites! ⭐' : 'Removed from favorites', 'info');
      loadAllData();
    })
    .catch(() => {
      toggleClientFavorite(id).then(res => {
        showToast(res.favorite ? 'Added to favorites! ⭐' : 'Removed from favorites', 'info');
        loadAllData();
      });
    });
}

function toggleClientFavorite(id) {
  const uid = state.currentUser.id;
  let evts = ClientDB.getEvents(uid);
  let newFav = 1;
  evts = evts.map(e => {
    if (e.id === id) {
      newFav = (e.favorite === 1 || e.favorite === true) ? 0 : 1;
      return { ...e, favorite: newFav };
    }
    return e;
  });
  ClientDB.saveEvents(evts, uid);
  return Promise.resolve({ favorite: newFav });
}

function deleteEvent(id) {
  if (!confirm('Are you sure you want to delete this event?')) return;
  fetchWithAuth(`/api/events/${id}`, { method: 'DELETE' })
    .then(r => {
      if (r.status === 404 || r.status === 405) {
        return deleteClientEvent(id);
      }
      return r.json();
    })
    .then(() => {
      showToast('Event deleted', 'info');
      loadAllData();
    })
    .catch(() => {
      deleteClientEvent(id).then(() => {
        showToast('Event deleted', 'info');
        loadAllData();
      });
    });
}

function deleteClientEvent(id) {
  const uid = state.currentUser.id;
  let evts = ClientDB.getEvents(uid);
  evts = evts.filter(e => e.id !== id);
  ClientDB.saveEvents(evts, uid);
  return Promise.resolve();
}

// ==========================================
// SHARING LOGIC & LIGHTBOX
// ==========================================
function openShareModal(eventId) {
  const evt = state.events.find(e => e.id === eventId);
  if (!evt) return;

  state.activeShareEvent = evt;
  document.getElementById('share-title').innerText = evt.name;
  document.getElementById('share-loc').innerText = `📍 ${evt.location_name || 'Location'}`;
  document.getElementById('share-score').innerText = Number(evt.score).toFixed(1);
  document.getElementById('share-desc').innerText = evt.description || 'No notes added.';
  document.getElementById('share-date').innerText = formatDate(evt.date);
  
  const img = document.getElementById('share-img');
  img.src = evt.photo_url || 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80';

  openModal('modal-share');
}

function triggerNativeShare() {
  const evt = state.activeShareEvent;
  if (!evt) return;

  const shareData = {
    title: `AL: ${evt.name} at ${evt.location_name}`,
    text: `⭐ Rated ${Number(evt.score).toFixed(1)}/10 at ${evt.location_name} on ${formatDate(evt.date)}: "${evt.description || ''}"`,
    url: window.location.href
  };

  if (navigator.share) {
    navigator.share(shareData).catch(() => {});
  } else {
    copyShareText();
  }
}

function copyShareText() {
  const evt = state.activeShareEvent;
  if (!evt) return;
  const text = `📍 ${evt.name} (${evt.location_name || 'Spot'})\n⭐ Score: ${Number(evt.score).toFixed(1)}/10\n📅 Date: ${formatDate(evt.date)}\n📝 "${evt.description || ''}"\nLogged on AL`;
  navigator.clipboard.writeText(text).then(() => {
    showToast('Summary copied to clipboard!', 'success');
  });
}

function openLightbox(url, caption) {
  const img = document.getElementById('lightbox-img');
  const cap = document.getElementById('lightbox-caption');
  if (img) img.src = url;
  if (cap) cap.innerText = caption || '';
  openModal('modal-lightbox');
}

// ==========================================
// EXPORTS (JSON & CSV)
// ==========================================
function exportDataJSON() {
  const uid = state.currentUser ? state.currentUser.id : null;
  const data = {
    app: 'AL',
    version: '1.0.0',
    user: state.currentUser ? state.currentUser.username : 'Guest',
    exported_at: new Date().toISOString(),
    locations: state.locations,
    events: state.events
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `AL_Export_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('JSON export downloaded!', 'success');
}

function exportEventsCSV() {
  const events = state.events;
  const headers = ['ID', 'Event Name', 'Location', 'Category', 'Date', 'Score', 'Favorite', 'Description', 'Photo URL'];
  const rows = events.map(e => [
    `"${e.id}"`,
    `"${escapeCsv(e.name)}"`,
    `"${escapeCsv(e.location_name)}"`,
    `"${escapeCsv(e.location_category || '')}"`,
    `"${e.date}"`,
    e.score,
    e.favorite ? 'Yes' : 'No',
    `"${escapeCsv(e.description || '')}"`,
    `"${e.photo_url || ''}"`
  ]);

  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `AL_Events_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('CSV export downloaded!', 'success');
}

// ==========================================
// UTILITY HELPERS
// ==========================================
function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeCsv(str) {
  if (!str) return '';
  return String(str).replace(/"/g, '""');
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  const colors = {
    success: 'bg-emerald-600 text-white border-emerald-500',
    error: 'bg-red-600 text-white border-red-500',
    info: 'bg-dark-800 text-slate-100 border-slate-700'
  };

  toast.className = `${colors[type] || colors.info} px-4 py-3 rounded-2xl shadow-2xl border text-xs font-semibold flex items-center gap-2 animate-fade-in pointer-events-auto backdrop-blur-md`;
  toast.innerHTML = `<span>${escapeHtml(message)}</span>`;

  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 3500);
}
