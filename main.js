// ─── DATA ────────────────────────────────────────────────────────────────────
const STORAGE_KEY = 'folio_library_v2';
let library = [];

// Auth / sync state
let currentUser = null;        // Firebase user object, or null if signed out
let viewingProfileId = null;   // set when viewing someone else's shared profile (read-only)
let isReadOnly = false;
let fb = null;                 // populated once firebase-ready fires
let authMode = 'login';        // 'login' or 'signup'

function loadLibrary() {
  try { library = JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { library = []; }
}

function saveLibrary() {
  // Always keep a local copy for instant UI + offline fallback
  localStorage.setItem(STORAGE_KEY, JSON.stringify(library));
  renderAll();
  updateStats();
  if (currentUser && !isReadOnly) syncLibraryToCloud();
}

// ─── FIRESTORE SYNC ──────────────────────────────────────────────────────────
let syncTimer = null;
function syncLibraryToCloud() {
  if (!fb || !currentUser) return;
  clearTimeout(syncTimer);
  showSyncIndicator();
  // Debounce so rapid edits (e.g. star clicks) don't fire a write per click
  syncTimer = setTimeout(async () => {
    try {
      const userDocRef = fb.doc(fb.db, 'users', currentUser.uid);
      await fb.setDoc(userDocRef, {
        displayName: currentUser.displayName || currentUser.email,
        email: currentUser.email,
        library: library,
        updatedAt: Date.now()
      }, { merge: true });
    } catch (err) {
      console.error('Sync failed:', err);
      toast('Could not sync — changes saved locally only');
    }
  }, 600);
}

async function loadLibraryFromCloud(uid) {
  if (!fb) return null;
  try {
    const userDocRef = fb.doc(fb.db, 'users', uid);
    const snap = await fb.getDoc(userDocRef);
    if (snap.exists()) return snap.data();
    return null;
  } catch (err) {
    console.error('Could not load cloud library:', err);
    return null;
  }
}

function showSyncIndicator() {
  const el = document.getElementById('sync-indicator');
  el.classList.add('show');
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

// ─── STATUS CONFIG ───────────────────────────────────────────────────────────
const STATUSES = [
  { key: 'reading',  label: 'Currently Reading', badge: 'Reading',  badgeClass: 'badge-reading',  color: '#8B6F47', emptyTitle: 'Nothing in progress', emptyMsg: 'Start reading a book and track it here.' },
  { key: 'finished', label: 'Finished',           badge: 'Finished', badgeClass: 'badge-finished', color: '#4A7C59', emptyTitle: 'No books finished yet', emptyMsg: 'Completed books will appear here.' },
  { key: 'want',     label: 'Want to Read',       badge: 'Want',     badgeClass: 'badge-want',     color: '#3D6494', emptyTitle: 'Your reading list is empty', emptyMsg: 'Add books you want to read next.' },
  { key: 'dropped',  label: 'Dropped',            badge: 'Dropped',  badgeClass: 'badge-dropped',  color: '#B05252', emptyTitle: 'Nothing dropped', emptyMsg: 'Books you set aside will appear here.' },
];

// ─── COMPACT HEADER ON SCROLL ────────────────────────────────────────────────
let hasCompacted = false;
window.addEventListener('scroll', () => {
  if (!hasCompacted && window.scrollY > 60) {
    hasCompacted = true;
    document.getElementById('site-header').classList.add('compact');
    document.querySelector('.hero').classList.add('collapsed');
  }
}, { passive: true });

// ─── STATS ───────────────────────────────────────────────────────────────────
function updateStats() {
  document.getElementById('stat-total').textContent   = library.length;
  document.getElementById('stat-read').textContent    = library.filter(b=>b.status==='finished').length;
  document.getElementById('stat-reading').textContent = library.filter(b=>b.status==='reading').length;
}

// ─── COVER URL ───────────────────────────────────────────────────────────────
function coverUrl(book, size='M') {
  if (book.coverId)  return `https://covers.openlibrary.org/b/id/${book.coverId}-${size}.jpg`;
  if (book.coverKey) return `https://covers.openlibrary.org/b/olid/${book.coverKey}-${size}.jpg`;
  return null;
}

const bookIconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`;

// ─── RENDER SHELVES ──────────────────────────────────────────────────────────
function renderAll() {
  const main = document.getElementById('main-shelves');
  main.innerHTML = '';
  STATUSES.forEach((s, i) => {
    const books = library.filter(b => b.status === s.key);
    const section = document.createElement('section');
    section.className = `shelf-section status-${s.key}`;
    section.style.animationDelay = `${0.06 * i}s`;
    section.innerHTML = `
      <div class="shelf-header">
        <span class="shelf-dot"></span>
        <span class="shelf-label">${s.label}</span>
        <span class="shelf-count">${books.length}</span>
      </div>
      <div class="books-grid" id="grid-${s.key}">
        ${books.length === 0 ? `<div class="empty-shelf"><strong>${s.emptyTitle}</strong>${s.emptyMsg}</div>` : ''}
      </div>
    `;
    main.appendChild(section);
    const grid = section.querySelector(`#grid-${s.key}`);
    books.forEach(book => grid.appendChild(buildCard(book, s)));
    if (!isReadOnly && books.length > 0) grid.appendChild(buildNudgeCard(s));
  });
}

