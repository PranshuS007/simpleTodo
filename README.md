# ✅ simpleTodo

A todo app with user accounts, a Postgres backend, and a full-featured UI (dark mode, priorities, due dates, search, sorting, drag-to-reorder, progress bar). Works with the server backend **or** standalone with `localStorage` (just open `index.html`).

![Todo App Screenshot](screenshot.png)

## Features

- 🔐 Simple auth — register / login with email + password, token session (7 days)
- 🐘 Postgres storage per user (SQLite fallback for local dev without Postgres)
- ➕ Add / complete / delete todos, ✏️ double-click to edit
- 🌙 Dark / light theme toggle (saved)
- 🔴 Priority levels — Low / Medium / High (click badge to cycle)
- 📅 Due dates with ⚠️ overdue highlighting
- 🔍 Live search
- ↕️ Sort by priority, due date, or newest — plus drag-to-reorder in Manual mode
- 📊 Progress bar showing % complete

## Run with backend (auth + Postgres)

```sh
pip install -r requirements.txt
# create db + tables:
#   createdb simpletodo && psql simpletodo -f schema.sql
export DATABASE_URL=postgresql://user:pass@localhost:5432/simpletodo
export AUTH_SECRET=a-long-random-string
python server.py   # serves the app + API at http://localhost:5000
```

Without `DATABASE_URL` it uses a local `tododb.sqlite` file — same API, no setup.

## API reference

| Method | Endpoint | Auth | Body | What |
|--------|----------|------|------|------|
| POST | `/api/register` | — | `{email, password}` | Create account → `{token, email}` |
| POST | `/api/login` | — | `{email, password}` | Log in → `{token, email}` |
| GET | `/api/todos` | Bearer token | — | List your todos |
| POST | `/api/todos` | Bearer token | `{text, priority?, due?}` | Add a todo |
| PATCH | `/api/todos/:id` | Bearer token | `{text?, done?, priority?, due?}` | Update a todo |
| DELETE | `/api/todos/:id` | Bearer token | — | Delete a todo |
| POST | `/api/todos/reorder` | Bearer token | `{ids: [...]}` | Save manual order |

Passwords need min 4 chars; tokens expire after 7 days.

## Verify it works

1. `python server.py` → open http://localhost:5000
2. Register a new account, add a todo, reload — it should persist
3. Open the app in another browser / incognito — your todos should *not* be there until you log in
4. `curl -X POST localhost:5000/api/todos -H "Content-Type: application/json" -d '{"text":"x"}'` → expect `401 unauthorized` (auth is enforced)

> ⚠️ Note: the Postgres path hasn't been live-tested in this workspace (no Postgres available here — SQLite fallback was used). Please run the verify steps above against your own Postgres before treating it as production-ready.

## Standalone (no backend)

Just open `index.html` in a browser — todos persist in `localStorage`, no login needed.

## Files

| File | What |
|------|------|
| `index.html` | App markup (+ login/register box) |
| `style.css` | Styling + dark theme |
| `app.js` | UI + API client with localStorage fallback |
| `server.py` | Flask API + auth + Postgres/SQLite |
| `schema.sql` | Postgres `users` + `todos` tables |
| `requirements.txt` | `flask`, `psycopg2-binary` |
| `screenshot.png` | App screenshot |
