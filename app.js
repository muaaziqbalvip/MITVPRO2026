// ============================================================
// MITV Admin Panel — Firebase-backed content & user management
// Matches the Android app's MediaItem model exactly:
//   /live_channels/{id}, /movies/{id}, /series/{seriesId}, /series/{seriesId}/episodes/{id}
//   /series_index/{seriesId}  (lightweight "show card" entries the app reads for its Series row)
//   /users/{uid}/profile      (UserProfile: isPro, proExpiresAt, proExpiryNotified)
//   /app_config/update        (AppUpdateInfo: forceUpdate, latestVersionName, ...)
//   /app_config/payment       (JazzCash number, WhatsApp number, price — read by app's Buy Pro screen)
// ============================================================

const firebaseConfig = {
  apiKey: "AIzaSyBbnU8DkthpYQMHOLLyj6M0cc05qXfjMcw",
  authDomain: "ramadan-2385b.firebaseapp.com",
  databaseURL: "https://ramadan-2385b-default-rtdb.firebaseio.com",
  projectId: "ramadan-2385b",
  storageBucket: "ramadan-2385b.firebasestorage.app",
  messagingSenderId: "882828936310",
  appId: "1:882828936310:web:7f97b921031fe130fe4b57"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();

// ---------- In-memory caches (kept in sync via Firebase listeners) ----------
let liveChannels = {};
let movies = {};
let seriesIndex = {};      // seriesId -> show metadata
let seriesEpisodesCache = {}; // seriesId -> { episodeId: episode }
let allUsers = {};

let currentEditingSeriesEpisodes = []; // working list while the series modal is open

// ============================================================
// AUTH
// ============================================================

auth.onAuthStateChanged(function (user) {
  if (user) {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('appShell').style.display = 'block';
    startListeners();
  } else {
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('appShell').style.display = 'none';
  }
});

function handleLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errorEl = document.getElementById('loginError');
  errorEl.textContent = '';

  if (!email || !password) {
    errorEl.textContent = 'Please enter both email and password.';
    return;
  }

  auth.signInWithEmailAndPassword(email, password)
    .catch(function (error) {
      if (error.code === 'auth/user-not-found') {
        // First-time setup: create the admin account automatically.
        auth.createUserWithEmailAndPassword(email, password)
          .catch(function (createError) {
            errorEl.textContent = createError.message;
          });
      } else {
        errorEl.textContent = error.message;
      }
    });
}

function handleLogout() {
  auth.signOut();
}

// ============================================================
// TAB SWITCHING
// ============================================================

function switchTab(pageId) {
  document.querySelectorAll('.page').forEach(function (p) { p.classList.remove('active'); });
  document.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('active'); });
  document.getElementById(pageId).classList.add('active');
  document.querySelector('[data-page="' + pageId + '"]').classList.add('active');

  const fab = document.getElementById('mainFab');
  fab.style.display = (pageId === 'usersTab' || pageId === 'settingsTab') ? 'none' : 'flex';
}

// ============================================================
// FIREBASE LISTENERS — keep local caches + UI in sync in real time
// ============================================================

function startListeners() {
  db.ref('live_channels').on('value', function (snap) {
    liveChannels = snap.val() || {};
    renderGrid('live');
  });

  db.ref('movies').on('value', function (snap) {
    movies = snap.val() || {};
    renderGrid('movies');
  });

  db.ref('series_index').on('value', function (snap) {
    seriesIndex = snap.val() || {};
    renderGrid('series');
  });

  db.ref('users').on('value', function (snap) {
    allUsers = snap.val() || {};
    renderUsers();
  });

  loadAppSettings();
}

// ============================================================
// RENDER: content grids (Live / Movies / Series)
// ============================================================