function buildCard(book, statusCfg) {
  const card = document.createElement('div');
  card.className = 'book-card';
  card.dataset.id = book.id;
  const url = coverUrl(book, 'M');
  const coverHtml = url
    ? `<img src="${url}" alt="${escHtml(book.title)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
    : '';
  const placeholderHtml = `<div class="book-cover-placeholder" ${url ? 'style="display:none"' : ''}>${bookIconSvg}<span class="cover-title">${escHtml(book.title)}</span></div>`;
  const reviewSnippet = book.review
    ? `<div class="book-review-snippet">${escHtml(book.review)}</div>`
    : '';
  const overlayHtml = isReadOnly ? '' : `
      <div class="book-overlay">
        <button class="overlay-btn overlay-btn-status" data-action="edit" data-id="${book.id}">Edit / Rate</button>
        <button class="overlay-btn overlay-btn-remove" data-action="remove" data-id="${book.id}">Remove</button>
      </div>`;

  card.innerHTML = `
    <div class="book-cover-wrap">
      ${coverHtml}${placeholderHtml}
      <span class="status-badge ${statusCfg.badgeClass}">${statusCfg.badge}</span>
      ${overlayHtml}
    </div>
    <div class="book-info">
      <div class="book-title">${escHtml(book.title)}</div>
      <div class="book-author">${escHtml(book.author || 'Unknown author')}</div>
      <div class="star-rating" data-id="${book.id}">${buildMiniStars(book)}</div>
      ${reviewSnippet}
    </div>
  `;

  if (isReadOnly) {
    card.querySelectorAll('.star').forEach(star => star.style.cursor = 'default');
    return card; // no click handlers — fully read-only
  }

  card.querySelectorAll('.star').forEach(star => {
    star.addEventListener('click', e => {
      e.stopPropagation();
      const r = parseInt(star.dataset.val);
      const b = library.find(x => x.id === book.id);
      if (b) { b.rating = (b.rating === r ? 0 : r); saveLibrary(); }
    });
  });
  card.querySelector('[data-action="edit"]').addEventListener('click', e => {
    e.stopPropagation(); openModal(book.id);
  });
  card.querySelector('[data-action="remove"]').addEventListener('click', e => {
    e.stopPropagation();
    library = library.filter(x => x.id !== book.id);
    saveLibrary();
    toast(`Removed "${book.title}"`);
  });
  card.addEventListener('click', () => openModal(book.id));
  return card;
}

function buildNudgeCard(statusCfg) {
  const messages = {
    reading:  { line1: 'Keep reading!',    line2: 'You\'re doing great.' },
    finished: { line1: 'Read more books!', line2: 'Your finished shelf is growing.' },
    want:     { line1: 'Add more books!',  line2: 'What\'s next on your list?' },
    dropped:  { line1: 'Give it another chance?', line2: 'Or find something better.' },
  };
  const msg = messages[statusCfg.key] || { line1: 'Add a book!', line2: '' };
  const card = document.createElement('div');
  card.className = 'nudge-card';
  card.style.cursor = 'pointer';
  card.innerHTML = `
    <div class="nudge-dot" style="background:${statusCfg.color}"></div>
    <div class="nudge-line1">${msg.line1}</div>
    <div class="nudge-line2">${msg.line2}</div>
    <div class="nudge-arrow">Click to search</div>
  `;
  card.addEventListener('click', () => {
    const input = document.getElementById('search-input');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => input.focus(), 350);
  });
  return card;
}

function buildMiniStars(book) {
  return [1,2,3,4,5].map(v =>
    `<span class="star ${book.rating >= v ? 'filled' : ''}" data-val="${v}">★</span>`
  ).join('');
}

// ─── MODAL ───────────────────────────────────────────────────────────────────
let currentModalId = null;

function openModal(bookId) {
  const book = library.find(b => b.id === bookId);
  if (!book) return;
  currentModalId = bookId;

  const url  = coverUrl(book, 'L');
  const urlM = coverUrl(book, 'M');

  document.getElementById('modal-inner').innerHTML = `
    <div class="modal-cover-band">
      ${urlM ? `<img class="modal-cover-bg" src="${urlM}" alt="">` : ''}
      ${url ? `<img class="modal-cover-img" src="${url}" alt="${escHtml(book.title)}" onerror="this.style.display='none';document.getElementById('modal-placeholder').style.display='flex'">` : ''}
      <div class="modal-cover-placeholder-lg" id="modal-placeholder" ${url ? 'style="display:none"' : ''}>${bookIconSvg}</div>
      <button class="modal-close" id="modal-close">✕</button>
    </div>
    <div class="modal-body">
      <div class="modal-title">${escHtml(book.title)}</div>
      <div class="modal-author">by <span>${escHtml(book.author || 'Unknown author')}</span>${book.year ? ` · ${book.year}` : ''}</div>

      <div class="modal-section-label">Reading Status</div>
      <div class="status-picker">
        ${STATUSES.map(s => `
          <button class="status-option ${s.key} ${book.status===s.key?'active':''}" data-status="${s.key}">
            <span class="s-dot"></span>${s.label}
          </button>
        `).join('')}
      </div>

      <div class="modal-section-label">Your Rating</div>
      <div class="modal-rating">
        ${[1,2,3,4,5].map(v => `<span class="modal-star ${book.rating>=v?'filled':''}" data-val="${v}">★</span>`).join('')}
      </div>

      <div class="modal-section-label">Your Review <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--border-mid)">(optional)</span></div>
      <div class="modal-review-wrap">
        <textarea class="modal-review" id="modal-review" placeholder="Write a few thoughts about this book…" maxlength="1000">${escHtml(book.review || '')}</textarea>
      </div>

      <button class="modal-save-btn" id="modal-save">Save Changes</button>

      <div class="community-section" id="community-section">
        <div class="community-loading">
          <div class="spinner"></div> Loading community reviews…
        </div>
      </div>
    </div>
  `;

  let tempStatus = book.status;
  let tempRating = book.rating || 0;

  document.getElementById('modal-inner').querySelectorAll('.status-option').forEach(btn => {
    btn.addEventListener('click', () => {
      tempStatus = btn.dataset.status;
      document.getElementById('modal-inner').querySelectorAll('.status-option').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  const mStars = document.getElementById('modal-inner').querySelectorAll('.modal-star');
  mStars.forEach(star => {
    star.addEventListener('mouseenter', () => {
      const v = parseInt(star.dataset.val);
      mStars.forEach(s => s.classList.toggle('filled', parseInt(s.dataset.val) <= v));
    });
    star.addEventListener('mouseleave', () => {
      mStars.forEach(s => s.classList.toggle('filled', parseInt(s.dataset.val) <= tempRating));
    });
    star.addEventListener('click', () => {
      const v = parseInt(star.dataset.val);
      tempRating = tempRating === v ? 0 : v;
      mStars.forEach(s => s.classList.toggle('filled', parseInt(s.dataset.val) <= tempRating));
    });
  });

  document.getElementById('modal-save').addEventListener('click', () => {
    const b = library.find(x => x.id === bookId);
    if (b) {
      b.status = tempStatus;
      b.rating = tempRating;
      b.review = document.getElementById('modal-review').value.trim();
      saveLibrary();
    }
    closeModal();
    toast('Changes saved');
  });

  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').classList.add('open');

  // Load community reviews async (non-blocking)
  loadCommunityReviews(book);
}

async function loadCommunityReviews(book) {
  const container = document.getElementById('community-section');
  if (!container) return;

  // If Firebase isn't ready, hide section silently
  if (!fb) { container.style.display = 'none'; return; }

  try {
    const usersSnap = await fb.getDocs(fb.collection(fb.db, 'users'));
    const reviews = [];
    let ratingSum = 0, ratingCount = 0;

    usersSnap.forEach(userDoc => {
      const data = userDoc.data();
      if (!Array.isArray(data.library)) return;
      const isMe = currentUser && userDoc.id === currentUser.uid;
      // Match by Open Library key (most reliable) or title+author
      const match = data.library.find(b =>
        (book.openLibKey && b.openLibKey === book.openLibKey) ||
        (b.title === book.title && b.author === book.author)
      );
      if (!match) return;
      if (match.rating > 0) { ratingSum += match.rating; ratingCount++; }
      if (match.review && match.review.trim() && !isMe) {
        reviews.push({
          name: data.displayName || 'A reader',
          rating: match.rating || 0,
          review: match.review.trim(),
        });
      }
    });

    const avgRating = ratingCount > 0 ? (ratingSum / ratingCount) : null;

    if (avgRating === null && reviews.length === 0) {
      container.style.display = 'none';
      return;
    }

    const starsHtml = (r) => [1,2,3,4,5].map(v =>
      `<span style="color:${v<=Math.round(r)?'var(--accent)':'var(--border-mid)'}">★</span>`
    ).join('');

    container.innerHTML = `
      <div class="community-divider"></div>
      ${avgRating !== null ? `
        <div class="community-avg">
          <div class="community-avg-stars">${starsHtml(avgRating)}</div>
          <div class="community-avg-label">
            <strong>${avgRating.toFixed(1)}</strong> avg · ${ratingCount} ${ratingCount === 1 ? 'rating' : 'ratings'} on Folio
          </div>
        </div>` : ''}
      ${reviews.length > 0 ? `
        <div class="community-reviews-label">From other readers</div>
        <div class="community-reviews">
          ${reviews.slice(0, 4).map(r => `
            <div class="community-review">
              <div class="community-review-header">
                <span class="community-reviewer">${escHtml(r.name)}</span>
                ${r.rating > 0 ? `<span class="community-review-stars">${starsHtml(r.rating)}</span>` : ''}
              </div>
              <div class="community-review-text">${escHtml(r.review)}</div>
            </div>
          `).join('')}
        </div>` : ''}
    `;
  } catch (err) {
    // Silently fail — don't clutter the modal with an error
    container.style.display = 'none';
  }
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
  currentModalId = null;
}
document.getElementById('modal-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
});

// ─── SEARCH ──────────────────────────────────────────────────────────────────
let searchTimer = null;
let pendingBook = null;

const searchInput     = document.getElementById('search-input');
const searchResultsEl = document.getElementById('search-results');

searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  const q = searchInput.value.trim();
  if (!q) { searchResultsEl.classList.remove('open'); return; }
  searchResultsEl.innerHTML = `<div class="search-loading"><div class="spinner"></div>Searching…</div>`;
  searchResultsEl.classList.add('open');
  searchTimer = setTimeout(() => doSearch(q), 420);
});
document.getElementById('search-btn').addEventListener('click', () => {
  const q = searchInput.value.trim();
  if (q) { clearTimeout(searchTimer); doSearch(q); }
});
searchInput.addEventListener('keydown', e => {
  if (e.key === 'Enter')  { clearTimeout(searchTimer); const q = searchInput.value.trim(); if(q) doSearch(q); }
  if (e.key === 'Escape') { searchResultsEl.classList.remove('open'); }
});
document.addEventListener('click', e => {
  if (!e.target.closest('.search-wrap')) searchResultsEl.classList.remove('open');
});

async function doSearch(q) {
  try {
    const r = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=12&fields=key,title,author_name,first_publish_year,cover_i,cover_edition_key,edition_key`);
    const data = await r.json();
    renderSearchResults(data.docs || []);
  } catch {
    searchResultsEl.innerHTML = `<div class="search-empty">Couldn't reach the book database. Check your connection.</div>`;
  }
}

