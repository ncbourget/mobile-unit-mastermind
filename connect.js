var STORE = null, SITE_HAD_JSON = false, OLD_JSON = false, OWN = {}
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

document.addEventListener('error', function (e) {
  var m = e.target, k = m && m.getAttribute && m.getAttribute('src') || '', i = k.indexOf('site/')
  if (!STORE || !/^(IMG|VIDEO)$/.test(m.tagName) || i < 0 || k.indexOf('blob:') == 0 || m.dataset.fb) return
  m.dataset.fb = 1
  STORE.readFile(decodeURIComponent(k.slice(i + 5).split('?')[0])).then(function (f) {
    if (f) m.src = URL.createObjectURL(f)
  }, function () {})
}, true)

async function startWorker() {
  if (!('serviceWorker' in navigator)) throw new Error('this browser cannot run Mastermind. try Chrome or Edge')
  var sw = navigator.serviceWorker
  sw.addEventListener('message', answerFile)
  sw.startMessages()
  try {
    await sw.register('site-file-worker.js')
  } catch (e) {
    throw new Error('this browser is blocking the part of Mastermind that loads photos and fonts. you can still design and save, but photos won\'t show. Chrome or Edge work best')
  }
  await sw.ready
  if (sw.controller) return
  var got = await Promise.race([
    new Promise(function (ok) { sw.addEventListener('controllerchange', function () { ok(true) }, { once: true }) }),
    new Promise(function (ok) { setTimeout(function () { ok(false) }, 2000) })
  ])
  if (got) return
  var last = +sessionStorage.getItem('mastermind-reloaded') || 0
  if (Date.now() - last > 15000) {
    sessionStorage.setItem('mastermind-reloaded', Date.now())
    location.reload()
    await new Promise(function () {})
  }
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
  var txt = await store.readText('mastermind.json'), j, old = false
  if (txt == null) {
    var t2 = await store.readText('site.json')
    try {
      var j2 = t2 && JSON.parse(t2)
      if (j2 && j2.pages && j2.grid) { txt = t2; old = true }
    } catch (e) {}
  }
  try {
    j = txt ? JSON.parse(txt) : null
  } catch (e) {
    throw new Error('mastermind.json in ' + store.name + ' is not valid json')
  }
  OLD_JSON = old
  STORE = store
  CODE = null
  CLOAD = null
  CEDIT = {}
  COPEN = null
  cw2.hidden = true
  SITE_HAD_JSON = !!j
  s = j || newSite(store.startName || store.name)
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
  document.getElementById('dl').hidden = store.kind != 'browser'
  document.getElementById('o').textContent = store.name
  document.getElementById('vw').href = 'site/'
  chk()
  draw()
  panel()
  livePush()
  st.textContent = (store.kind == 'github' ? 'GitHub: ' + store.repo + ' · ' + store.branch : store.kind == 'browser' ? 'in this browser: ' + store.name : store.kind == 'local' ? 'on this computer: ' + store.name : 'folder: ' + store.name) + (j ? '' : ' · new site, nothing saved yet') + (old ? ' · site.json becomes mastermind.json when you save' : '')
  dlStatus()
}

async function ownFile(p) {
  if (!OWN[p]) OWN[p] = fetch(p, { cache: 'no-store' }).then(function (r) {
    if (!r.ok) throw new Error('could not load ' + p)
    return r.text()
  })
  return OWN[p]
}

