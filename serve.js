var http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto'), cp = require('child_process')

var ROOT = process.cwd(), APP = __dirname, PORT = +process.argv.slice(2).filter(function (a) { return /^\d+$/.test(a) })[0] || 8000, OPEN = process.argv.indexOf('--no-open') < 0, KEY = crypto.randomBytes(16).toString('hex')
var DRAFT = null, WATCH = new Set()

function say(t) {
  process.stdout.write(t + '\n')
}

var TYPES = {
  html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8', txt: 'text/plain; charset=utf-8', svg: 'image/svg+xml', xml: 'application/xml',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', ico: 'image/x-icon',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mp3: 'audio/mpeg', wav: 'audio/wav',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf', pdf: 'application/pdf'
}

function local(req) {
  var a = req.socket.remoteAddress || '', h = (req.headers.host || '').split(':')[0]
  return /^(127\.|::1$|::ffff:127\.)/.test(a) && (h == 'localhost' || h == '127.0.0.1')
}

function inside(base, p) {
  var f = path.resolve(base, '.' + path.sep + p)
  return f == base || f.indexOf(base + path.sep) == 0 ? f : null
}

function hidden(rel) {
  return rel.split('/').some(function (x) { return x.charAt(0) == '.' || x == 'node_modules' })
}

function appRel() {
  var r = path.relative(ROOT, APP).split(path.sep).join('/')
  return r && r.indexOf('..') != 0 ? r : null
}

function walk(d, rel, out) {
  for (var n of fs.readdirSync(d, { withFileTypes: true })) {
    var r = rel ? rel + '/' + n.name : n.name
    if (hidden(r) || r == appRel()) continue
    if (n.isDirectory()) {
      out.folders.push(r)
      walk(path.join(d, n.name), r, out)
    } else if (n.isFile()) out.files.push(r)
  }
  return out
}

function send(res, code, body, type) {
  res.writeHead(code, { 'content-type': type || 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
  res.end(body)
}

function file(res, f) {
  fs.stat(f, function (e, st) {
    if (e || !st.isFile()) return send(res, 404, 'not found')
    res.writeHead(200, { 'content-type': TYPES[path.extname(f).slice(1).toLowerCase()] || 'application/octet-stream', 'content-length': st.size, 'cache-control': 'no-store' })
    fs.createReadStream(f).pipe(res)
  })
}

function body(req) {
  return new Promise(function (ok, no) {
    var c = []
    req.on('data', function (x) { c.push(x) })
    req.on('end', function () { ok(Buffer.concat(c)) })
    req.on('error', no)
  })
}

function addresses() {
  var out = []
  Object.values(os.networkInterfaces()).forEach(function (l) {
    ;(l || []).forEach(function (a) { if (a.family == 'IPv4' && !a.internal) out.push('http://' + a.address + ':' + PORT + '/mastermind/phone.html') })
  })
  return out
}

function tell() {
  var m = 'data: ' + JSON.stringify({ t: Date.now() }) + '\n\n'
  WATCH.forEach(function (r) { r.write(m) })
}

async function api(req, res, u) {
  if (!local(req) || req.headers['x-mastermind-key'] != KEY) return send(res, 403, 'only this computer can do that')
  var p = u.searchParams.get('p') || '', f = p && !hidden(p) ? inside(ROOT, p) : null, w = u.pathname.slice(16)
  if (w == 'info') return send(res, 200, JSON.stringify({ name: path.basename(ROOT), phones: addresses(), watching: WATCH.size }), TYPES.json)
  if (w == 'list') return send(res, 200, JSON.stringify(walk(ROOT, '', { files: [], folders: [] })), TYPES.json)
  if (w == 'draft' && req.method == 'POST') {
    DRAFT = await body(req)
    tell()
    return send(res, 200, 'ok')
  }
  if (w != 'file' || !f) return send(res, 400, 'bad request')
  if (req.method == 'GET') return file(res, f)
  if (req.method == 'PUT') {
    var b = await body(req)
    fs.mkdirSync(path.dirname(f), { recursive: true })
    fs.writeFileSync(f, b)
    return send(res, 200, 'ok')
  }
  if (req.method == 'DELETE') {
    fs.rmSync(f, { force: true })
    var d = path.dirname(f)
    while (d != ROOT && d.indexOf(ROOT) == 0 && !fs.readdirSync(d).length) {
      fs.rmdirSync(d)
      d = path.dirname(d)
    }
    return send(res, 200, 'ok')
  }
  send(res, 405, 'no')
}

var server = http.createServer(function (req, res) {
  var u = new URL(req.url, 'http://localhost'), p = decodeURIComponent(u.pathname)
  if (p.indexOf('/mastermind-api/') == 0) return api(req, res, u).catch(function (e) { send(res, 500, String(e.message)) })
  if (req.method != 'GET' && req.method != 'HEAD') return send(res, 405, 'read only')
  if (p == '/mastermind-live/draft') {
    if (DRAFT) return send(res, 200, DRAFT, TYPES.json)
    return file(res, path.join(ROOT, 'mastermind.json'))
  }
  if (p == '/mastermind-live/events') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' })
    res.write(': hi\n\n')
    WATCH.add(res)
    req.on('close', function () { WATCH.delete(res) })
    return
  }
  var f
  if (p == '/mastermind' || p.indexOf('/mastermind/') == 0) {
    if (p == '/mastermind') { res.writeHead(301, { location: '/mastermind/' }); return res.end() }
    f = inside(APP, p.slice(12) || 'index.html')
  } else {
    var rel = p.slice(1)
    if (hidden(rel)) return send(res, 404, 'not found')
    f = inside(ROOT, rel)
    if (f && fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html')
  }
  if (!f) return send(res, 404, 'not found')
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html')
  file(res, f)
})

setInterval(function () { WATCH.forEach(function (r) { r.write(': still here\n\n') }) }, 25000)

server.on('error', function (e) {
  if (e.code == 'EADDRINUSE') say('port ' + PORT + ' is taken. try another one: node ' + path.relative(ROOT, __filename) + ' ' + (PORT + 1))
  else say(e.message)
  process.exit(1)
})

server.listen(PORT, function () {
  var u = 'http://localhost:' + PORT + '/mastermind/?key=' + KEY
  say('Mastermind is running for ' + ROOT)
  say('')
  say('  editor:  ' + u)
  addresses().forEach(function (a) { say('  phone:   ' + a) })
  say('')
  say('phones on the same Wi-Fi can view your site and the live preview. only this computer can save.')
  say('press ctrl+c to stop')
  var o = process.platform == 'darwin' ? 'open' : process.platform == 'win32' ? 'start ""' : 'xdg-open'
  if (OPEN) cp.exec(o + ' "' + u + '"', function () {})
})