function renderSearchResults(docs) {
  if (!docs.length) {
    searchResultsEl.innerHTML = `<div class="search-empty">No books found. Try a different search.</div>`;
    return;
  }
  searchResultsEl.innerHTML = '';
  docs.forEach(doc => {
    const isAdded  = library.some(b => b.openLibKey === doc.key);
    const coverId  = doc.cover_i;
    const coverKey = doc.cover_edition_key || (doc.edition_key && doc.edition_key[0]);
    const coverSrc = coverId  ? `https://covers.openlibrary.org/b/id/${coverId}-S.jpg`
                   : coverKey ? `https://covers.openlibrary.org/b/olid/${coverKey}-S.jpg` : null;

    const item = document.createElement('div');
    item.className = 'result-item';
    item.innerHTML = `
      ${coverSrc
        ? `<img class="result-cover" src="${coverSrc}" alt="" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div class="result-cover-placeholder" style="display:none">${bookIconSvg}</div>`
        : `<div class="result-cover-placeholder">${bookIconSvg}</div>`
      }
      <div class="result-info">
        <div class="result-title">${escHtml(doc.title || 'Unknown title')}</div>
        <div class="result-author">${escHtml((doc.author_name || ['Unknown author']).slice(0,2).join(', '))}</div>
        ${doc.first_publish_year ? `<div class="result-year">${doc.first_publish_year}</div>` : ''}
      </div>
      <button class="result-add-btn ${isAdded ? 'added' : ''}" data-key="${escHtml(doc.key)}">
        ${isAdded ? 'Added' : '+ Add'}
      </button>
    `;
    item.querySelector('.result-add-btn').addEventListener('click', e => {
      e.stopPropagation();
      if (isAdded) { toast('Already on your shelf'); return; }
      pendingBook = {
        id: genId(),
        openLibKey: doc.key,
        title: doc.title || 'Unknown title',
        author: (doc.author_name || ['Unknown author']).slice(0,2).join(', '),
        year: doc.first_publish_year || null,
        coverId: coverId || null,
        coverKey: coverKey || null,
        status: 'want',
        rating: 0,
        review: '',
        addedAt: Date.now(),
      };
      openStatusAddModal(pendingBook);
    });
    searchResultsEl.appendChild(item);
  });
}

