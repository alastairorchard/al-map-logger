// AL - Map & Event Logger (Multi-Photo Instagram Carousel, Multi-User Cloud Sync)

const DEFAULT_SUPABASE_URL = 'https://bfwlzobdpbuippfbbjud.supabase.co';
const DEFAULT_SUPABASE_KEY = 'sb_publishable_PcDpOFZptvEbE0wL8qDyLA_uqqkkf0A';

// Clear legacy broken storage keys on startup
try {
  localStorage.removeItem('al_supabase_key');
  localStorage.removeItem('al_supabase_url');
} catch (e) {}

// State Management
let state = {
  activeTab: 'map',
  currentUser: null,
  authToken: localStorage.getItem('al_auth_token') || null,
  authMode: 'login',
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
  supabase: null,
  cloudConfig: {
    url: DEFAULT_SUPABASE_URL,
    key: DEFAULT_SUPABASE_KEY
  },
  modalPhotos: [], // Temporary photos array during event creation/editing
  lightbox: {
    photos: [],
    currentIndex: 0,
    caption: ''
  }
};

let map = null;
let markersLayer = null;
let searchDebounceTimer = null;

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  initIcons();
  initMap();
  initCloudClient();
  checkAuthAndLoad();
  setDefaultEventDate();
  initKeyboardNav();
});

function initIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function initKeyboardNav() {
  window.addEventListener('keydown', (e) => {
    const lightboxModal = document.getElementById('modal-lightbox');
    if (lightboxModal && !lightboxModal.classList.contains('hidden')) {
      if (e.key === 'ArrowLeft') lightboxNav(-1);
      if (e.key === 'ArrowRight') lightboxNav(1);
      if (e.key === 'Escape') closeModal('modal-lightbox');
    }
  });
}

// ==========================================
// HELPER: EXTRACT PHOTO ARRAY FROM EVENT RECORD
// ==========================================
function getEventPhotos(evt) {
  if (!evt) return [];
  if (Array.isArray(evt.photos)) return evt.photos.filter(Boolean);
  let raw = evt.photo_url || '';
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(Boolean);

  if (typeof raw === 'string') {
    raw = raw.trim();
    if (raw.startsWith('[') && raw.endsWith(']')) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.filter(Boolean);
      } catch (e) {}
    }
    if (raw.startsWith('"[') && raw.endsWith(']"')) {
      try {
        const parsed = JSON.parse(JSON.parse(raw));
        if (Array.isArray(parsed)) return parsed.filter(Boolean);
      } catch (e) {}
    }
    if (raw.includes('|||')) {
      return raw.split('|||').map(s => s.trim()).filter(Boolean);
    }
    if (raw.includes(',') && !raw.startsWith('data:image')) {
      return raw.split(',').map(s => s.trim()).filter(Boolean);
    }
    return [raw];
  }
  return [];
}