function renderGrid(kind, filterText) {
  filterText = (filterText || '').toLowerCase();
  const gridEl = document.getElementById(kind + 'Grid');
  const countEl = document.getElementById(kind + 'Count');
  let dataObj, isLive = false, isSeries = false;

  if (kind === 'live') { dataObj = liveChannels; isLive = true; }
  else if (kind === 'movies') { dataObj = movies; }
  else { dataObj = seriesIndex; isSeries = true; }

  const entries = Object.keys(dataObj || {})
    .map(function (id) { return Object.assign({ id: id }, dataObj[id]); })
    .filter(function (item) {
      return !filterText || (item.title || '').toLowerCase().indexOf(filterText) !== -1;
    })
    .sort(function (a, b) { return (a.sortOrder || 0) - (b.sortOrder || 0); });

  countEl.textContent = entries.length ? '(' + entries.length + ')' : '';

  if (entries.length === 0) {
    gridEl.innerHTML =
      '<div class="empty-state" style="grid-column:1/-1;">' +
      '<h3>No ' + kind + ' yet</h3>' +
      '<p>Tap the + button to add your first entry.</p>' +
      '</div>';
    return;
  }

  gridEl.innerHTML = entries.map(function (item) {
    const img = item.posterUrl || item.logoUrl || '';
    const thumbClass = isLive ? 'card-thumb live' : 'card-thumb';
    const bgStyle = img ? ' style="background-image:url(\'' + escapeHtml(img) + '\')"' : '';
    const placeholderIcon = img ? '' :
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 6h16M4 12h16M4 18h10"/></svg>';
    const liveBadge = isLive ? '<span class="badge live-badge">LIVE</span>' : '';
    const proBadge = (item.isFree === false) ? '<span class="badge pro-badge">PRO</span>' : '';
    const meta = isSeries
      ? ((item.episodeCount || 0) + ' episodes')
      : (item.groupTitle || item.language || '');
    const clickHandler = isSeries
      ? 'openSeriesModal(\'' + item.id + '\')'
      : 'openEditModal(\'' + kind + '\',\'' + item.id + '\')';

    return (
      '<div class="content-card" onclick="' + clickHandler + '">' +
        '<div class="' + thumbClass + '"' + bgStyle + '>' +
          placeholderIcon + liveBadge + proBadge +
        '</div>' +
        '<div class="card-body">' +
          '<div class="card-title">' + escapeHtml(item.title || 'Untitled') + '</div>' +
          '<div class="card-meta">' + escapeHtml(meta) + '</div>' +
        '</div>' +
      '</div>'
    );
  }).join('');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

// ============================================================
// MODAL: Add / Edit Live Channel or Movie
// ============================================================

function openAddModal() {
  const activePage = document.querySelector('.page.active').id;
  if (activePage === 'seriesTab') {
    openSeriesModal(null);
    return;
  }
  const category = activePage === 'liveTab' ? 'live' : 'movies';
  openEditModal(category, null);
}

function openEditModal(kind, id) {
  const modal = document.getElementById('mediaModal');
  const isLive = kind === 'live';
  const dataObj = isLive ? liveChannels : movies;
  const item = id ? dataObj[id] : null;

  document.getElementById('mediaModalTitle').textContent =
    (item ? 'Edit ' : 'Add ') + (isLive ? 'Live Channel' : 'Movie');
  document.getElementById('mediaId').value = id || '';
  document.getElementById('mediaCategory').value = isLive ? 'LIVE' : 'MOVIE';
  document.getElementById('mediaTitle').value = item ? item.title || '' : '';
  document.getElementById('mediaStreamUrl').value = item ? item.streamUrl || '' : '';
  document.getElementById('mediaSourceType').value = item ? item.sourceType || 'M3U8' : 'M3U8';
  document.getElementById('mediaGroupTitle').value = item ? item.groupTitle || '' : '';
  document.getElementById('mediaPosterUrl').value = item ? (item.posterUrl || item.logoUrl || '') : '';
  document.getElementById('posterLabel').textContent = isLive ? 'Logo URL (.png/.jpg/.svg)' : 'Poster URL';
  document.getElementById('mediaYear').value = item ? item.year || '' : '';
  document.getElementById('mediaLanguage').value = item ? item.language || '' : '';
  document.getElementById('mediaDescription').value = item ? item.description || '' : '';
  document.getElementById('mediaIsFree').checked = item ? item.isFree !== false : true;
  document.getElementById('mediaIsFeatured').checked = item ? !!item.isFeatured : false;
  document.getElementById('deleteMediaBtn').style.display = item ? 'inline-flex' : 'none';

  modal.classList.add('active');
}

function saveMedia() {
  const id = document.getElementById('mediaId').value;
  const category = document.getElementById('mediaCategory').value; // 'LIVE' | 'MOVIE'
  const title = document.getElementById('mediaTitle').value.trim();
  const streamUrl = document.getElementById('mediaStreamUrl').value.trim();

  if (!title || !streamUrl) {
    showToast('Title and Stream URL are required.', 'error');
    return;
  }

  const isLive = category === 'LIVE';
  const posterVal = document.getElementById('mediaPosterUrl').value.trim();

  const payload = {
    title: title,
    streamUrl: streamUrl,
    sourceType: document.getElementById('mediaSourceType').value,
    groupTitle: document.getElementById('mediaGroupTitle').value.trim() || 'General',
    category: category,
    year: document.getElementById('mediaYear').value.trim(),
    language: document.getElementById('mediaLanguage').value.trim(),
    description: document.getElementById('mediaDescription').value.trim(),
    isFree: document.getElementById('mediaIsFree').checked,
    isFeatured: document.getElementById('mediaIsFeatured').checked,
    sortOrder: id ? (isLive ? liveChannels[id].sortOrder : movies[id].sortOrder) || 0 : Date.now(),
    addedTimestamp: id ? (isLive ? liveChannels[id].addedTimestamp : movies[id].addedTimestamp) || Date.now() : Date.now()
  };

  if (isLive) {
    payload.logoUrl = posterVal;
    payload.posterUrl = '';
  } else {
    payload.posterUrl = posterVal;
    payload.logoUrl = '';
  }

  const node = isLive ? 'live_channels' : 'movies';
  const ref = id ? db.ref(node).child(id) : db.ref(node).push();

  ref.set(payload)
    .then(function () {
      showToast('Saved successfully.', 'success');
      closeModal('mediaModal');
    })
    .catch(function (err) { showToast(err.message, 'error'); });
}

function deleteCurrentMedia() {
  const id = document.getElementById('mediaId').value;
  const category = document.getElementById('mediaCategory').value;
  if (!id) return;
  if (!confirm('Delete this item permanently?')) return;

  const node = category === 'LIVE' ? 'live_channels' : 'movies';
  db.ref(node).child(id).remove()
    .then(function () {
      showToast('Deleted.', 'success');
      closeModal('mediaModal');
    })
    .catch(function (err) { showToast(err.message, 'error'); });
}

// ============================================================
// MODAL: Series (show metadata + nested episode list)
// ============================================================

function openSeriesModal(seriesId) {
  const modal = document.getElementById('seriesModal');
  const show = seriesId ? seriesIndex[seriesId] : null;

  document.getElementById('seriesModalTitle').textContent = show ? 'Edit Series' : 'Add Series';
  document.getElementById('seriesId').value = seriesId || '';
  document.getElementById('seriesTitle').value = show ? show.title || '' : '';
  document.getElementById('seriesPosterUrl').value = show ? show.posterUrl || '' : '';
  document.getElementById('seriesYear').value = show ? show.year || '' : '';
  document.getElementById('seriesLanguage').value = show ? show.language || '' : '';
  document.getElementById('seriesDescription').value = show ? show.description || '' : '';
  document.getElementById('seriesIsFree').checked = show ? show.isFree !== false : true;
  document.getElementById('deleteSeriesBtn').style.display = show ? 'inline-flex' : 'none';

  currentEditingSeriesEpisodes = [];

  if (seriesId) {
    db.ref('series').child(seriesId).child('episodes').once('value').then(function (snap) {
      const eps = snap.val() || {};
      currentEditingSeriesEpisodes = Object.keys(eps).map(function (epId) {
        return Object.assign({ id: epId }, eps[epId]);
      }).sort(function (a, b) {
        return (a.seasonNumber - b.seasonNumber) || (a.episodeNumber - b.episodeNumber);
      });
      renderEpisodesList();
    });
  } else {
    renderEpisodesList();
  }

  modal.classList.add('active');
}

function renderEpisodesList() {
  const container = document.getElementById('episodesList');
  if (currentEditingSeriesEpisodes.length === 0) {
    container.innerHTML = '<p style="font-size:12px;color:var(--text-faint);padding:8px 0;">No episodes added yet.</p>';
    return;
  }
  container.innerHTML = currentEditingSeriesEpisodes.map(function (ep, idx) {
    return (
      '<div class="episode-row">' +
        '<input type="number" class="ep-num" placeholder="S" value="' + (ep.seasonNumber || 1) + '" onchange="updateEpisodeField(' + idx + ',\'seasonNumber\',this.value)" title="Season">' +
        '<input type="number" class="ep-num" placeholder="E" value="' + (ep.episodeNumber || (idx + 1)) + '" onchange="updateEpisodeField(' + idx + ',\'episodeNumber\',this.value)" title="Episode">' +
        '<input type="text" placeholder="Episode title" value="' + escapeHtml(ep.title || '') + '" onchange="updateEpisodeField(' + idx + ',\'title\',this.value)">' +
        '<input type="text" placeholder="Stream URL" value="' + escapeHtml(ep.streamUrl || '') + '" onchange="updateEpisodeField(' + idx + ',\'streamUrl\',this.value)">' +
        '<button class="btn btn-danger btn-sm" onclick="removeEpisodeRow(' + idx + ')" type="button">✕</button>' +
      '</div>'
    );
  }).join('');
}

function addEpisodeRow() {
  const nextEpNum = currentEditingSeriesEpisodes.length + 1;
  currentEditingSeriesEpisodes.push({
    id: 'ep_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    title: '',
    streamUrl: '',
    seasonNumber: 1,
    episodeNumber: nextEpNum
  });
  renderEpisodesList();
}

function updateEpisodeField(idx, field, value) {
  if (field === 'seasonNumber' || field === 'episodeNumber') {
    value = parseInt(value, 10) || 0;
  }
  currentEditingSeriesEpisodes[idx][field] = value;
}

function removeEpisodeRow(idx) {
  currentEditingSeriesEpisodes.splice(idx, 1);
  renderEpisodesList();
}

function saveSeries() {
  const seriesId = document.getElementById('seriesId').value || ('series_' + Date.now());
  const title = document.getElementById('seriesTitle').value.trim();

  if (!title) {
    showToast('Series title is required.', 'error');
    return;
  }

  const isFree = document.getElementById('seriesIsFree').checked;
  const validEpisodes = currentEditingSeriesEpisodes.filter(function (ep) {
    return ep.title && ep.streamUrl;
  });

  const showPayload = {
    title: title,
    posterUrl: document.getElementById('seriesPosterUrl').value.trim(),
    year: document.getElementById('seriesYear').value.trim(),
    language: document.getElementById('seriesLanguage').value.trim(),
    description: document.getElementById('seriesDescription').value.trim(),
    isFree: isFree,
    category: 'SERIES',
    seriesId: seriesId,
    episodeCount: validEpisodes.length,
    sortOrder: seriesIndex[seriesId] ? seriesIndex[seriesId].sortOrder || 0 : Date.now(),
    addedTimestamp: seriesIndex[seriesId] ? seriesIndex[seriesId].addedTimestamp || Date.now() : Date.now()
  };

  const updates = {};
  updates['/series_index/' + seriesId] = showPayload;

  const episodesPayload = {};
  validEpisodes.forEach(function (ep) {
    episodesPayload[ep.id] = {
      title: ep.title,
      streamUrl: ep.streamUrl,
      seasonNumber: ep.seasonNumber || 1,
      episodeNumber: ep.episodeNumber || 1,
      seriesId: seriesId,
      category: 'SERIES',
      sourceType: ep.sourceType || 'M3U8',
      isFree: isFree,
      posterUrl: showPayload.posterUrl,
      backdropUrl: ep.backdropUrl || '',
      description: ep.description || ''
    };
  });
  updates['/series/' + seriesId + '/episodes'] = episodesPayload;

  db.ref().update(updates)
    .then(function () {
      showToast('Series saved.', 'success');
      closeModal('seriesModal');
    })
    .catch(function (err) { showToast(err.message, 'error'); });
}

function deleteCurrentSeries() {
  const seriesId = document.getElementById('seriesId').value;
  if (!seriesId) return;
  if (!confirm('Delete this series and all its episodes permanently?')) return;

  const updates = {};
  updates['/series_index/' + seriesId] = null;
  updates['/series/' + seriesId] = null;

  db.ref().update(updates)
    .then(function () {
      showToast('Series deleted.', 'success');
      closeModal('seriesModal');
    })
    .catch(function (err) { showToast(err.message, 'error'); });
}

// ============================================================
// USERS & PRO MANAGEMENT
// ============================================================

function renderUsers(filterText) {
  filterText = (filterText || '').toLowerCase();
  const tbody = document.getElementById('usersTableBody');
  const countEl = document.getElementById('usersCount');

  const entries = Object.keys(allUsers || {}).map(function (uid) {
    const profile = (allUsers[uid] && allUsers[uid].profile) || {};
    return Object.assign({ uid: uid }, profile);
  }).filter(function (u) {
    return !filterText || (u.email || '').toLowerCase().indexOf(filterText) !== -1;
  });

  countEl.textContent = entries.length ? '(' + entries.length + ')' : '';

  if (entries.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-faint);padding:30px;">No users yet.</td></tr>';
    return;
  }

  const now = Date.now();

  tbody.innerHTML = entries.map(function (u) {
    let statusHtml;
    if (u.isPro && u.proExpiresAt > now) {
      statusHtml = '<span class="pro-status active">● Pro Active</span>';
    } else if (u.isPro && u.proExpiresAt && u.proExpiresAt <= now) {
      statusHtml = '<span class="pro-status expired">● Expired</span>';
    } else {
      statusHtml = '<span class="pro-status inactive">Free</span>';
    }
    const expiryText = u.proExpiresAt ? new Date(u.proExpiresAt).toLocaleDateString() : '—';

    return (
      '<tr>' +
        '<td>' + escapeHtml(u.email || u.uid) + '</td>' +
        '<td>' + statusHtml + '</td>' +
        '<td>' + expiryText + '</td>' +
        '<td><button class="btn btn-ghost btn-sm" onclick="openUserModal(\'' + u.uid + '\')">Manage</button></td>' +
      '</tr>'
    );
  }).join('');
}