// ─── STATUS ADD MODAL ────────────────────────────────────────────────────────
function openStatusAddModal(book) {
  document.getElementById('status-add-book-name').textContent = `"${book.title}"`;
  const optContainer = document.getElementById('status-add-options');
  optContainer.innerHTML = '';
  STATUSES.forEach(s => {
    const btn = document.createElement('button');
    btn.className = 'status-add-option';
    btn.innerHTML = `<span style="width:8px;height:8px;border-radius:50%;background:${s.color};flex-shrink:0;display:inline-block;"></span>${s.label}`;
    btn.addEventListener('click', () => {
      book.status = s.key;
      library.push(book);
      saveLibrary();
      closeStatusAddModal();
      searchResultsEl.classList.remove('open');
      toast(`Added to "${s.label}"`);
      document.querySelectorAll(`.result-add-btn[data-key="${book.openLibKey}"]`).forEach(b => {
        b.textContent = 'Added'; b.classList.add('added');
      });
    });
    optContainer.appendChild(btn);
  });
  document.getElementById('status-add-modal').classList.add('open');
}
function closeStatusAddModal() {
  document.getElementById('status-add-modal').classList.remove('open');
  pendingBook = null;
}
document.getElementById('status-add-cancel').addEventListener('click', closeStatusAddModal);
document.getElementById('status-add-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('status-add-modal')) closeStatusAddModal();
});

// ─── TOAST ───────────────────────────────────────────────────────────────────
function toast(msg) {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => { t.classList.add('removing'); setTimeout(() => t.remove(), 240); }, 2400);
}

