const form = document.getElementById('todo-form');
const input = document.getElementById('todo-input');
const priorityInput = document.getElementById('priority-input');
const dueInput = document.getElementById('due-input');
const searchInput = document.getElementById('search-input');
const sortSelect = document.getElementById('sort-select');
const list = document.getElementById('todo-list');
const count = document.getElementById('count');
const clearBtn = document.getElementById('clear-completed');
const filterBtns = document.querySelectorAll('.filters button');
const themeBtn = document.getElementById('theme-toggle');
const progressBar = document.getElementById('progress-bar');
const progressLabel = document.getElementById('progress-label');
// --- auth + API (server if present, else localStorage fallback) ---
const authBox = document.getElementById('auth-box');
const appBox = document.getElementById('app-box');
const authEmail = document.getElementById('auth-email');
const authPw = document.getElementById('auth-password');
const authErr = document.getElementById('auth-error');
const authSubmit = document.getElementById('auth-submit');
const authTitle = document.getElementById('auth-title');
const authSwitch = document.getElementById('auth-switch');
const authSwitchText = document.getElementById('auth-switch-text');
const userEmailEl = document.getElementById('user-email');
const logoutBtn = document.getElementById('logout-btn');
let authMode = 'login'; // or 'register'
let token = localStorage.getItem('token') || '';
let userEmail = localStorage.getItem('userEmail') || '';
let serverMode = false;

async function api(path, opts = {}) {
  const r = await fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(opts.headers || {}) },
  });
  if (r.status === 401) { doLogout(); throw new Error('Session expired — please log in again.'); }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Request failed');
  return data;
}
async function detectServer() {
  try {
    const r = await fetch('/api/todos', { headers: token ? { Authorization: 'Bearer ' + token } : {} });
    serverMode = r.status !== 404;
    if (r.status === 401) { token = ''; }
    return serverMode;
  } catch { serverMode = false; return false; }
}
function showApp(loggedIn) {
  authBox.classList.toggle('hidden', loggedIn);
  appBox.classList.toggle('hidden', !loggedIn);
  logoutBtn.classList.toggle('hidden', !loggedIn);
  userEmailEl.textContent = loggedIn ? userEmail : '';
}
authSwitch.addEventListener('click', e => {
  e.preventDefault();
  authMode = authMode === 'login' ? 'register' : 'login';
  authTitle.textContent = authMode === 'login' ? 'Login' : 'Register';
  authSubmit.textContent = authMode === 'login' ? 'Login' : 'Register';
  authSwitchText.textContent = authMode === 'login' ? 'No account?' : 'Have an account?';
  authSwitch.textContent = authMode === 'login' ? 'Register' : 'Login';
  authErr.textContent = '';
});
authSubmit.addEventListener('click', async () => {
  authErr.textContent = '';
  try {
    const d = await api('/api/' + authMode, {
      method: 'POST', body: JSON.stringify({ email: authEmail.value, password: authPw.value }),
    });
    token = d.token; userEmail = d.email;
    localStorage.setItem('token', token); localStorage.setItem('userEmail', userEmail);
    showApp(true); await loadTodos(); render();
  } catch (e) { authErr.textContent = e.message; }
});
function doLogout() {
  token = ''; userEmail = '';
  localStorage.removeItem('token'); localStorage.removeItem('userEmail');
  todos = []; showApp(false); render();
}
logoutBtn.addEventListener('click', doLogout);

let todos = JSON.parse(localStorage.getItem('todos') || '[]');
// migrate old todos without new fields
todos = todos.map(t => ({ priority: 'medium', due: '', ...t }));
let filter = 'all';
let search = '';
let sort = localStorage.getItem('sort') || 'manual';
sortSelect.value = sort;

// --- theme ---
let theme = localStorage.getItem('theme') || 'light';
applyTheme();
themeBtn.addEventListener('click', () => {
  theme = theme === 'light' ? 'dark' : 'light';
  localStorage.setItem('theme', theme);
  applyTheme();
});
function applyTheme() {
  document.body.classList.toggle('dark', theme === 'dark');
  themeBtn.textContent = theme === 'dark' ? '☀️' : '🌙';
}

// --- events ---
form.addEventListener('submit', async e => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  const todo = { text, done: false, priority: priorityInput.value, due: dueInput.value };
  if (serverMode) {
    const r = await api('/api/todos', { method: 'POST', body: JSON.stringify(todo) }).catch(err => { alert(err.message); return null; });
    if (!r) return;
    todo.id = r.id;
  } else {
    todo.id = Date.now();
  }
  todos.unshift(todo);
  input.value = ''; dueInput.value = ''; priorityInput.value = 'medium';
  save(); render();
});
clearBtn.addEventListener('click', async () => {
  if (serverMode) {
    for (const t of todos.filter(t => t.done)) {
      try { await api('/api/todos/' + t.id, { method: 'DELETE' }); } catch {}
    }
    await loadTodos();
  } else todos = todos.filter(t => !t.done);
  save(); render();
});
filterBtns.forEach(b => b.addEventListener('click', () => {
  filter = b.dataset.filter;
  filterBtns.forEach(x => x.classList.toggle('active', x === b));
  render();
}));
searchInput.addEventListener('input', () => { search = searchInput.value.toLowerCase(); render(); });
sortSelect.addEventListener('change', () => { sort = sortSelect.value; localStorage.setItem('sort', sort); render(); });

