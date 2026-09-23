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
form.addEventListener('submit', e => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  todos.unshift({ id: Date.now(), text, done: false, priority: priorityInput.value, due: dueInput.value });
  input.value = ''; dueInput.value = ''; priorityInput.value = 'medium';
  save(); render();
});
clearBtn.addEventListener('click', () => { todos = todos.filter(t => !t.done); save(); render(); });
filterBtns.forEach(b => b.addEventListener('click', () => {
  filter = b.dataset.filter;
  filterBtns.forEach(x => x.classList.toggle('active', x === b));
  render();
}));
searchInput.addEventListener('input', () => { search = searchInput.value.toLowerCase(); render(); });
sortSelect.addEventListener('change', () => { sort = sortSelect.value; localStorage.setItem('sort', sort); render(); });

function save() { localStorage.setItem('todos', JSON.stringify(todos)); }

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
    cb.addEventListener('change', () => { t.done = cb.checked; save(); render(); });

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
      if (v !== null && v.trim()) { t.text = v.trim(); save(); render(); }
    });

    const badge = document.createElement('span');
    badge.className = 'badge ' + t.priority;
    badge.textContent = t.priority.toUpperCase();
    badge.title = 'Click to cycle priority';
    badge.style.cursor = 'pointer';
    badge.addEventListener('click', () => {
      t.priority = t.priority === 'low' ? 'medium' : t.priority === 'medium' ? 'high' : 'low';
      save(); render();
    });

    const del = document.createElement('button');
    del.textContent = '✕'; del.className = 'del';
    del.addEventListener('click', () => { todos = todos.filter(x => x.id !== t.id); save(); render(); });

    // drag to reorder (manual sort only)
    li.addEventListener('dragstart', () => li.classList.add('dragging'));
    li.addEventListener('dragend', () => {
      li.classList.remove('dragging');
      const ids = [...list.querySelectorAll('li')].map(el => +el.dataset.id);
      const map = Object.fromEntries(todos.map(t => [t.id, t]));
      todos = ids.map(id => map[id]).filter(Boolean);
      // keep any hidden items (filtered out) at the end in original order
      todos.push(...Object.values(map).filter(t => !ids.includes(t.id)));
      save(); render();
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
render();
