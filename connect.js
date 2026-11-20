var STORE = null, SITE_HAD_JSON = false, OWN = {}
var RUNTIME = ['render.js', 'site.js', 'page.css']
var cn = document.getElementById('connect')

RT = 'site/'

function draftKey() {
  return 'mastermind-draft:' + (STORE ? STORE.id : '')
}

function newSite(name) {
  var f = 'Helvetica, Arial, sans-serif'
  return {
    root: '/',
    langs: ['en'],
    grid: { cols: 12, row: 24, gap: 10, pad: 20, v: 2 },
    styles: { 'body copy': { font: f, size: 18, wt: '400' }, caption: { font: f, size: 12, wt: '400' }, H1: { font: f, size: 64, wt: '700' }, H2: { font: f, size: 32, wt: '700' } },
    pages: [{ id: 'home', slug: '', title: name, blocks: [] }]
  }
}

async function answerFile(e) {
  if (!e.data || e.data.type != 'site-file') return
  var port = e.ports[0]
  if (!STORE) return port.postMessage({ found: false })
  try {
    var f = await STORE.readFile(e.data.path)
    if (!f) return port.postMessage({ found: false })
    var buf = await f.arrayBuffer()
    port.postMessage({ found: true, body: buf, type: f.type }, [buf])
  } catch (err) {
    port.postMessage({ found: false })
  }
}

async function startWorker() {
  if (!('serviceWorker' in navigator)) throw new Error('this browser cannot run mastermind. try chrome or edge')
  var sw = navigator.serviceWorker
  sw.addEventListener('message', answerFile)
  sw.startMessages()
  await sw.register('site-file-worker.js')
  await sw.ready
  if (sw.controller) return
  var got = await Promise.race([
    new Promise(function (ok) { sw.addEventListener('controllerchange', function () { ok(true) }, { once: true }) }),
    new Promise(function (ok) { setTimeout(function () { ok(false) }, 2000) })
  ])
  if (got) return
  if (!sessionStorage.getItem('mastermind-reloaded')) {
    sessionStorage.setItem('mastermind-reloaded', '1')
    location.reload()
    await new Promise(function () {})
  }
  throw new Error('photos cannot load until the page is reloaded normally')
}

function siteFonts(txt) {
  var l = document.getElementById('site-fonts')
  if (!l) {
    l = document.createElement('link')
    l.id = 'site-fonts'
    l.rel = 'stylesheet'
    document.head.appendChild(l)
  }
  l.href = 'site/fonts.css?' + Date.now()
  var fam = {}, order = []
  ;(txt || '').replace(/@font-face\s*{([^}]*)}/g, function (m, body) {
    var n = /font-family\s*:\s*["']?([^;"']+)/.exec(body), w = /font-weight\s*:\s*(\d+)/.exec(body)
    if (!n) return
    n = n[1].trim()
    if (!fam[n]) { fam[n] = { w: [], c: 0 }; order.push(n) }
    fam[n].c++
    if (w && fam[n].w.indexOf(+w[1]) < 0) fam[n].w.push(+w[1])
  })
  FF = FF.filter(function (g) { return g[0] != 'this site' })
  if (order.length) FF.unshift(['this site', order.map(function (n) {
    var mono = /mono/i.test(n)
    return [n, '"' + n + '", ' + (mono ? 'Menlo, monospace' : 'Helvetica, Arial, sans-serif'), fam[n].w.sort(function (a, b) { return a - b }), fam[n].c]
  })])
}

async function connected(store) {
  if (dirt && STORE && !confirm('switch sites? changes you have not saved stay in this browser and come back when you reopen ' + STORE.name)) return
  st.textContent = 'opening ' + store.name + '...'
  var txt = await store.readText('site.json'), j
  try {
    j = txt ? JSON.parse(txt) : null
  } catch (e) {
    throw new Error('site.json in ' + store.name + ' is not valid json')
  }
  STORE = store
  SITE_HAD_JSON = !!j
  s = j || newSite(store.name)
  sel = null
  SS = []
  dirt = false
  setup()
  LAST = JSON.stringify(s)
  UN = []
  RE = []
  siteFonts(await store.readText('fonts.css'))
  cn.hidden = true
  document.body.classList.remove('cnon')
  document.getElementById('sv').textContent = store.kind == 'github' ? 'save & push' : 'save'
  document.getElementById('o').textContent = store.name
  document.getElementById('vw').href = 'site/'
  chk()
  draw()
  panel()
  st.textContent = (store.kind == 'github' ? 'github: ' + store.repo + ' · ' + store.branch : 'folder: ' + store.name) + (j ? '' : ' · new site, nothing saved yet')
}

async function ownFile(p) {
  if (!OWN[p]) OWN[p] = fetch(p, { cache: 'no-store' }).then(function (r) {
    if (!r.ok) throw new Error('could not load ' + p)
    return r.text()
  })
  return OWN[p]
}