// ==========================================
// INSTAGRAM-STYLE PHOTO CAROUSEL GENERATOR
// ==========================================
function renderInstagramCarousel(photos, evtName, heightClass = 'h-52') {
  if (!photos || photos.length === 0) return '';
  const photosJson = JSON.stringify(photos).replace(/"/g, '&quot;');

  if (photos.length === 1) {
    return `
      <div class="${heightClass} rounded-2xl overflow-hidden relative group cursor-pointer bg-dark-950 border border-slate-700/60" onclick="openLightboxCarousel(${photosJson}, 0, '${escapeHtml(evtName)}')">
        <img src="${escapeHtml(photos[0])}" alt="${escapeHtml(evtName)}" class="w-full h-full object-cover group-hover:scale-105 transition duration-500">
        <div class="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition flex items-center justify-center opacity-0 group-hover:opacity-100">
          <i data-lucide="maximize-2" class="w-6 h-6 text-white drop-shadow"></i>
        </div>
      </div>
    `;
  }

  const carouselId = `car_${Math.random().toString(36).slice(2, 8)}`;

  return `
    <div class="${heightClass} rounded-2xl overflow-hidden relative group bg-dark-950 border border-slate-700/60 select-none">
      <!-- Horizontal Scroll Track with Snap -->
      <div id="${carouselId}" class="flex overflow-x-auto snap-x snap-mandatory scrollbar-none scroll-smooth w-full h-full" onscroll="handleCarouselScroll('${carouselId}', ${photos.length})">
        ${photos.map((url, idx) => `
          <div class="snap-center shrink-0 w-full h-full relative cursor-pointer" onclick="openLightboxCarousel(${photosJson}, ${idx}, '${escapeHtml(evtName)}')">
            <img src="${escapeHtml(url)}" alt="${escapeHtml(evtName)} (${idx + 1})" class="w-full h-full object-cover">
          </div>
        `).join('')}
      </div>

      <!-- Left Arrow Button (Desktop hover) -->
      <button type="button" onclick="event.stopPropagation(); scrollCarousel('${carouselId}', -1)" class="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/60 hover:bg-black/80 text-white opacity-0 group-hover:opacity-100 transition shadow-lg z-10">
        <i data-lucide="chevron-left" class="w-4 h-4"></i>
      </button>

      <!-- Right Arrow Button (Desktop hover) -->
      <button type="button" onclick="event.stopPropagation(); scrollCarousel('${carouselId}', 1)" class="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/60 hover:bg-black/80 text-white opacity-0 group-hover:opacity-100 transition shadow-lg z-10">
        <i data-lucide="chevron-right" class="w-4 h-4"></i>
      </button>

      <!-- Multi-photo count badge -->
      <div class="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-full bg-black/75 backdrop-blur-md text-[10px] font-bold text-white flex items-center gap-1 border border-white/20 z-10 pointer-events-none">
        <i data-lucide="layers" class="w-3 h-3 text-brand-300"></i>
        <span>1 / ${photos.length}</span>
      </div>

      <!-- Instagram Pagination Dots -->
      <div id="${carouselId}-dots" class="absolute bottom-2.5 left-0 right-0 flex justify-center items-center gap-1.5 pointer-events-none z-10">
        ${photos.map((_, i) => `
          <span class="w-1.5 h-1.5 rounded-full transition-all duration-300 ${i === 0 ? 'bg-white w-4' : 'bg-white/40'}"></span>
        `).join('')}
      </div>
    </div>
  `;
}

function scrollCarousel(carouselId, direction) {
  const container = document.getElementById(carouselId);
  if (!container) return;
  const width = container.clientWidth;
  container.scrollBy({ left: direction * width, behavior: 'smooth' });
}

function handleCarouselScroll(carouselId, total) {
  const container = document.getElementById(carouselId);
  const dotsContainer = document.getElementById(`${carouselId}-dots`);
  if (!container || !dotsContainer) return;

  const width = container.clientWidth;
  const scrollLeft = container.scrollLeft;
  const currentIndex = Math.round(scrollLeft / width);

  const dots = dotsContainer.children;
  for (let i = 0; i < dots.length; i++) {
    if (i === currentIndex) {
      dots[i].className = 'w-4 h-1.5 rounded-full bg-white transition-all duration-300 shadow';
    } else {
      dots[i].className = 'w-1.5 h-1.5 rounded-full bg-white/40 transition-all duration-300';
    }
  }
}

// ==========================================
// LIGHTBOX MULTI-PHOTO VIEWER
// ==========================================
function openLightboxCarousel(photos, startIndex = 0, caption = '') {
  if (!photos || photos.length === 0) return;
  state.lightbox = {
    photos: Array.isArray(photos) ? photos : [photos],
    currentIndex: startIndex >= 0 && startIndex < photos.length ? startIndex : 0,
    caption: caption || ''
  };
  updateLightboxView();
  openModal('modal-lightbox');
}

function lightboxNav(direction) {
  const { photos, currentIndex } = state.lightbox;
  if (!photos || photos.length <= 1) return;
  let newIdx = currentIndex + direction;
  if (newIdx < 0) newIdx = photos.length - 1;
  if (newIdx >= photos.length) newIdx = 0;
  state.lightbox.currentIndex = newIdx;
  updateLightboxView();
}

function updateLightboxView() {
  const { photos, currentIndex, caption } = state.lightbox;
  if (!photos || photos.length === 0) return;

  const currentUrl = photos[currentIndex];
  document.getElementById('lightbox-img').src = currentUrl;
  document.getElementById('lightbox-caption').innerText = caption;
  document.getElementById('lightbox-counter').innerText = `${currentIndex + 1} of ${photos.length}`;

  const prevBtn = document.getElementById('lightbox-prev-btn');
  const nextBtn = document.getElementById('lightbox-next-btn');
  if (prevBtn && nextBtn) {
    const showArrows = photos.length > 1;
    prevBtn.style.display = showArrows ? 'flex' : 'none';
    nextBtn.style.display = showArrows ? 'flex' : 'none';
  }
  initIcons();
}

// ==========================================
// SUPABASE CLOUD CLIENT & REAL-TIME AUTH LISTENER
// ==========================================
function initCloudClient() {
  if (state.cloudConfig.url && state.cloudConfig.key && window.supabase) {
    try {
      state.supabase = window.supabase.createClient(state.cloudConfig.url, state.cloudConfig.key);
      updateCloudStatusUI(true);

      state.supabase.auth.onAuthStateChange((event, session) => {
        if (session && session.user) {
          state.currentUser = {
            id: session.user.id,
            username: session.user.email ? session.user.email.split('@')[0] : 'User',
            email: session.user.email
          };
          state.authToken = session.access_token;
          renderUserHeader();
          renderProfileTab();
          closeModal('modal-auth');
          loadAllData();
        } else if (event === 'SIGNED_OUT') {
          state.currentUser = null;
          state.authToken = null;
          state.locations = [];
          state.events = [];
          renderUserHeader();
          renderProfileTab();
          openAuthModal('login');
        }
      });
    } catch (e) {
      console.warn('Supabase initialization failed:', e);
      state.supabase = null;
      updateCloudStatusUI(false);
    }
  } else {
    state.supabase = null;
    updateCloudStatusUI(false);
  }
}

function updateCloudStatusUI(connected) {
  const dot = document.getElementById('cloud-status-dot');
  const text = document.getElementById('cloud-status-text');
  if (dot && text) {
    if (connected) {
      dot.className = 'w-2 h-2 rounded-full bg-emerald-400';
      text.innerText = 'Cloud Sync: Active';
    } else {
      dot.className = 'w-2 h-2 rounded-full bg-amber-400 animate-pulse';
      text.innerText = 'Connect Cloud';
    }
  }
}

function openCloudConfigModal() {
  document.getElementById('cloud-input-url').value = state.cloudConfig.url;
  document.getElementById('cloud-input-key').value = state.cloudConfig.key;
  openModal('modal-cloud-config');
}

function handleCloudConfigSubmit(e) {
  e.preventDefault();
  const url = document.getElementById('cloud-input-url').value.trim();
  const key = document.getElementById('cloud-input-key').value.trim();

  if (!url || !key) {
    showToast('Please enter both Project URL and Anon Key', 'error');
    return;
  }

  localStorage.setItem('al_supabase_url', url);
  localStorage.setItem('al_supabase_key', key);
  state.cloudConfig = { url, key };

  initCloudClient();
  closeModal('modal-cloud-config');
  showToast('Cloud database connected! ⭐', 'success');
  logout(false);
  openAuthModal('login');
}

function disconnectCloudSync() {
  localStorage.removeItem('al_supabase_url');
  localStorage.removeItem('al_supabase_key');
  state.cloudConfig = { url: '', key: '' };
  state.supabase = null;
  updateCloudStatusUI(false);
  closeModal('modal-cloud-config');
  showToast('Reset to local mode', 'info');
  logout(false);
}

// ==========================================
// CLIENT-SIDE DATABASE WITH STRICT PER-USER STORAGE
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
    if (!userId) return [];
    try {
      return JSON.parse(localStorage.getItem(`al_user_${userId}_locations`) || '[]');
    } catch (e) {
      return [];
    }
  },
  saveLocations(locations, userId) {
    if (!userId) return;
    localStorage.setItem(`al_user_${userId}_locations`, JSON.stringify(locations));
  },
  getEvents(userId) {
    if (!userId) return [];
    try {
      return JSON.parse(localStorage.getItem(`al_user_${userId}_events`) || '[]');
    } catch (e) {
      return [];
    }
  },
  saveEvents(events, userId) {
    if (!userId) return;
    localStorage.setItem(`al_user_${userId}_events`, JSON.stringify(events));
  },
  changePassword(userId, currentPassword, newPassword) {
    const users = this.getUsers();
    const user = users.find(u => u.id === userId);
    if (!user || user.password !== currentPassword) {
      return Promise.resolve({ status: 401, data: { error: 'Current password is incorrect.' } });
    }
    user.password = newPassword;
    this.saveUsers(users);
    return Promise.resolve({ status: 200, data: { success: true, message: 'Password changed successfully!' } });
  }
};

