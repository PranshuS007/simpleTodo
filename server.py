"""simpleTodo backend: Flask + Postgres (with SQLite fallback for local dev).
Auth: email + password (SHA-256 + salt), token = signed secret via secrets.token_hex stored in DB-less memory? No - stateless HMAC token.

Run:
  pip install -r requirements.txt
  # Postgres:
  set DATABASE_URL=postgresql://user:pass@localhost:5432/simpletodo
  python server.py
  # without DATABASE_URL it uses local sqlite file tododb.sqlite
"""
import hashlib, hmac, json, os, secrets, sqlite3, time
from functools import wraps
from flask import Flask, request, jsonify, send_from_directory

app = Flask(__name__, static_folder='.', static_url_path='')
SECRET = os.environ.get('AUTH_SECRET', 'dev-secret-change-me')
DB_URL = os.environ.get('DATABASE_URL', '')
USE_PG = DB_URL.startswith('postgres')
pg_conn = None

def db():
    if USE_PG:
        import psycopg2, psycopg2.extras
        c = psycopg2.connect(DB_URL)
        c.autocommit = True
        return c
    c = sqlite3.connect('tododb.sqlite')
    c.row_factory = sqlite3.Row
    c.execute("""CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP)""")
    c.execute("""CREATE TABLE IF NOT EXISTS todos(id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INT NOT NULL, text TEXT NOT NULL, done INT DEFAULT 0, priority TEXT DEFAULT 'medium',
      due TEXT, position INT DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP)""")
    c.commit()
    return c

def init_pg():
    c = db()
    cur = c.cursor()
    cur.execute(open('schema.sql').read() if os.path.exists('schema.sql') else
      "CREATE TABLE IF NOT EXISTS users(id SERIAL PRIMARY KEY,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,created_at TIMESTAMPTZ DEFAULT now())")
    c.close()

def pw_hash(pw, salt=None):
    salt = salt or secrets.token_hex(8)
    h = hashlib.sha256((salt + pw).encode()).hexdigest()
    return f"{salt}${h}"

def pw_ok(pw, stored):
    salt, h = stored.split('$', 1)
    return hmac.compare_digest(hashlib.sha256((salt + pw).encode()).hexdigest(), h)

def make_token(uid):
    exp = int(time.time()) + 7 * 86400
    body = f"{uid}.{exp}"
    sig = hmac.new(SECRET.encode(), body.encode(), hashlib.sha256).hexdigest()
    return f"{body}.{sig}"

def check_token(tok):
    try:
        uid, exp, sig = tok.split('.')
        if int(exp) < time.time(): return None
        good = hmac.new(SECRET.encode(), f"{uid}.{exp}".encode(), hashlib.sha256).hexdigest()
        if hmac.compare_digest(good, sig): return int(uid)
    except Exception: pass
    return None

def auth(f):
    @wraps(f)
    def w(*a, **kw):
        t = (request.headers.get('Authorization', '') or '').replace('Bearer ', '')
        uid = check_token(t)
        if not uid: return jsonify({'error': 'unauthorized'}), 401
        return f(uid, *a, **kw)
    return w

@app.get('/')
def idx(): return send_from_directory('.', 'index.html')

@app.post('/api/register')
def register():
    d = request.get_json(force=True)
    email, pw = (d.get('email') or '').strip().lower(), d.get('password') or ''
    if '@' not in email or len(pw) < 4: return jsonify({'error': 'email + password (min 4 chars) required'}), 400
    c = db(); cur = c.cursor()
    ph = '%s' if USE_PG else '?'
    try:
        if USE_PG:
            cur.execute(f"INSERT INTO users(email,password_hash) VALUES(%s,%s) RETURNING id", (email, pw_hash(pw)))
            uid = cur.fetchone()[0]
        else:
            cur.execute("INSERT INTO users(email,password_hash) VALUES(?,?)", (email, pw_hash(pw)))
            c.commit(); uid = cur.lastrowid
    except Exception: c.close(); return jsonify({'error': 'email already registered'}), 409
    c.close()
    return jsonify({'token': make_token(uid), 'email': email})