// ─── UTILS ───────────────────────────────────────────────────────────────────
function genId()    { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ─── AUTH MODAL CONTROL ──────────────────────────────────────────────────────
const authOverlay      = document.getElementById('auth-modal-overlay');
const authEmailInput   = document.getElementById('auth-email');
const authPassInput    = document.getElementById('auth-password');
const authNameInput    = document.getElementById('auth-displayname');
const authNameField    = document.getElementById('auth-displayname-field');
const authError        = document.getElementById('auth-error');
const authSubmitBtn    = document.getElementById('auth-submit-btn');
const authTitle        = document.getElementById('auth-modal-title');
const authSub          = document.getElementById('auth-modal-sub');
const authSwitch       = document.getElementById('auth-switch');

function openAuthModal(mode) {
  authMode = mode;
  authError.classList.remove('show');
  authEmailInput.value = '';
  authPassInput.value = '';
  authNameInput.value = '';
  renderAuthModeUI();
  authOverlay.classList.add('open');
}
function closeAuthModal() { authOverlay.classList.remove('open'); }

function renderAuthModeUI() {
  if (authMode === 'login') {
    authTitle.textContent = 'Welcome back';
    authSub.textContent = 'Sign in to sync your library across devices.';
    authNameField.style.display = 'none';
    authSubmitBtn.textContent = 'Sign In';
    authSwitch.innerHTML = `Don't have an account? <button id="auth-switch-btn">Sign up</button>`;
  } else {
    authTitle.textContent = 'Create your account';
    authSub.textContent = 'Track your reading and share it with friends.';
    authNameField.style.display = 'block';
    authSubmitBtn.textContent = 'Sign Up';
    authSwitch.innerHTML = `Already have an account? <button id="auth-switch-btn">Sign in</button>`;
  }
  document.getElementById('auth-switch-btn').addEventListener('click', () => {
    openAuthModal(authMode === 'login' ? 'signup' : 'login');
  });
}

document.getElementById('signin-btn').addEventListener('click', () => openAuthModal('login'));
document.getElementById('auth-close').addEventListener('click', closeAuthModal);
authOverlay.addEventListener('click', e => { if (e.target === authOverlay) closeAuthModal(); });

authSubmitBtn.addEventListener('click', async () => {
  if (!fb) { showAuthError('Still connecting — try again in a moment.'); return; }
  const email = authEmailInput.value.trim();
  const pass  = authPassInput.value;
  const name  = authNameInput.value.trim();

  if (!email || !pass) { showAuthError('Please fill in both fields.'); return; }
  if (authMode === 'signup' && pass.length < 6) { showAuthError('Password must be at least 6 characters.'); return; }

  authSubmitBtn.disabled = true;
  authSubmitBtn.textContent = authMode === 'login' ? 'Signing in…' : 'Creating account…';

  try {
    if (authMode === 'login') {
      await fb.signInWithEmailAndPassword(fb.auth, email, pass);
    } else {
      const cred = await fb.createUserWithEmailAndPassword(fb.auth, email, pass);
      if (name) await fb.updateProfile(cred.user, { displayName: name });
    }
    closeAuthModal();
  } catch (err) {
    showAuthError(friendlyAuthError(err.code));
  } finally {
    authSubmitBtn.disabled = false;
    renderAuthModeUI();
  }
});

function showAuthError(msg) {
  authError.textContent = msg;
  authError.classList.add('show');
}
function friendlyAuthError(code) {
  const map = {
    'auth/email-already-in-use': 'An account with this email already exists.',
    'auth/invalid-email': 'That email address looks invalid.',
    'auth/weak-password': 'Password must be at least 6 characters.',
    'auth/user-not-found': 'No account found with that email.',
    'auth/wrong-password': 'Incorrect password.',
    'auth/invalid-credential': 'Incorrect email or password.',
    'auth/too-many-requests': 'Too many attempts — please wait and try again.',
  };
  return map[code] || 'Something went wrong. Please try again.';
}

// ─── ACCOUNT DROPDOWN ────────────────────────────────────────────────────────
const accountBtn = document.getElementById('account-btn');
const accountDropdown = document.getElementById('account-dropdown');
accountBtn.addEventListener('click', e => {
  e.stopPropagation();
  accountDropdown.classList.toggle('open');
});
document.addEventListener('click', e => {
  if (!e.target.closest('.account-menu-wrap')) accountDropdown.classList.remove('open');
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  if (!fb) return;
  await fb.signOut(fb.auth);
  accountDropdown.classList.remove('open');
  toast('Signed out');
});

document.getElementById('sync-now-btn').addEventListener('click', async () => {
  if (!fb || !currentUser) return;
  accountDropdown.classList.remove('open');
  try {
    await fb.setDoc(
      fb.doc(fb.db, 'users', currentUser.uid),
      {
        displayName: currentUser.displayName || currentUser.email || 'Folio User',
        email: currentUser.email,
        library: library,
        updatedAt: Date.now()
      },
      { merge: true }
    );
    toast('Library synced');
  } catch(err) {
    toast('Sync failed — check console');
    console.error(err);
  }
});

document.getElementById('view-profile-btn').addEventListener('click', () => {
  if (!currentUser) return;
  const url = `${location.origin}${location.pathname}?profile=${currentUser.uid}`;
  window.open(url, '_blank');
});

document.getElementById('copy-share-link').addEventListener('click', () => {
  const input = document.getElementById('share-link-input');
  input.select();
  navigator.clipboard?.writeText(input.value).then(() => toast('Link copied to clipboard'))
    .catch(() => toast('Could not copy — copy it manually'));
});

document.getElementById('share-banner-exit').addEventListener('click', () => {
  const url = `${location.origin}${location.pathname}`;
  window.location.href = url;
});

// ─── AUTH STATE → UI ─────────────────────────────────────────────────────────
function updateAuthUI(user) {
  const signinBtn = document.getElementById('signin-btn');
  const menuWrap  = document.getElementById('account-menu-wrap');
  if (user) {
    signinBtn.style.display = 'none';
    menuWrap.style.display = 'block';
    const name = user.displayName || user.email || 'You';
    document.getElementById('account-label').textContent = name.split(' ')[0];
    document.getElementById('account-avatar').textContent = name.charAt(0);
    document.getElementById('account-email').textContent = user.email || '';
    document.getElementById('share-link-input').value = `${location.origin}${location.pathname}?profile=${user.uid}`;
  } else {
    signinBtn.style.display = 'inline-block';
    menuWrap.style.display = 'none';
  }
}

// ─── READ-ONLY PROFILE MODE ──────────────────────────────────────────────────
function applyReadOnlyMode(ownerName) {
  isReadOnly = true;
  document.body.classList.add('read-only');
  const banner = document.getElementById('share-banner');
  document.getElementById('share-banner-name').textContent = ownerName ? `${ownerName}'s` : "this person's";
  banner.classList.add('show');
  document.getElementById('search-input').disabled = true;
  document.getElementById('search-input').placeholder = 'Search is disabled while viewing a shared profile';
  document.getElementById('search-btn').disabled = true;
  document.getElementById('search-btn').style.opacity = '0.5';
  document.getElementById('search-btn').style.cursor = 'default';
}

// ─── FIREBASE READY → WIRE UP AUTH LISTENER ──────────────────────────────────
window.addEventListener('firebase-ready', () => {
  fb = window.__firebase;

  const params = new URLSearchParams(location.search);
  const profileId = params.get('profile');

  if (profileId) {
    // Read-only shared profile view — load that user's data, skip normal auth flow
    viewingProfileId = profileId;
    loadLibraryFromCloud(profileId).then(data => {
      if (data && Array.isArray(data.library)) {
        library = data.library;
        applyReadOnlyMode(data.displayName);
      } else {
        toast('Could not find that profile');
        library = [];
      }
      renderAll();
      updateStats();
    });
    document.getElementById('signin-btn').style.display = 'none';
    return; // don't run normal onAuthStateChanged flow in shared view
  }

  fb.onAuthStateChanged(fb.auth, async (user) => {
    currentUser = user;
    updateAuthUI(user);

    if (user) {
      // Load whatever is already in the cloud
      const cloudData = await loadLibraryFromCloud(user.uid);

      if (cloudData && Array.isArray(cloudData.library) && cloudData.library.length > 0) {
        // Cloud has data — use it (cloud is source of truth when signed in)
        library = cloudData.library;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(library));
        renderAll();
        updateStats();
        toast(`Welcome back, ${user.displayName || user.email}`);
      } else {
        // Cloud is empty — immediately push local library up so profile is visible
        const localLib = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        library = localLib;
        renderAll();
        updateStats();
        toast(`Signed in — syncing your library…`);
        // Force immediate write (skip debounce)
        try {
          await fb.setDoc(
            fb.doc(fb.db, 'users', user.uid),
            {
              displayName: user.displayName || user.email || 'Folio User',
              email: user.email,
              library: library,
              updatedAt: Date.now()
            },
            { merge: true }
          );
          toast('Library synced to cloud');
        } catch (err) {
          console.error('Initial sync failed:', err);
          toast('Could not sync — check your Firestore rules');
        }
      }
    } else {
      currentUser = null;
      loadLibrary();
      renderAll();
      updateStats();
    }
  });
});