function ago(t) {
  var d = new Date(t), n = new Date(), days = Math.round((new Date(n.toDateString()) - new Date(d.toDateString())) / 864e5)
  var hm = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  if (days == 0) return 'today at ' + hm
  if (days == 1) return 'yesterday at ' + hm
  if (days < 7) return days + ' days ago'
  return 'on ' + d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function dlNote(m, unsaved) {
  var sv = m.savedAt || m.made
  if (!sv && !unsaved) return ['', false]
  var old = m.downloaded && Date.now() - m.downloaded > 7 * 864e5
  if (!m.downloaded) return ['never downloaded. download it so you have a copy outside this browser', true]
  if (unsaved || sv > m.downloaded) return ['changes since your last download, ' + ago(m.downloaded), true]
  return ['downloaded ' + ago(m.downloaded) + ', nothing new since', old]
}

function dlStatus() {
  if (!STORE || STORE.kind != 'browser') return
  var n = dlNote(STORE.meta, dirt)
  if (!n[0]) return
  var sp = document.createElement('span'), m = STORE.meta
  sp.textContent = !m.downloaded ? 'never downloaded' : dirt || (m.savedAt || m.made) > m.downloaded ? 'not downloaded since your changes' : 'downloaded ' + ago(m.downloaded)
  if (n[1]) sp.className = 'warn'
  st.appendChild(document.createTextNode(' · '))
  st.appendChild(sp)
}

function backupName(p, k) {
  var i = p.lastIndexOf('.'), sl = p.lastIndexOf('/'), b = i > sl ? p.slice(0, i) : p, x = i > sl ? p.slice(i) : ''
  return b + '-backup' + (k > 1 ? '-' + k : '') + x
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
    s.mastermind = 1
    files['mastermind.json'] = JSON.stringify(s, null, 2) + '\n'
    for (var r of RUNTIME) files[r] = await ownFile(r)
    if (!(await STORE.exists('fonts.css'))) files['fonts.css'] = ''
    if (!s.icon && !(await STORE.exists('assets/favicon.svg'))) files['assets/favicon.svg'] = await ownFile('assets/favicon.svg')
    var write = [], risky = []
    for (var p in files) {
      var old = await STORE.readText(p)
      if (old === files[p]) continue
      write.push(p)
      if (old != null && p != 'mastermind.json' && !madeByUs(p, old)) risky.push([p, old])
    }
    var bk = [], bj = null
    if (risky.length) {
      try { bj = JSON.parse((await STORE.readText('mastermind-backup.json')) || 'null') } catch (e) {}
      bj = bj && bj.backups ? bj : { backups: [] }
      var used = {}
      for (var rk of risky) {
        var n, k = 1
        do n = backupName(rk[0], k++)
        while (used[n] || files[n] != null || await STORE.exists(n))
        used[n] = 1
        bk.push([rk[0], n, rk[1]])
      }
      if (!confirm('these files are already in ' + STORE.name + ' and were not made by Mastermind:\n\n' + bk.map(function (x) { return x[0] + '  →  copy kept as ' + x[1] }).join('\n') + '\n\nmastermind keeps a copy of each one, then saves its own version over it. go ahead?')) {
        s.out = oldOut
        st.textContent = 'not saved, nothing was changed'
        return
      }
    }
    st.textContent = gh ? 'getting the commit ready...' : 'saving...'
    for (var x of bk) {
      await STORE.write(x[1], x[2])
      var d0 = new Date(), z = function (v) { return String(v).padStart(2, '0') }
      bj.backups.push({ file: x[1], of: x[0], at: d0.getFullYear() + '-' + z(d0.getMonth() + 1) + '-' + z(d0.getDate()) + ' ' + z(d0.getHours()) + ':' + z(d0.getMinutes()) })
    }
    if (bk.length) await STORE.write('mastermind-backup.json', JSON.stringify(bj, null, 2) + '\n')
    for (var w of write) await STORE.write(w, files[w])
    if (OLD_JSON) await STORE.remove('site.json')
    for (var o of b.del) await STORE.removePage(o)
    if (gh) st.textContent = 'pushing to ' + STORE.repo + '...'
    var res = await STORE.finish((note || '').trim() || 'update pages from Mastermind')
    SITE_HAD_JSON = true
    OLD_JSON = false
    dirt = false
    LAST = JSON.stringify(s)
    try { localStorage.removeItem(draftKey()) } catch (e) {}
    draw()
    var cut = (bk.length ? ' · ' + bk.length + (bk.length == 1 ? ' backup' : ' backups') + ' kept' : '') + (PO.length ? ' · text cut off on: ' + PO.join(', ') : '')
    if (gh) st.textContent = (res.same ? 'nothing changed, nothing pushed ' : 'pushed ' + res.sha.slice(0, 7) + ' to ' + STORE.branch + ' ') + new Date().toLocaleTimeString() + cut
    else st.textContent = 'saved ' + s.pages.length + (s.pages.length == 1 ? ' page' : ' pages') + (STORE.kind == 'browser' ? ' in this browser ' : ' to ' + STORE.name + ' ') + new Date().toLocaleTimeString() + cut
    if (STORE.kind == 'browser') {
      await STORE.note({ savedAt: Date.now() })
      dlStatus()
    }
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
  fn.textContent = FolderStorage.supported() ? 'pick the folder your site lives in, or an empty one to start a new site.' : 'this browser cannot open folders. use Chrome or Edge, or connect a GitHub repo.'
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
  var nf = cn.querySelector('#cn-new-folder'), cont = cn.querySelector('.cn-cont')
  nf.disabled = !FolderStorage.supported()
  cn.querySelector('.cn-new-note').textContent = FolderStorage.supported()
    ? 'start in this browser keeps the site here until you download it as a folder. make it in a new folder saves straight into a folder you make in the picker.'
    : 'it\'s kept in this browser until you download it as a folder. making a new folder needs Chrome or Edge.'
  cont.hidden = true
  BrowserStorage.current().then(function (m) {
    if (!m) return
    cont.hidden = false
    var bt = cn.querySelector('#cn-continue'), nb = document.createElement('b'), dn = cn.querySelector('.cn-dl'), w = dlNote(m), sp = document.createElement('span')
    sp.textContent = w[0]
    dn.textContent = ''
    dn.appendChild(sp)
    if (m.kept === false) dn.appendChild(document.createTextNode(' · this browser may clear it if your disk fills up'))
    dn.className = 'cn-dl' + (w[1] ? ' warn' : '')
    dn.hidden = !w[0] && m.kept !== false
    nb.textContent = '"' + m.name + '"'
    bt.textContent = 'continue '
    bt.appendChild(nb)
    bt.appendChild(document.createTextNode(', started in this browser'))
  })
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
function newName() {
  return cn.querySelector('#cn-name').value.trim() || 'my site'
}
cn.querySelector('#cn-new-folder').onclick = function () {
  tryConnect(async function () {
    var f = await FolderStorage.pick()
    f.startName = newName()
    return f
  })
}
cn.querySelector('#cn-new-browser').onclick = function () {
  tryConnect(async function () {
    var m = await BrowserStorage.current()
    if (m && !confirm('you already have "' + m.name + '" in this browser. starting a new site throws it away. download it first if you want to keep it.\n\nthrow away "' + m.name + '" and start a new site?')) return null
    var b = await BrowserStorage.start(newName())
    try { localStorage.removeItem('mastermind-draft:' + b.id) } catch (e) {}
    await b.note({ kept: await BrowserStorage.keep() })
    return b
  })
}
cn.querySelector('#cn-continue').onclick = function () {
  tryConnect(async function () {
    var b = await BrowserStorage.reopen()
    if (!b) return null
    var k = await BrowserStorage.keep()
    if (k !== b.meta.kept) await b.note({ kept: k })
    return b
  })
}
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
document.getElementById('dl').onclick = async function () {
  if (!STORE || STORE.kind != 'browser') return
  if (dirt || !SITE_HAD_JSON) await save()
  if (dirt || !SITE_HAD_JSON) return
  st.textContent = 'zipping...'
  try {
    var n = await downloadSite(STORE)
    await STORE.note({ downloaded: Date.now() })
    st.textContent = 'downloaded ' + folderName(STORE.name) + '.zip, ' + n + ' files. unzip it to get the site folder'
  } catch (e) {
    st.textContent = 'could not download: ' + e.message
  }
}
document.getElementById('pv').onclick = function () {
  if (!STORE) return showConnect()
  try {
    localStorage.setItem('mastermind-preview', JSON.stringify({ t: Date.now(), s: s, unsaved: dirt }))
  } catch (e) {
    return st.textContent = 'preview needs browser storage, which is turned off'
  }
  window.open('preview.html?mm=1&p=' + encodeURIComponent(pg().slug || ''), 'mastermind-preview')
}

function onPhone() {
  return matchMedia('(pointer: coarse) and (hover: none)').matches && Math.min(screen.width, screen.height) < 600
}

;(async function boot() {
  if (onPhone()) {
    var ph = document.getElementById('phone'), u = location.href.split('?')[0].split('#')[0]
    document.body.classList.add('on-phone')
    ph.hidden = false
    ph.querySelector('.ph-url').textContent = u
    ph.querySelector('.ph-copy').onclick = function () {
      var b = this
      ;(navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(function () { b.textContent = 'copied' }, function () { b.textContent = 'copy it from the box above' })
    }
    return
  }
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
  var lo = await LocalServerStorage.find()
  if (lo) return tryConnect(function () { return lo })
  var g = GitHubStorage.saved()
  if (g && g.token) tryConnect(function () { return GitHubStorage.open(g.repo, g.branch, g.token) })
})()

var LT = null

function livePush() {
  if (!STORE || STORE.kind != 'local') return
  clearTimeout(LT)
  LT = setTimeout(function () { STORE.live({ s: s, page: pg().slug || '', lang: L }) }, 200)
}