@app.post('/api/login')
def login():
    d = request.get_json(force=True)
    email, pw = (d.get('email') or '').strip().lower(), d.get('password') or ''
    c = db(); cur = c.cursor()
    if USE_PG:
        import psycopg2.extras
        cur = c.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT * FROM users WHERE email=%s", (email,))
        u = cur.fetchone()
    else:
        cur.execute("SELECT * FROM users WHERE email=?", (email,))
        r = cur.fetchone(); u = dict(r) if r else None
    c.close()
    if not u or not pw_ok(pw, u['password_hash']): return jsonify({'error': 'invalid email/password'}), 401
    return jsonify({'token': make_token(u['id']), 'email': email})

@app.get('/api/todos')
@auth
def list_todos(uid):
    c = db(); cur = c.cursor()
    if USE_PG:
        import psycopg2.extras
        cur = c.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT * FROM todos WHERE user_id=%s ORDER BY position, id", (uid,))
        rows = [dict(r) for r in cur.fetchall()]
    else:
        cur.execute("SELECT * FROM todos WHERE user_id=? ORDER BY position, id", (uid,))
        rows = [dict(r) for r in cur.fetchall()]
    c.close()
    for r in rows:
        r['done'] = bool(r['done']); r['due'] = (str(r['due']) if r['due'] else '')
    return jsonify(rows)

@app.post('/api/todos')
@auth
def add_todo(uid):
    d = request.get_json(force=True)
    if not (d.get('text') or '').strip(): return jsonify({'error': 'text required'}), 400
    c = db(); cur = c.cursor()
    pr = d.get('priority', 'medium'); due = d.get('due') or None
    if USE_PG:
        cur.execute("INSERT INTO todos(user_id,text,priority,due) VALUES(%s,%s,%s,%s) RETURNING id",
                    (uid, d['text'].strip(), pr, due))
        nid = cur.fetchone()[0]
    else:
        cur.execute("INSERT INTO todos(user_id,text,priority,due) VALUES(?,?,?,?)",
                    (uid, d['text'].strip(), pr, due))
        c.commit(); nid = cur.lastrowid
    c.close()
    return jsonify({'id': nid}), 201

@app.patch('/api/todos/<int:tid>')
@auth
def upd_todo(uid, tid):
    d = request.get_json(force=True)
    allowed = {k: d[k] for k in ('text', 'done', 'priority', 'due') if k in d}
    if not allowed: return jsonify({'error': 'nothing to update'}), 400
    if 'done' in allowed: allowed['done'] = int(bool(allowed['done']))
    if 'due' in allowed and not allowed['due']: allowed['due'] = None
    c = db(); cur = c.cursor()
    sets = ', '.join(f"{k}={'%s' if USE_PG else '?'}" for k in allowed)
    vals = list(allowed.values()) + [tid, uid]
    q = f"UPDATE todos SET {sets} WHERE id={'%s' if USE_PG else '?'} AND user_id={'%s' if USE_PG else '?'}"
    cur.execute(q, vals)
    if not USE_PG: c.commit()
    c.close()
    return jsonify({'ok': True})

@app.delete('/api/todos/<int:tid>')
@auth
def del_todo(uid, tid):
    c = db(); cur = c.cursor()
    q = f"DELETE FROM todos WHERE id={'%s' if USE_PG else '?'} AND user_id={'%s' if USE_PG else '?'}"
    cur.execute(q, (tid, uid))
    if not USE_PG: c.commit()
    c.close()
    return jsonify({'ok': True})

@app.post('/api/todos/reorder')
@auth
def reorder(uid):
    ids = (request.get_json(force=True) or {}).get('ids', [])
    c = db(); cur = c.cursor()
    for pos, tid in enumerate(ids):
        q = f"UPDATE todos SET position={'%s' if USE_PG else '?'} WHERE id={'%s' if USE_PG else '?'} AND user_id={'%s' if USE_PG else '?'}"
        cur.execute(q, (pos, tid, uid))
    if not USE_PG: c.commit()
    c.close()
    return jsonify({'ok': True})

if __name__ == '__main__':
    if USE_PG:
        try: init_pg(); print('Postgres connected.')
        except Exception as e: print('Postgres init failed:', e)
    else: db().close(); print('Using local SQLite (set DATABASE_URL for Postgres).')
    app.run(port=int(os.environ.get('PORT', 5000)), debug=True)