// ─── FRIENDS SYSTEM ──────────────────────────────────────────────────────────

// Firestore schema:
// users/{uid}/friendRequests/{fromUid} = { fromName, fromEmail, sentAt }
// users/{uid}/friends/{friendUid}      = { name, email, addedAt }

const friendsOverlay = document.getElementById('friends-modal-overlay');
document.getElementById('friends-btn').addEventListener('click', () => {
  document.getElementById('account-dropdown').classList.remove('open');
  openFriendsModal();
});
document.getElementById('friends-modal-close').addEventListener('click', () => friendsOverlay.classList.remove('open'));
friendsOverlay.addEventListener('click', e => { if (e.target === friendsOverlay) friendsOverlay.classList.remove('open'); });

function openFriendsModal() {
  friendsOverlay.classList.add('open');
  document.getElementById('friends-search-results').innerHTML = '';
  document.getElementById('friends-search-input').value = '';
  if (currentUser) { loadFriendsList(); loadFriendRequests(); }
}

// ── Search users ──────────────────────────────────────────────────────────
document.getElementById('friends-search-btn').addEventListener('click', searchUsers);
document.getElementById('friends-search-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') searchUsers();
});

async function searchUsers() {
  if (!fb || !currentUser) return;
  const q = document.getElementById('friends-search-input').value.trim().toLowerCase();
  if (!q) return;
  const resultsEl = document.getElementById('friends-search-results');
  resultsEl.innerHTML = `<div style="font-size:0.8rem;color:var(--text-muted);padding:8px 0">Searching…</div>`;

  try {
    const snap = await fb.getDocs(fb.collection(fb.db, 'users'));
    const results = [];
    snap.forEach(d => {
      if (d.id === currentUser.uid) return;
      const data = d.data();
      const name  = (data.displayName || '').toLowerCase();
      const email = (data.email || '').toLowerCase();
      if (name.includes(q) || email.includes(q)) {
        results.push({ uid: d.id, name: data.displayName || 'Folio User', email: data.email || '' });
      }
    });

    if (!results.length) {
      resultsEl.innerHTML = `<div style="font-size:0.82rem;color:var(--text-muted);padding:8px 0">No users found.</div>`;
      return;
    }

    // Get current friends + pending to label buttons correctly
    const [friendsSnap, reqSnap] = await Promise.all([
      fb.getDocs(fb.collection(fb.db, 'users', currentUser.uid, 'friends')),
      fb.getDocs(fb.collection(fb.db, 'users', currentUser.uid, 'friendRequests'))
    ]);
    const friendIds  = new Set(friendsSnap.docs.map(d => d.id));
    const pendingIds = new Set(reqSnap.docs.map(d => d.id));

    resultsEl.innerHTML = '';
    results.forEach(u => {
      const isFriend  = friendIds.has(u.uid);
      const isPending = pendingIds.has(u.uid);
      const div = document.createElement('div');
      div.className = 'friend-search-result';
      div.innerHTML = `
        <div class="friend-search-avatar">${u.name.charAt(0)}</div>
        <div class="friend-search-info">
          <div class="friend-search-name">${escHtml(u.name)}</div>
          <div class="friend-search-email">${escHtml(u.email)}</div>
        </div>
        <button class="friend-action-btn ${isFriend ? 'friends' : isPending ? 'sent' : ''}" data-uid="${u.uid}">
          ${isFriend ? 'Friends' : isPending ? 'Sent' : 'Add friend'}
        </button>
      `;
      if (!isFriend && !isPending) {
        div.querySelector('.friend-action-btn').addEventListener('click', async () => {
          await sendFriendRequest(u);
          div.querySelector('.friend-action-btn').textContent = 'Sent';
          div.querySelector('.friend-action-btn').classList.add('sent');
        });
      }
      resultsEl.appendChild(div);
    });
  } catch (err) {
    console.error(err);
    resultsEl.innerHTML = `<div style="font-size:0.82rem;color:var(--red);padding:8px 0">Search failed.</div>`;
  }
}