function madeByUs(path, old) {
  if (/\.html$/.test(path)) return /render\.js"><\/script>\s*<script src="[^"]*site\.js"><\/script>/.test(old)
  return SITE_HAD_JSON
}

var saving = false

async function save() {
  if (!STORE) return showConnect()
  if (saving) return
  var gh = STORE.kind == 'github', note = ''
  if (gh) {
    note = prompt('what changed? this becomes the commit message on ' + STORE.branch, '')
    if (note == null) return
  }
  saving = true
  var oldOut = s.out
  try {
    st.textContent = 'building pages...'
    var b = build(), files = b.f
    s.out = b.now
    files['site.json'] = JSON.stringify(s, null, 2) + '\n'
    for (var r of RUNTIME) files[r] = await ownFile(r)
    if (!(await STORE.exists('fonts.css'))) files['fonts.css'] = ''
    if (!s.icon && !(await STORE.exists('assets/favicon.svg'))) files['assets/favicon.svg'] = await ownFile('assets/favicon.svg')
    var write = [], risky = []
    for (var p in files) {
      var old = await STORE.readText(p)
      if (old === files[p]) continue
      write.push(p)
      if (old != null && p != 'site.json' && !madeByUs(p, old)) risky.push(p)
    }
    if (risky.length && !confirm('these files are already in ' + STORE.name + ' and were not made by mastermind. saving replaces them:\n\n' + risky.join('\n') + '\n\nreplace them?')) {
      s.out = oldOut
      st.textContent = 'not saved'
      return
    }
    st.textContent = gh ? 'getting the commit ready...' : 'saving...'
    for (var w of write) await STORE.write(w, files[w])
    for (var o of b.del) await STORE.removePage(o)
    if (gh) st.textContent = 'pushing to ' + STORE.repo + '...'
    var res = await STORE.finish((note || '').trim() || 'update pages from mastermind')
    SITE_HAD_JSON = true
    dirt = false
    LAST = JSON.stringify(s)
    try { localStorage.removeItem(draftKey()) } catch (e) {}
    draw()
    var cut = PO.length ? ' · text cut off on: ' + PO.join(', ') : ''
    if (gh) st.textContent = (res.same ? 'nothing changed, nothing pushed ' : 'pushed ' + res.sha.slice(0, 7) + ' to ' + STORE.branch + ' ') + new Date().toLocaleTimeString() + cut
    else st.textContent = 'saved ' + s.pages.length + (s.pages.length == 1 ? ' page' : ' pages') + ' to ' + STORE.name + ' ' + new Date().toLocaleTimeString() + cut
  } catch (e) {
    s.out = oldOut
    st.textContent = 'not saved: ' + e.message
  } finally {
    saving = false
  }
}

function showConnect() {
  cn.hidden = false
  document.body.classList.add('cnon')
  var f = cn.querySelector('#cn-folder'), again = cn.querySelector('#cn-again'), fn = cn.querySelector('.cn-folder-note')
  f.disabled = !FolderStorage.supported()
  fn.textContent = FolderStorage.supported() ? 'pick the folder your site lives in, or an empty one to start a new site.' : 'this browser cannot open folders. use chrome or edge, or connect a github repo.'
  again.hidden = true
  if (FolderStorage.supported()) FolderStorage.recall().then(function (h) {
    if (!h) return
    again.hidden = false
    again.textContent = 'reopen ' + h.name
  })
  var g = GitHubStorage.saved(), fm = cn.querySelector('#cn-gh')
  if (g) {
    fm.repo.value = g.repo
    fm.branch.value = g.branch || ''
    fm.token.value = g.token
    fm.remember.checked = !!localStorage.getItem('mastermind-github')
  }
  cn.querySelector('.cn-close').hidden = !STORE
}

function cnError(m) {
  cn.querySelector('.cn-err').textContent = m || ''
}

async function tryConnect(fn) {
  cnError('')
  cn.classList.add('busy')
  try {
    var store = await fn()
    if (store) await connected(store)
  } catch (e) {
    if (e.name != 'AbortError') cnError(e.message)
  } finally {
    cn.classList.remove('busy')
  }
}

cn.querySelector('#cn-folder').onclick = function () { tryConnect(FolderStorage.pick) }
cn.querySelector('#cn-again').onclick = function () {
  tryConnect(async function () {
    return (await FolderStorage.reopen()) || FolderStorage.pick()
  })
}
cn.querySelector('#cn-gh').onsubmit = function (e) {
  e.preventDefault()
  var fm = this
  tryConnect(async function () {
    var g = await GitHubStorage.open(fm.repo.value, fm.branch.value, fm.token.value)
    GitHubStorage.keep({ repo: g.repo, branch: fm.branch.value.trim(), token: g.token }, fm.remember.checked)
    return g
  })
}
cn.querySelector('.cn-forget').onclick = function (e) {
  e.preventDefault()
  GitHubStorage.forget()
  var fm = cn.querySelector('#cn-gh')
  fm.token.value = ''
  fm.remember.checked = false
  cnError('token forgotten on this computer')
}
cn.querySelector('.cn-close').onclick = function () {
  if (!STORE) return
  cn.hidden = true
  document.body.classList.remove('cnon')
}

document.getElementById('o').onclick = showConnect
document.getElementById('sv').onclick = save
document.getElementById('pv').onclick = function () {
  if (!STORE) return showConnect()
  try {
    localStorage.setItem('mastermind-preview', JSON.stringify({ t: Date.now(), s: s, unsaved: dirt }))
  } catch (e) {
    return st.textContent = 'preview needs browser storage, which is turned off'
  }
  window.open('preview.html?mm=1&p=' + encodeURIComponent(pg().slug || ''), 'mastermind-preview')
}

;(async function boot() {
  s = newSite('untitled')
  setup()
  LAST = JSON.stringify(s)
  showConnect()
  try {
    await startWorker()
  } catch (e) {
    cnError(e.message)
    return
  }
  var g = GitHubStorage.saved()
  if (g && g.token) tryConnect(function () { return GitHubStorage.open(g.repo, g.branch, g.token) })
})()