// ==========================================
// AUTHENTICATION CLIENT LOGIC
// ==========================================
function checkAuthAndLoad() {
  if (state.supabase) {
    state.supabase.auth.getSession().then(({ data, error }) => {
      if (data && data.session && data.session.user) {
        state.currentUser = {
          id: data.session.user.id,
          username: data.session.user.email ? data.session.user.email.split('@')[0] : 'User',
          email: data.session.user.email
        };
        state.authToken = data.session.access_token;
        renderUserHeader();
        renderProfileTab();
        closeModal('modal-auth');
        loadAllData();
      } else {
        renderUserHeader();
        renderProfileTab();
        openAuthModal('login');
      }
    });
    return;
  }

  if (!state.authToken) {
    renderUserHeader();
    renderProfileTab();
    openAuthModal('login');
    return;
  }

  fetchWithAuth('/api/auth/me')
    .then(res => {
      if (!res.ok) {
        if (res.status === 404 || res.status === 405) {
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
        renderProfileTab();
        closeModal('modal-auth');
        loadAllData();
      }
    })
    .catch(() => {
      loadClientSession();
    });
}

function loadClientSession() {
  const token = state.authToken;
  if (!token) {
    renderUserHeader();
    renderProfileTab();
    openAuthModal('login');
    return;
  }

  try {
    const rawUser = localStorage.getItem('al_current_user');
    if (rawUser) {
      state.currentUser = JSON.parse(rawUser);
      renderUserHeader();
      renderProfileTab();
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

  return fetch(url, options).catch(() => {
    return new Response(JSON.stringify({ error: 'Static host' }), { status: 404 });
  });
}

function renderUserHeader() {
  const container = document.getElementById('user-header-container');
  if (!container) return;

  if (state.currentUser) {
    const initials = (state.currentUser.email || state.currentUser.username || 'AL').slice(0, 2).toUpperCase();
    container.innerHTML = `
      <div class="flex items-center gap-1.5">
        <button onclick="switchTab('profile')" class="flex items-center gap-2 bg-dark-700/80 hover:bg-dark-600 px-2.5 py-1.5 rounded-xl border border-slate-700 transition" title="View Account">
          <div class="w-6 h-6 rounded-lg bg-gradient-to-tr from-brand-600 to-accent-500 text-white font-black text-xs flex items-center justify-center">
            ${initials}
          </div>
          <span class="text-xs font-bold text-white max-w-[110px] truncate">${escapeHtml(state.currentUser.email || state.currentUser.username)}</span>
        </button>
        <button onclick="logout(true)" class="p-2 rounded-xl text-slate-400 hover:text-red-400 hover:bg-dark-700 transition" title="Sign Out">
          <i data-lucide="log-out" class="w-4 h-4"></i>
        </button>
      </div>
    `;
  } else {
    container.innerHTML = `
      <button onclick="openAuthModal('login')" class="px-3 py-1.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold shadow-lg shadow-brand-600/30 transition">
        Sign In
      </button>
    `;
  }
  initIcons();
}

function renderProfileTab() {
  const initialsEl = document.getElementById('profile-avatar-initials');
  const nameEl = document.getElementById('profile-display-name');
  const emailEl = document.getElementById('profile-display-email');

  if (state.currentUser) {
    const initials = (state.currentUser.email || state.currentUser.username || 'AL').slice(0, 2).toUpperCase();
    if (initialsEl) initialsEl.innerText = initials;
    if (nameEl) nameEl.innerText = state.currentUser.username || 'User';
    if (emailEl) emailEl.innerText = state.currentUser.email || 'No email associated';
  } else {
    if (nameEl) nameEl.innerText = 'Guest (Not Signed In)';
    if (emailEl) emailEl.innerText = 'Please sign in to sync your data';
  }
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

  document.getElementById('auth-submit-btn').innerText = isReg ? 'Create Account' : 'Sign In';
}

function handleAuthSubmit(e) {
  e.preventDefault();
  const rawInput = document.getElementById('auth-input-email').value.trim();
  const password = document.getElementById('auth-input-password').value;

  const authEmail = rawInput.includes('@') ? rawInput.toLowerCase() : `${rawInput.toLowerCase()}@al-map.app`;

  if (state.supabase) {
    const redirectUrl = window.location.origin + window.location.pathname;
    if (state.authMode === 'register') {
      state.supabase.auth.signUp({
        email: authEmail,
        password: password,
        options: { emailRedirectTo: redirectUrl }
      }).then(({ data, error }) => {
        if (error) {
          if (error.message && error.message.toLowerCase().includes('already registered')) {
            return state.supabase.auth.signInWithPassword({ email: authEmail, password }).then(({ data: logData, error: logErr }) => {
              if (logErr) {
                showToast('Email already exists. Please check password.', 'error');
              } else {
                showToast('Signed in successfully! ⭐', 'success');
                checkAuthAndLoad();
              }
            });
          }
          showToast(error.message, 'error');
          return;
        }

        state.supabase.auth.signInWithPassword({ email: authEmail, password }).then(({ data: logData, error: logErr }) => {
          if (!logErr && logData && logData.session) {
            showToast('Account created & signed in! ⭐', 'success');
            checkAuthAndLoad();
          } else {
            showToast('Account created! Signing in...', 'success');
            checkAuthAndLoad();
          }
        });
      });
    } else {
      state.supabase.auth.signInWithPassword({ email: authEmail, password }).then(({ data, error }) => {
        if (error) {
          showToast(error.message, 'error');
          return;
        }
        showToast('Signed in successfully! ⭐', 'success');
        checkAuthAndLoad();
      });
    }
    return;
  }

  const endpoint = state.authMode === 'register' ? '/api/auth/register' : '/api/auth/login';
  const payload = { username: authEmail.split('@')[0], email: authEmail, password };

  fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
    .then(r => {
      if (r.status === 404 || r.status === 405) {
        return handleClientAuth(state.authMode, authEmail.split('@')[0], password, authEmail);
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
      renderProfileTab();
      showToast(state.authMode === 'register' ? 'Welcome to AL! 🎉 Account created.' : `Welcome back, ${data.user.username}! ⚡`, 'success');
      loadAllData();
    })
    .catch(() => {
      handleClientAuth(state.authMode, authEmail.split('@')[0], password, authEmail).then(({ status, data }) => {
        if (status < 400) {
          state.authToken = data.token;
          state.currentUser = data.user;
          localStorage.setItem('al_auth_token', data.token);
          localStorage.setItem('al_current_user', JSON.stringify(data.user));
          closeModal('modal-auth');
          renderUserHeader();
          renderProfileTab();
          showToast(`Welcome, ${data.user.username}!`, 'success');
          loadAllData();
        } else {
          showToast(data.error || 'Authentication error', 'error');
        }
      });
    });
}

function handleClientAuth(mode, username, password, email) {
  const users = ClientDB.getUsers();
  const cleanUsername = username.toLowerCase();

  if (mode === 'register') {
    if (users.find(u => u.username === cleanUsername)) {
      return Promise.resolve({ status: 409, data: { error: 'Username already registered.' } });
    }
    const user = {
      id: `usr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      username: cleanUsername,
      email: email || '',
      password: password
    };
    users.push(user);
    ClientDB.saveUsers(users);
    ClientDB.saveLocations([], user.id);
    ClientDB.saveEvents([], user.id);

    return Promise.resolve({
      status: 201,
      data: { user: { id: user.id, username: user.username, email: user.email }, token: `client_token_${user.id}` }
    });
  } else {
    const user = users.find(u => (u.username === cleanUsername || u.email === email) && u.password === password);
    if (!user) {
      return Promise.resolve({ status: 401, data: { error: 'Invalid email or password.' } });
    }
    return Promise.resolve({
      status: 200,
      data: { user: { id: user.id, username: user.username, email: user.email }, token: `client_token_${user.id}` }
    });
  }
}

// ==========================================
// CHANGE PASSWORD
// ==========================================
function openChangePasswordModal() {
  document.getElementById('pass-input-current').value = '';
  document.getElementById('pass-input-new').value = '';
  document.getElementById('pass-input-confirm').value = '';
  openModal('modal-password');
}

function handleChangePasswordSubmit(e) {
  e.preventDefault();
  const currentPassword = document.getElementById('pass-input-current').value;
  const newPassword = document.getElementById('pass-input-new').value;
  const confirmPassword = document.getElementById('pass-input-confirm').value;

  if (newPassword !== confirmPassword) {
    showToast('New passwords do not match!', 'error');
    return;
  }
  if (newPassword.length < 4) {
    showToast('Password must be at least 4 characters long.', 'error');
    return;
  }

  if (state.supabase) {
    state.supabase.auth.updateUser({ password: newPassword }).then(({ data, error }) => {
      if (error) {
        showToast(error.message, 'error');
      } else {
        closeModal('modal-password');
        showToast('Password updated in Supabase cloud! 🔒', 'success');
      }
    });
    return;
  }

  fetchWithAuth('/api/auth/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentPassword, newPassword })
  })
    .then(r => {
      if (r.status === 404 || r.status === 405) {
        return ClientDB.changePassword(state.currentUser.id, currentPassword, newPassword);
      }
      return r.json().then(data => ({ status: r.status, data }));
    })
    .then(({ status, data }) => {
      if (status >= 400) {
        showToast(data.error || 'Failed to update password', 'error');
        return;
      }
      closeModal('modal-password');
      showToast('Password updated successfully! 🔒', 'success');
    })
    .catch(() => {
      ClientDB.changePassword(state.currentUser.id, currentPassword, newPassword).then(({ status, data }) => {
        if (status >= 400) {
          showToast(data.error || 'Failed to update password', 'error');
        } else {
          closeModal('modal-password');
          showToast('Password updated successfully! 🔒', 'success');
        }
      });
    });
}

function logout(notify = true) {
  if (state.supabase) {
    state.supabase.auth.signOut();
  }

  state.authToken = null;
  state.currentUser = null;
  state.locations = [];
  state.events = [];
  state.kpis = null;
  localStorage.removeItem('al_auth_token');
  localStorage.removeItem('al_current_user');

  renderUserHeader();
  renderProfileTab();
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

  ['map', 'events', 'kpis', 'favorites', 'profile'].forEach(t => {
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
  } else if (tabId === 'profile') {
    renderProfileTab();
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

  const editLocBtn = document.getElementById('drawer-edit-loc-btn');
  if (editLocBtn) {
    editLocBtn.onclick = () => editLocation(loc.id);
  }

  const delLocBtn = document.getElementById('drawer-delete-loc-btn');
  if (delLocBtn) {
    delLocBtn.onclick = () => deleteLocation(loc.id, loc.name);
  }

  if (state.supabase) {
    state.supabase.from('events').select('*').eq('location_id', loc.id).order('date', { ascending: false }).then(({ data, error }) => {
      renderDrawerEventsList(data || []);
    });
  } else {
    const evts = state.events.filter(e => e.location_id === loc.id);
    renderDrawerEventsList(evts);
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

  container.innerHTML = events.map(evt => {
    const photos = getEventPhotos(evt);
    return `
      <div class="bg-dark-900/90 rounded-2xl border border-slate-800 p-3 hover:border-slate-700 transition flex flex-col gap-2.5">
        ${renderInstagramCarousel(photos, evt.name, 'h-44')}
        
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
    `;
  }).join('');

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
  if (!state.currentUser) return;

  if (state.supabase) {
    Promise.all([
      state.supabase.from('locations').select('*').order('created_at', { ascending: false }),
      state.supabase.from('events').select('*').order('date', { ascending: false })
    ]).then(([locRes, evtRes]) => {
      const rawLocs = locRes.data || [];
      const rawEvts = evtRes.data || [];

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

      state.kpis = computeKPIsFromState(state.locations, state.events);

      updateLocationSelectOptions();
      renderMapMarkers();
      renderLocationCarousel();
      loadEventsTable();
      loadKPIs();
    });
    return;
  }

  loadFromClientDB();
}

function loadFromClientDB() {
  const uid = state.currentUser.id;
  const rawLocs = ClientDB.getLocations(uid);
  const rawEvts = ClientDB.getEvents(uid);

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

  state.kpis = computeKPIsFromState(state.locations, state.events);

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
  if (!state.currentUser) return;

  const search = (document.getElementById('events-search-filter')?.value || '').trim().toLowerCase();
  const locationId = document.getElementById('events-location-filter')?.value || '';
  const minScore = document.getElementById('events-score-filter')?.value || '';
  const sortOption = document.getElementById('events-sort-filter')?.value || 'date_desc';

  let [sort, order] = sortOption.split('_');
  if (!sort) sort = 'date';
  if (!order) order = 'desc';

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

  tbody.innerHTML = events.map(evt => {
    const photos = getEventPhotos(evt);
    const photosJson = JSON.stringify(photos).replace(/"/g, '&quot;');
    return `
      <tr class="hover:bg-dark-700/50 transition duration-150">
        <td class="px-4 py-3">
          ${photos.length > 0 ? `
            <div class="w-12 h-12 rounded-xl overflow-hidden bg-dark-900 cursor-pointer group relative border border-slate-700" onclick="openLightboxCarousel(${photosJson}, 0, '${escapeHtml(evt.name)}')">
              <img src="${escapeHtml(photos[0])}" alt="Thumb" class="w-full h-full object-cover group-hover:scale-110 transition duration-200">
              ${photos.length > 1 ? `
                <div class="absolute bottom-0.5 right-0.5 bg-black/80 px-1 py-0.2 rounded text-[9px] font-black text-white">
                  +${photos.length - 1}
                </div>
              ` : ''}
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
    `;
  }).join('');

  initIcons();
}

// ==========================================
// KPIS & CHARTS LOGIC
// ==========================================
function computeKPIsFromState(locs = [], evts = []) {
  const totalEvents = evts.length;
  const totalLocations = locs.length;
  const totalFavorites = evts.filter(e => e.favorite === 1 || e.favorite === true).length;
  
  const avgScoreOverall = totalEvents > 0
    ? evts.reduce((sum, e) => sum + (parseFloat(e.score) || 0), 0) / totalEvents
    : 0;

  const eventsPerLocation = totalLocations > 0 ? totalEvents / totalLocations : 0;

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

  const withEvents = locStats.filter(l => l.event_count >= 1);
  withEvents.sort((a, b) => b.avg_score - a.avg_score || b.event_count - a.event_count);
  const favoriteByScore = withEvents.length > 0 ? withEvents[0] : null;

  const byFreq = [...locStats].sort((a, b) => b.event_count - a.event_count || b.avg_score - a.avg_score);
  const mostFrequented = byFreq.length > 0 && byFreq[0].event_count > 0 ? byFreq[0] : null;

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

  const scoreDistribution = [
    { range: '9.0 - 10.0', count: evts.filter(e => parseFloat(e.score) >= 9.0).length },
    { range: '7.0 - 8.9', count: evts.filter(e => parseFloat(e.score) >= 7.0 && parseFloat(e.score) < 9.0).length },
    { range: '5.0 - 6.9', count: evts.filter(e => parseFloat(e.score) >= 5.0 && parseFloat(e.score) < 7.0).length },
    { range: '3.0 - 4.9', count: evts.filter(e => parseFloat(e.score) >= 3.0 && parseFloat(e.score) < 5.0).length },
    { range: '1.0 - 2.9', count: evts.filter(e => parseFloat(e.score) < 3.0).length }
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

function loadKPIs() {
  if (!state.currentUser) return;
  state.kpis = computeKPIsFromState(state.locations, state.events);
  renderKPIDashboard(state.kpis);
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
  if (!state.currentUser) return;

  const favs = state.events.filter(e => e.favorite === 1 || e.favorite === true);
  renderFavoritesGrid(favs);
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

  grid.innerHTML = events.map(evt => {
    const photos = getEventPhotos(evt);
    return `
      <div class="bg-dark-800 rounded-3xl overflow-hidden border border-slate-700/80 shadow-xl flex flex-col hover:border-amber-500/40 transition duration-300 group">
        ${renderInstagramCarousel(photos, evt.name, 'h-52')}

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
    `;
  }).join('');

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
  if (!state.currentUser) {
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

function editLocation(id) {
  const loc = state.locations.find(l => l.id === id);
  if (!loc) return;

  document.getElementById('location-modal-title').innerHTML = `<i data-lucide="edit-3" class="w-5 h-5 text-brand-400"></i> Edit Location`;
  document.getElementById('loc-input-id').value = loc.id;
  document.getElementById('loc-input-name').value = loc.name;
  document.getElementById('loc-input-address').value = loc.address || '';
  document.getElementById('loc-input-notes').value = loc.notes || '';
  document.getElementById('loc-input-category').value = loc.category || 'Other';
  document.getElementById('loc-input-lat').value = parseFloat(loc.lat).toFixed(6);
  document.getElementById('loc-input-lng').value = parseFloat(loc.lng).toFixed(6);

  openModal('modal-location');
}

async function deleteLocation(locationId, locationName = 'this location') {
  const confirmMsg = `Are you sure you want to delete "${locationName}"?\n\n⚠️ WARNING: All events and photos logged at this location will be permanently deleted as well.`;
  if (!confirm(confirmMsg)) return;

  if (state.supabase) {
    showToast('Deleting location & events...', 'info');
    await state.supabase.from('events').delete().eq('location_id', locationId);
    const { error } = await state.supabase.from('locations').delete().eq('id', locationId);
    if (error) {
      showToast(error.message, 'error');
      return;
    }
    closeLocationDrawer();
    closeModal('modal-location');
    showToast(`"${locationName}" and all associated events deleted! 🗑️`, 'info');
    loadAllData();
    return;
  }

  const uid = state.currentUser ? state.currentUser.id : null;
  let locs = ClientDB.getLocations(uid).filter(l => l.id !== locationId);
  let evts = ClientDB.getEvents(uid).filter(e => e.location_id !== locationId);
  ClientDB.saveLocations(locs, uid);
  ClientDB.saveEvents(evts, uid);

  closeLocationDrawer();
  closeModal('modal-location');
  showToast(`"${locationName}" and all associated events deleted! 🗑️`, 'info');
  loadAllData();
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

  if (state.supabase) {
    const locId = id || `loc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    state.supabase.from('locations').upsert({ id: locId, ...payload, user_id: state.currentUser.id }).then(({ data, error }) => {
      if (error) {
        showToast(error.message, 'error');
      } else {
        closeModal('modal-location');
        showToast('Location saved to Cloud! ⭐', 'success');
        loadAllData();
        if (map && !id) map.flyTo([lat, lng], 14);
      }
    });
    return;
  }

  handleClientLocationSave(id, payload).then(() => {
    closeModal('modal-location');
    showToast('Location saved!', 'success');
    loadAllData();
    if (map && !id) map.flyTo([lat, lng], 14);
  });
}

function handleClientLocationSave(id, payload) {
  const uid = state.currentUser.id;
  let locs = ClientDB.getLocations(uid);
  if (id) {
    locs = locs.map(l => l.id === id ? { ...l, ...payload, updated_at: Date.now() } : l);
  } else {
    const newLoc = {
      id: `loc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
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

// ==========================================
// MULTI-PHOTO EVENT MODAL MANAGEMENT
// ==========================================
function openAddEventModal(locationId = null) {
  if (!state.currentUser) {
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
  state.modalPhotos = [];
  renderPhotoThumbnailsGrid();
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

  state.modalPhotos = getEventPhotos(evt);
  renderPhotoThumbnailsGrid();

  openModal('modal-event');
}

function renderPhotoThumbnailsGrid() {
  const grid = document.getElementById('photo-thumbnails-grid');
  const countBadge = document.getElementById('photo-count-badge');
  if (!grid) return;

  const count = state.modalPhotos.length;
  if (countBadge) {
    if (count > 0) {
      countBadge.innerText = `${count} photo${count === 1 ? '' : 's'} attached`;
      countBadge.classList.remove('hidden');
    } else {
      countBadge.classList.add('hidden');
    }
  }

  if (count === 0) {
    grid.innerHTML = '';
    return;
  }

  grid.innerHTML = state.modalPhotos.map((url, idx) => `
    <div class="relative h-20 rounded-xl overflow-hidden bg-dark-950 border border-slate-700 group">
      <img src="${escapeHtml(url)}" alt="Photo ${idx + 1}" class="w-full h-full object-cover">
      <button type="button" onclick="removePhotoAtIndex(${idx})" class="absolute top-1 right-1 p-1 bg-black/80 hover:bg-red-600 text-white rounded-full transition shadow" title="Remove Photo">
        <i data-lucide="x" class="w-3 h-3"></i>
      </button>
      <span class="absolute bottom-1 left-1 px-1.5 py-0.2 rounded bg-black/70 text-[9px] font-bold text-slate-300">
        #${idx + 1}
      </span>
    </div>
  `).join('') + `
    <label class="h-20 rounded-xl border border-dashed border-slate-600 hover:border-brand-500 bg-dark-900 hover:bg-dark-700/80 cursor-pointer flex flex-col items-center justify-center gap-1 transition text-slate-400 hover:text-brand-300">
      <i data-lucide="plus" class="w-5 h-5"></i>
      <span class="text-[10px] font-bold">+ Add More</span>
      <input type="file" multiple accept="image/*" class="hidden" onchange="handleMultiplePhotosSelected(this)">
    </label>
  `;

  initIcons();
}

function removePhotoAtIndex(index) {
  state.modalPhotos.splice(index, 1);
  renderPhotoThumbnailsGrid();
}

function addPhotoUrlFromInput() {
  const input = document.getElementById('evt-input-photo-url');
  if (!input) return;
  const val = input.value.trim();
  if (!val) return;

  state.modalPhotos.push(val);
  input.value = '';
  renderPhotoThumbnailsGrid();
  showToast('Photo URL added!', 'success');
}

function compressImageFile(file, maxWidth = 1200, quality = 0.82) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxWidth || height > maxWidth) {
          if (width > height) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxWidth) / height);
            height = maxWidth;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.onerror = () => resolve(e.target.result);
      img.src = e.target.result;
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

async function handleMultiplePhotosSelected(input) {
  if (!input.files || input.files.length === 0) return;
  const files = Array.from(input.files);

  showToast(`Processing ${files.length} photo${files.length === 1 ? '' : 's'}...`, 'info');

  for (const file of files) {
    const compressedDataUrl = await compressImageFile(file);
    if (compressedDataUrl) {
      state.modalPhotos.push(compressedDataUrl);
      renderPhotoThumbnailsGrid();

      // Parallel upload to Supabase storage if available
      if (state.supabase) {
        const filename = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '')}`;
        state.supabase.storage.from('photos').upload(filename, file, { upsert: true }).then(({ data, error }) => {
          if (!error) {
            const { data: publicUrlData } = state.supabase.storage.from('photos').getPublicUrl(filename);
            if (publicUrlData && publicUrlData.publicUrl) {
              const idx = state.modalPhotos.indexOf(compressedDataUrl);
              if (idx !== -1) {
                state.modalPhotos[idx] = publicUrlData.publicUrl;
                renderPhotoThumbnailsGrid();
              }
            }
          }
        }).catch(() => {});
      }
    }
  }

  input.value = '';
  showToast(`${files.length} photo${files.length === 1 ? '' : 's'} added! 📸`, 'success');
}

function handleEventSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('evt-input-id').value;
  const location_id = document.getElementById('evt-input-location-id').value;
  const name = document.getElementById('evt-input-name').value;
  const date = document.getElementById('evt-input-date').value;
  const score = parseFloat(document.getElementById('evt-input-score').value);
  const description = document.getElementById('evt-input-description').value;
  const favorite = document.getElementById('evt-input-favorite').checked ? 1 : 0;

  // Serialize photos as JSON array string
  const photo_url = JSON.stringify(state.modalPhotos);

  const payload = { location_id, name, date, score, description, photo_url, favorite };

  if (state.supabase) {
    const evtId = id || `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    state.supabase.from('events').upsert({ id: evtId, ...payload, user_id: state.currentUser.id }).then(({ data, error }) => {
      if (error) {
        showToast(error.message, 'error');
      } else {
        closeModal('modal-event');
        showToast('Event and photos saved to Cloud! ⭐', 'success');
        loadAllData();
        if (state.selectedLocation && state.selectedLocation.id === location_id) {
          openLocationDrawer(state.selectedLocation);
        }
      }
    });
    return;
  }

  handleClientEventSave(id, payload).then(() => {
    closeModal('modal-event');
    showToast('Event saved! ⭐', 'success');
    loadAllData();
    if (state.selectedLocation && state.selectedLocation.id === location_id) {
      openLocationDrawer(state.selectedLocation);
    }
  });
}

function handleClientEventSave(id, payload) {
  const uid = state.currentUser.id;
  let evts = ClientDB.getEvents(uid);
  if (id) {
    evts = evts.map(e => e.id === id ? { ...e, ...payload, updated_at: Date.now() } : e);
  } else {
    const newEvt = {
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
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

  if (state.supabase) {
    const evt = state.events.find(x => x.id === id);
    if (!evt) return;
    const newFav = evt.favorite === 1 ? 0 : 1;
    state.supabase.from('events').update({ favorite: newFav }).eq('id', id).then(() => {
      showToast(newFav ? 'Added to favorites! ⭐' : 'Removed from favorites', 'info');
      loadAllData();
    });
    return;
  }

  toggleClientFavorite(id).then(res => {
    showToast(res.favorite ? 'Added to favorites! ⭐' : 'Removed from favorites', 'info');
    loadAllData();
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

  if (state.supabase) {
    state.supabase.from('events').delete().eq('id', id).then(() => {
      showToast('Event deleted from Cloud', 'info');
      loadAllData();
    });
    return;
  }

  deleteClientEvent(id).then(() => {
    showToast('Event deleted', 'info');
    loadAllData();
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
  
  const photos = getEventPhotos(evt);
  const img = document.getElementById('share-img');
  img.src = photos.length > 0 ? photos[0] : 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80';

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

// ==========================================
// EXPORTS (JSON & CSV)
// ==========================================
function exportDataJSON() {
  const data = {
    app: 'AL',
    version: '1.0.0',
    user: state.currentUser ? (state.currentUser.email || state.currentUser.username) : 'Guest',
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
  const headers = ['ID', 'Event Name', 'Location', 'Category', 'Date', 'Score', 'Favorite', 'Description', 'Photos Count', 'Photo URLs'];
  const rows = events.map(e => {
    const photos = getEventPhotos(e);
    return [
      `"${e.id}"`,
      `"${escapeCsv(e.name)}"`,
      `"${escapeCsv(e.location_name)}"`,
      `"${escapeCsv(e.location_category || '')}"`,
      `"${e.date}"`,
      e.score,
      e.favorite ? 'Yes' : 'No',
      `"${escapeCsv(e.description || '')}"`,
      photos.length,
      `"${escapeCsv(photos.join(' ; '))}"`
    ];
  });

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