async function sendFriendRequest(targetUser) {
  if (!fb || !currentUser) return;
  try {
    await fb.setDoc(
      fb.doc(fb.db, 'users', targetUser.uid, 'friendRequests', currentUser.uid),
      {
        fromUid:   currentUser.uid,
        fromName:  currentUser.displayName || currentUser.email,
        fromEmail: currentUser.email,
        sentAt:    Date.now()
      }
    );
    toast(`Friend request sent to ${targetUser.name}`);
  } catch (err) {
    console.error(err);
    toast('Could not send request');
  }
}

// ── Load incoming requests ────────────────────────────────────────────────
async function loadFriendRequests() {
  if (!fb || !currentUser) return;
  try {
    const snap = await fb.getDocs(fb.collection(fb.db, 'users', currentUser.uid, 'friendRequests'));
    const section = document.getElementById('friend-requests-section');
    const list    = document.getElementById('friend-requests-list');
    if (snap.empty) { section.style.display = 'none'; updateRequestBadge(0); return; }

    section.style.display = 'block';
    updateRequestBadge(snap.size);
    list.innerHTML = '';
    snap.forEach(d => {
      const req = d.data();
      const row = document.createElement('div');
      row.className = 'friend-req-row';
      row.innerHTML = `
        <div class="friend-search-avatar">${(req.fromName||'?').charAt(0)}</div>
        <div class="friend-req-info"><strong>${escHtml(req.fromName||'Someone')}</strong> wants to be friends</div>
        <div class="friend-req-actions">
          <button class="friend-accept-btn">Accept</button>
          <button class="friend-decline-btn">Decline</button>
        </div>
      `;
      row.querySelector('.friend-accept-btn').addEventListener('click', async () => {
        await acceptFriendRequest(req, d.id);
        row.remove();
        if (!list.children.length) { section.style.display = 'none'; updateRequestBadge(0); }
        loadFriendsList();
      });
      row.querySelector('.friend-decline-btn').addEventListener('click', async () => {
        await fb.deleteDoc(fb.doc(fb.db, 'users', currentUser.uid, 'friendRequests', d.id));
        row.remove();
        if (!list.children.length) { section.style.display = 'none'; updateRequestBadge(0); }
      });
      list.appendChild(row);
    });
  } catch (err) { console.error(err); }
}

async function acceptFriendRequest(req, fromUid) {
  if (!fb || !currentUser) return;
  const batch = fb.writeBatch(fb.db);
  // Add each other as friends
  batch.set(fb.doc(fb.db, 'users', currentUser.uid, 'friends', fromUid), {
    name: req.fromName || 'Folio User', email: req.fromEmail || '', addedAt: Date.now()
  });
  batch.set(fb.doc(fb.db, 'users', fromUid, 'friends', currentUser.uid), {
    name: currentUser.displayName || currentUser.email, email: currentUser.email, addedAt: Date.now()
  });
  // Delete the request
  batch.delete(fb.doc(fb.db, 'users', currentUser.uid, 'friendRequests', fromUid));
  await batch.commit();
  toast(`You and ${req.fromName} are now friends!`);
}

function updateRequestBadge(count) {
  const badge = document.getElementById('friend-req-badge');
  if (count > 0) { badge.textContent = count; badge.style.display = 'inline-flex'; }
  else { badge.style.display = 'none'; }
}

