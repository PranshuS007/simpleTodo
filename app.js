const form = document.getElementById('todo-form');
const input = document.getElementById('todo-input');
const list = document.getElementById('todo-list');
const count = document.getElementById('count');
const clearBtn = document.getElementById('clear-completed');
const filterBtns = document.querySelectorAll('.filters button');

let todos = JSON.parse(localStorage.getItem('todos') || '[]');
let filter = 'all';

form.addEventListener('submit', e => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  todos.push({ id: Date.now(), text, done: false });
  input.value = '';
  save(); render();
});

clearBtn.addEventListener('click', () => {
  todos = todos.filter(t => !t.done);
  save(); render();
});

filterBtns.forEach(b => b.addEventListener('click', () => {
  filter = b.dataset.filter;
  filterBtns.forEach(x => x.classList.toggle('active', x === b));
  render();
}));

function save() { localStorage.setItem('todos', JSON.stringify(todos)); }

function render() {
  list.innerHTML = '';
  const visible = todos.filter(t =>
    filter === 'all' ? true : filter === 'active' ? !t.done : t.done);
  visible.forEach(t => {
    const li = document.createElement('li');
    if (t.done) li.classList.add('done');
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.checked = t.done;
    cb.addEventListener('change', () => { t.done = cb.checked; save(); render(); });
    const span = document.createElement('span');
    span.textContent = t.text;
    span.addEventListener('dblclick', () => {
      const v = prompt('Edit todo:', t.text);
      if (v !== null && v.trim()) { t.text = v.trim(); save(); render(); }
    });
    const del = document.createElement('button');
    del.textContent = '✕'; del.className = 'del';
    del.addEventListener('click', () => { todos = todos.filter(x => x.id !== t.id); save(); render(); });
    li.append(cb, span, del);
    list.appendChild(li);
  });
  const left = todos.filter(t => !t.done).length;
  count.textContent = `${left} item${left === 1 ? '' : 's'} left`;
}
render();