function save() {
  if (serverMode) return; // server is source of truth
  localStorage.setItem('todos', JSON.stringify(todos));
}
async function syncTodo(t, patch) {
  Object.assign(t, patch);
  if (serverMode) { try { await api('/api/todos/' + t.id, { method: 'PATCH', body: JSON.stringify(patch) }); } catch (e) { alert(e.message); } }
  else save();
  render();
}
async function loadTodos() {
  if (!serverMode) return;
  try { todos = await api('/api/todos'); }
  catch (e) { console.warn(e.message); }
}

function todayStr() { return new Date().toISOString().slice(0, 10); }

function sorted(arr) {
  const a = [...arr];
  if (sort === 'priority') {
    const w = { high: 0, medium: 1, low: 2 };
    a.sort((x, y) => (w[x.priority] ?? 1) - (w[y.priority] ?? 1));
  } else if (sort === 'due') {
    a.sort((x, y) => (x.due || '9999') < (y.due || '9999') ? -1 : 1);
  } else if (sort === 'newest') {
    a.sort((x, y) => y.id - x.id);
  }
  return a;
}

function render() {
  list.innerHTML = '';
  const visible = sorted(todos.filter(t =>
    (filter === 'all' || (filter === 'active' ? !t.done : t.done)) &&
    t.text.toLowerCase().includes(search)));

  if (!visible.length) {
    list.innerHTML = '<div class="empty">Nothing here — enjoy the day! 🎉</div>';
  }

  visible.forEach(t => {
    const li = document.createElement('li');
    if (t.done) li.classList.add('done');
    li.draggable = sort === 'manual';

    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.checked = t.done;
    cb.addEventListener('change', () => syncTodo(t, { done: cb.checked }));

    const span = document.createElement('span');
    span.textContent = t.text;
    if (t.due) {
      const meta = document.createElement('span');
      meta.className = 'meta' + (!t.done && t.due < todayStr() ? ' overdue' : '');
      const d = new Date(t.due + 'T00:00:00');
      meta.textContent = (!t.done && t.due < todayStr() ? '⚠️ Overdue: ' : '📅 ') + d.toLocaleDateString();
      span.appendChild(document.createElement('br'));
      span.appendChild(meta);
    }
    span.addEventListener('dblclick', () => {
      const v = prompt('Edit todo:', t.text);
      if (v !== null && v.trim()) syncTodo(t, { text: v.trim() });
    });

    const badge = document.createElement('span');
    badge.className = 'badge ' + t.priority;
    badge.textContent = t.priority.toUpperCase();
    badge.title = 'Click to cycle priority';
    badge.style.cursor = 'pointer';
    badge.addEventListener('click', () => {
      syncTodo(t, { priority: t.priority === 'low' ? 'medium' : t.priority === 'medium' ? 'high' : 'low' });
    });

    const del = document.createElement('button');
    del.textContent = '✕'; del.className = 'del';
    del.addEventListener('click', async () => {
      if (serverMode) { try { await api('/api/todos/' + t.id, { method: 'DELETE' }); } catch (e) { alert(e.message); return; } }
      todos = todos.filter(x => x.id !== t.id); save(); render();
    });

    // drag to reorder (manual sort only)
    li.addEventListener('dragstart', () => li.classList.add('dragging'));
    li.addEventListener('dragend', () => {
      li.classList.remove('dragging');
      const ids = [...list.querySelectorAll('li')].map(el => +el.dataset.id);
      const map = Object.fromEntries(todos.map(t => [t.id, t]));
      todos = ids.map(id => map[id]).filter(Boolean);
      todos.push(...Object.values(map).filter(t => !ids.includes(t.id)));
      if (serverMode) api('/api/todos/reorder', { method: 'POST', body: JSON.stringify({ ids }) }).catch(() => {});
      else save();
      render();
    });
    li.addEventListener('dragover', e => {
      e.preventDefault();
      const dragging = list.querySelector('.dragging');
      if (!dragging || dragging === li) return;
      const rect = li.getBoundingClientRect();
      const after = (e.clientY - rect.top) > rect.height / 2;
      list.insertBefore(dragging, after ? li.nextSibling : li);
    });
    li.dataset.id = t.id;

    li.append(cb, span, badge, del);
    list.appendChild(li);
  });

  const left = todos.filter(t => !t.done).length;
  count.textContent = `${left} item${left === 1 ? '' : 's'} left`;

  // progress bar
  const pct = todos.length ? Math.round(todos.filter(t => t.done).length / todos.length * 100) : 0;
  progressBar.style.width = pct + '%';
  progressLabel.textContent = todos.length ? `${pct}% complete` : '';
}
// boot: use server backend if available, else localStorage fallback
(async () => {
  await detectServer();
  if (serverMode && token) { showApp(true); await loadTodos(); }
  else if (serverMode) { showApp(false); }
  else { appBox.classList.remove('hidden'); authBox.classList.add('hidden'); }
  render();
})();