// ── Load friends list ─────────────────────────────────────────────────────
async function loadFriendsList() {
  if (!fb || !currentUser) return;
  const listEl = document.getElementById('friends-list');
  listEl.innerHTML = `<div style="font-size:0.8rem;color:var(--text-muted)">Loading…</div>`;
  try {
    const snap = await fb.getDocs(fb.collection(fb.db, 'users', currentUser.uid, 'friends'));
    if (snap.empty) {
      listEl.innerHTML = `<div class="friends-empty">No friends yet — search for someone above.</div>`;
      return;
    }
    listEl.innerHTML = '';

    // Load each friend's user doc for book count
    const friendDocs = await Promise.all(
      snap.docs.map(d => fb.getDoc(fb.doc(fb.db, 'users', d.id)).then(ud => ({ friendData: d.data(), uid: d.id, userData: ud.exists() ? ud.data() : null })))
    );

    friendDocs.forEach(({ friendData, uid, userData }) => {
      const bookCount = userData?.library?.length || 0;
      const readCount = userData?.library?.filter(b => b.status === 'finished').length || 0;
      const row = document.createElement('div');
      row.className = 'friend-row';
      row.innerHTML = `
        <div class="friend-row-avatar">${(friendData.name||'?').charAt(0)}</div>
        <div class="friend-row-info">
          <div class="friend-row-name">${escHtml(friendData.name||'Folio User')}</div>
          <div class="friend-row-books">${bookCount} books · ${readCount} finished</div>
        </div>
        <div class="friend-row-actions">
          <button class="friend-view-btn" data-uid="${uid}">View shelf</button>
          <button class="friend-remove-btn" data-uid="${uid}">Remove</button>
        </div>
      `;
      row.querySelector('.friend-view-btn').addEventListener('click', () => {
        friendsOverlay.classList.remove('open');
        openFriendProfile(uid, friendData.name, userData);
      });
      row.querySelector('.friend-remove-btn').addEventListener('click', async () => {
        if (!confirm(`Remove ${friendData.name} as a friend?`)) return;
        const b = fb.writeBatch(fb.db);
        b.delete(fb.doc(fb.db, 'users', currentUser.uid, 'friends', uid));
        b.delete(fb.doc(fb.db, 'users', uid, 'friends', currentUser.uid));
        await b.commit();
        row.remove();
        toast('Friend removed');
      });
      listEl.appendChild(row);
    });
  } catch (err) { console.error(err); listEl.innerHTML = `<div class="friends-empty">Could not load friends.</div>`; }
}

// ── Friend profile view ───────────────────────────────────────────────────
async function openFriendProfile(uid, name, userData) {
  const overlay = document.getElementById('friend-profile-overlay');
  const shelvesEl = document.getElementById('friend-profile-shelves');

  // Fill header
  document.getElementById('friend-profile-avatar').textContent = (name||'?').charAt(0);
  document.getElementById('friend-profile-name').textContent = name || 'Folio User';

  const lib = userData?.library || [];
  const finished = lib.filter(b => b.status === 'finished').length;
  const reading  = lib.filter(b => b.status === 'reading').length;
  document.getElementById('friend-profile-stats').innerHTML =
    `<span><strong>${lib.length}</strong> books</span><span><strong>${finished}</strong> finished</span><span><strong>${reading}</strong> reading</span>`;

  overlay.style.display = 'block';
  shelvesEl.innerHTML = '';

  if (!lib.length) {
    shelvesEl.innerHTML = `<div style="padding:48px;text-align:center;color:var(--text-muted);font-size:0.9rem">${escHtml(name)} hasn't added any books yet.</div>`;
    return;
  }

  STATUSES.forEach(s => {
    const books = lib.filter(b => b.status === s.key);
    if (!books.length) return;

    const section = document.createElement('section');
    section.style.cssText = 'margin-bottom:48px';
    section.innerHTML = `
      <div class="shelf-header" style="margin-bottom:18px;padding-bottom:12px;border-bottom:1.5px solid var(--border);display:flex;align-items:center;gap:12px">
        <span class="shelf-dot" style="background:${s.color};width:10px;height:10px;border-radius:50%;flex-shrink:0"></span>
        <span style="font-family:'Playfair Display',serif;font-size:1.15rem;font-weight:600;color:var(--text)">${s.label}</span>
        <span style="font-size:0.74rem;font-weight:600;padding:2px 9px;border-radius:50px;background:var(--bg-alt);color:var(--text-muted);border:1px solid var(--border)">${books.length}</span>
      </div>
      <div class="books-grid" id="friend-grid-${s.key}"></div>
    `;
    shelvesEl.appendChild(section);

    const grid = section.querySelector(`#friend-grid-${s.key}`);
    books.forEach(book => {
      // Build read-only card
      const url = coverUrl(book, 'M');
      const card = document.createElement('div');
      card.className = 'book-card';
      card.style.cursor = 'default';
      const coverHtml = url
        ? `<img src="${url}" alt="${escHtml(book.title)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
        : '';
      const placeholder = `<div class="book-cover-placeholder" ${url?'style="display:none"':''}>${bookIconSvg}<span class="cover-title">${escHtml(book.title)}</span></div>`;
      const starsHtml = [1,2,3,4,5].map(v =>
        `<span style="font-size:0.82rem;color:${book.rating>=v?'var(--accent)':'var(--border-mid)'}">★</span>`
      ).join('');
      const reviewSnippet = book.review
        ? `<div class="book-review-snippet">${escHtml(book.review)}</div>` : '';
      card.innerHTML = `
        <div class="book-cover-wrap">
          ${coverHtml}${placeholder}
          <span class="status-badge ${s.badgeClass}">${s.badge}</span>
        </div>
        <div class="book-info">
          <div class="book-title">${escHtml(book.title)}</div>
          <div class="book-author">${escHtml(book.author||'Unknown author')}</div>
          <div style="display:flex;gap:1px">${starsHtml}</div>
          ${reviewSnippet}
        </div>
      `;
      grid.appendChild(card);
    });
  });
}

document.getElementById('friend-profile-back').addEventListener('click', () => {
  document.getElementById('friend-profile-overlay').style.display = 'none';
  openFriendsModal();
});

// Poll for new friend requests every 60s while signed in
setInterval(() => { if (currentUser && fb) loadFriendRequests(); }, 60000);

// ─── INIT ────────────────────────────────────────────────────────────────────
loadLibrary();
renderAll();
updateStats();

</script>