function openUserModal(uid) {
  const profile = (allUsers[uid] && allUsers[uid].profile) || {};
  document.getElementById('userUid').value = uid;
  document.getElementById('userEmailDisplay').value = profile.email || uid;
  document.getElementById('userIsProToggle').checked = !!profile.isPro;
  document.getElementById('userExpiryDate').value = profile.proExpiresAt
    ? new Date(profile.proExpiresAt).toISOString().slice(0, 10)
    : '';
  document.getElementById('userModal').classList.add('active');
}

function extendProMonth() {
  const dateInput = document.getElementById('userExpiryDate');
  const base = dateInput.value ? new Date(dateInput.value) : new Date();
  const today = new Date();
  const startFrom = base > today ? base : today;
  startFrom.setMonth(startFrom.getMonth() + 1);
  dateInput.value = startFrom.toISOString().slice(0, 10);
  document.getElementById('userIsProToggle').checked = true;
}

function saveUserPro() {
  const uid = document.getElementById('userUid').value;
  const isPro = document.getElementById('userIsProToggle').checked;
  const expiryStr = document.getElementById('userExpiryDate').value;
  const expiresAt = expiryStr ? new Date(expiryStr + 'T23:59:59').getTime() : 0;

  const existingProfile = (allUsers[uid] && allUsers[uid].profile) || {};

  const updates = {
    uid: uid,
    email: existingProfile.email || '',
    isPro: isPro,
    proExpiresAt: expiresAt,
    proActivatedAt: isPro ? (existingProfile.proActivatedAt || Date.now()) : existingProfile.proActivatedAt || 0,
    proExpiryNotified: false, // reset so the app shows a fresh notice if this grant later expires
    displayName: existingProfile.displayName || ''
  };

  db.ref('users').child(uid).child('profile').set(updates)
    .then(function () {
      showToast('User Pro status updated.', 'success');
      closeModal('userModal');
    })
    .catch(function (err) { showToast(err.message, 'error'); });
}

