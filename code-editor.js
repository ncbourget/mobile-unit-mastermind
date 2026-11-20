var cw2 = document.getElementById('code'), cfl = cw2.querySelector('.cfl'), cta = cw2.querySelector('textarea'), CODE = null, COPEN = null, CEDIT = {}, CLOAD = null

function ours(p) {
  if (/^mastermind\//.test(p) || /^mastermind(-backup)?\.json$/.test(p)) return true
  if (RUNTIME.indexOf(p) > -1 || p == '404.html' || p == 'index.html') return true
  return (s.out || []).some(function (o) { return p == o + '/index.html' }) || s.pages.some(function (q) { return q.slug && p == q.slug + '/index.html' })
}

async function codes() {
  if (!STORE) return CODE = []
  var ls = await STORE.list('')
  CODE = ls.files.filter(function (p) { return /\.(css|js|html)$/i.test(p) && !ours(p) }).sort()
  Object.keys(CEDIT).forEach(function (p) { if (CODE.indexOf(p) < 0) CODE.push(p) })
  CODE.sort()
  return CODE
}

var MADE = null

function made() {
  var b = build(), f = Object.keys(b.f).sort(function (x, y) { return x == 'index.html' ? -1 : y == 'index.html' ? 1 : x < y ? -1 : 1 })
  MADE = {}
  f.forEach(function (p) { MADE[p] = b.f[p] })
  MADE['mastermind.json'] = JSON.stringify(Object.assign({}, s, { out: b.now, mastermind: 1 }), null, 2) + '\n'
  RUNTIME.forEach(function (p) { MADE[p] = null })
}

function crows() {
  cfl.innerHTML = ''
  var h = document.createElement('h6')
  h.textContent = 'your files'
  cfl.appendChild(h)
  if (!CODE.length) cfl.insertAdjacentHTML('beforeend', '<p class="cn0">none yet. make one with new file</p>')
  CODE.forEach(function (p) {
    var a = document.createElement('a')
    a.textContent = p + (CEDIT[p] != null ? ' •' : '')
    if (p == COPEN) a.className = 'on'
    a.onclick = function () { copen(p) }
    cfl.appendChild(a)
  })
  h = document.createElement('h6')
  h.textContent = 'made by Mastermind'
  cfl.appendChild(h)
  Object.keys(MADE || {}).forEach(function (p) {
    var a = document.createElement('a')
    a.textContent = p
    a.className = 'mm' + (p == COPEN ? ' on' : '')
    a.onclick = function () { copen(p) }
    cfl.appendChild(a)
  })
}

function cbar() {
  var h = cw2.querySelector('.cnm'), u = cw2.querySelector('.cuse'), ck = u.querySelector('input'), sv = cw2.querySelector('.csv'), ro = !!(MADE && COPEN in MADE)
  h.textContent = !COPEN ? 'pick a file' : ro ? COPEN + ' · made by Mastermind from your design, rebuilt every save. read only' : COPEN
  cta.disabled = !COPEN
  cta.readOnly = ro
  cw2.classList.toggle('ro', ro)
  sv.hidden = ro
  sv.disabled = !COPEN || CEDIT[COPEN] == null
  var x = COPEN && !ro && /\.(css|js)$/i.test(COPEN) && COPEN != 'fonts.css'
  u.hidden = !x
  if (x) ck.checked = (s.extra || []).indexOf(COPEN) > -1
}

async function copen(p) {
  COPEN = p
  if (MADE && p in MADE) cta.value = MADE[p] != null ? MADE[p] : await ownFile(p)
  else cta.value = CEDIT[p] != null ? CEDIT[p] : (await STORE.readText(p)) || ''
  crows()
  cbar()
  cta.focus()
}

async function code() {
  if (!STORE) return showConnect()
  cw2.hidden = false
  cfl.innerHTML = '<p class="cn0">loading...</p>'
  await codes()
  made()
  if (COPEN && CODE.indexOf(COPEN) < 0 && !(COPEN in MADE)) COPEN = null
  crows()
  if (COPEN) copen(COPEN)
  else {
    cta.value = ''
    cbar()
  }
}

async function csave() {
  if (!COPEN || CEDIT[COPEN] == null) return
  var p = COPEN
  await STORE.write(p, CEDIT[p])
  delete CEDIT[p]
  if (STORE.kind == 'github') {
    dirty()
    st.textContent = p + ' is ready, it gets pushed when you save'
  } else st.textContent = 'saved ' + p
  crows()
  cbar()
}

cta.oninput = function () {
  if (!COPEN || cta.readOnly) return
  CEDIT[COPEN] = cta.value
  crows()
  cbar()
}

cta.onkeydown = function (e) {
  if (e.key == 'Tab' && !cta.readOnly) {
    e.preventDefault()
    var a = cta.selectionStart, b = cta.selectionEnd
    cta.setRangeText('  ', a, b, 'end')
    cta.oninput()
  }
  if ((e.metaKey || e.ctrlKey) && e.key == 's') {
    e.preventDefault()
    e.stopPropagation()
    csave()
  }
  if (e.key == 'Escape') e.stopPropagation()
}

cw2.querySelector('.csv').onclick = csave
cw2.querySelector('.cnew').onclick = async function () {
  var n = prompt('name for the new file, like style.css, script.js or about.html')
  if (!n) return
  n = n.trim().replace(/^\/+/, '').toLowerCase()
  if (!/^[a-z0-9_\-\/.]+\.(css|js|html)$/.test(n)) return alert('use a name ending in .css, .js or .html, with only letters, numbers, dashes and slashes')
  if (ours(n)) return alert(n + ' is made by Mastermind. pick another name')
  if (CODE.indexOf(n) < 0 && await STORE.exists(n)) return alert(n + ' is already in the site')
  CEDIT[n] = CEDIT[n] || ''
  if (CODE.indexOf(n) < 0) CODE.push(n)
  CODE.sort()
  copen(n)
}
cw2.querySelector('.cuse input').onchange = function () {
  s.extra = (s.extra || []).filter(function (x) { return x != COPEN })
  if (this.checked) s.extra.push(COPEN)
  if (!s.extra.length) delete s.extra
  dirty()
  panel()
}
cw2.querySelector('.cx').onclick = function () {
  var n = Object.keys(CEDIT).length
  if (n && !confirm(n + (n == 1 ? ' file has' : ' files have') + ' changes you haven\'t saved. close anyway? they stay here until you reload')) return
  cw2.hidden = true
}
document.addEventListener('keydown', function (e) {
  if (e.key == 'Escape' && !cw2.hidden && document.activeElement != cta) cw2.querySelector('.cx').click()
})

function xpick(o, all) {
  var f = (CODE || []).filter(function (p) { return /\.(css|js)$/i.test(p) && p != 'fonts.css' })
  if (!STORE) return
  if (!CODE) {
    ns('loading...')
    if (!CLOAD) CLOAD = codes().then(function () { CLOAD = null; panel() })
    return
  }
  if (!f.length) return nt('no css or js files of your own yet. make them in the code editor')
  f.forEach(function (p) {
    var l = document.createElement('label'), i = document.createElement('input'), on = (s.extra || []).indexOf(p) > -1
    l.className = 'ck'
    i.type = 'checkbox'
    i.checked = all ? on : on || (o.extra || []).indexOf(p) > -1
    i.disabled = !all && on
    i.onchange = function () {
      o.extra = (o.extra || []).filter(function (x) { return x != p })
      if (i.checked) o.extra.push(p)
      if (!o.extra.length) delete o.extra
      dirty()
      panel()
    }
    l.appendChild(i)
    l.appendChild(document.createTextNode(p + (!all && on ? ' (on every page)' : '')))
    pn.appendChild(l)
  })
}