// ============================================================
// APP SETTINGS: JazzCash / WhatsApp / Force Update
// ============================================================

function loadAppSettings() {
  db.ref('app_config/payment').once('value').then(function (snap) {
    const v = snap.val() || {};
    document.getElementById('jazzCashNumber').value = v.jazzCashNumber || '03062015326';
    document.getElementById('whatsappNumber').value = v.whatsappNumber || '923062015326';
    document.getElementById('proPrice').value = v.proPrice || 'Rs 50 / month';
  });

  db.ref('app_config/update').once('value').then(function (snap) {
    const v = snap.val() || {};
    document.getElementById('forceUpdateToggle').checked = !!v.forceUpdate;
    document.getElementById('latestVersionName').value = v.latestVersionName || '';
    document.getElementById('updateMessage').value = v.updateMessage || '';
    document.getElementById('downloadUrl').value = v.downloadUrl || '';
  });
}

function saveAppSettings() {
  const payload = {
    jazzCashNumber: document.getElementById('jazzCashNumber').value.trim(),
    whatsappNumber: document.getElementById('whatsappNumber').value.trim(),
    proPrice: document.getElementById('proPrice').value.trim()
  };
  db.ref('app_config/payment').set(payload)
    .then(function () { showToast('Payment settings saved.', 'success'); })
    .catch(function (err) { showToast(err.message, 'error'); });
}

function saveUpdateSettings() {
  const payload = {
    forceUpdate: document.getElementById('forceUpdateToggle').checked,
    latestVersionName: document.getElementById('latestVersionName').value.trim(),
    updateMessage: document.getElementById('updateMessage').value.trim(),
    downloadUrl: document.getElementById('downloadUrl').value.trim(),
    latestVersionCode: Date.now() // simple monotonically increasing marker
  };
  db.ref('app_config/update').set(payload)
    .then(function () { showToast('Update config saved.', 'success'); })
    .catch(function (err) { showToast(err.message, 'error'); });
}

// ============================================================
// SHARED UI HELPERS
// ============================================================

function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('active');
}

// Close modal when clicking the dark overlay (outside the card)
document.querySelectorAll('.modal-overlay').forEach(function (overlay) {
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) overlay.classList.remove('active');
  });
});

let toastTimer;
function showToast(message, type) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = 'show' + (type ? ' ' + type : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () {
    toast.className = '';
  }, 3000);
}
