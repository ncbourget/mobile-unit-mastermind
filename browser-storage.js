function BrowserStorage(meta) {
  this.kind = 'browser'
  this.name = meta.name
  this.id = 'browser:' + meta.made
  this.meta = meta
}

BrowserStorage.db = function () {
  return new Promise(function (ok, no) {
    var q = indexedDB.open('mastermind-browser-site', 1)
    q.onupgradeneeded = function () {
      q.result.createObjectStore('files')
      q.result.createObjectStore('meta')
    }
    q.onsuccess = function () { ok(q.result) }
    q.onerror = function () { no(new Error('this browser is not letting mastermind store anything. try a normal window, not a private one')) }
  })
}

BrowserStorage.run = async function (st, mode, fn) {
  var d = await BrowserStorage.db()
  return new Promise(function (ok, no) {
    var t = d.transaction(st, mode), q = fn(t.objectStore(st))
    t.oncomplete = function () { ok(q && q.result) }
    t.onerror = function () { no(t.error) }
  })
}

BrowserStorage.current = async function () {
  try {
    return (await BrowserStorage.run('meta', 'readonly', function (o) { return o.get('site') })) || null
  } catch (e) {
    return null
  }
}

BrowserStorage.start = async function (name) {
  var m = { name: name, made: Date.now() }
  await BrowserStorage.run('files', 'readwrite', function (o) { return o.clear() })
  await BrowserStorage.run('meta', 'readwrite', function (o) { return o.put(m, 'site') })
  return new BrowserStorage(m)
}

BrowserStorage.reopen = async function () {
  var m = await BrowserStorage.current()
  return m ? new BrowserStorage(m) : null
}

BrowserStorage.keep = async function () {
  try {
    if (!navigator.storage || !navigator.storage.persist) return false
    return (await navigator.storage.persisted()) || (await navigator.storage.persist())
  } catch (e) {
    return false
  }
}

BrowserStorage.prototype.note = async function (o) {
  var m = Object.assign(this.meta, o)
  await BrowserStorage.run('meta', 'readwrite', function (x) { return x.put(m, 'site') })
}

BrowserStorage.prototype.readFile = async function (path) {
  var v = await BrowserStorage.run('files', 'readonly', function (o) { return o.get(path) })
  if (v == null) return null
  return v instanceof Blob ? v : new Blob([v])
}

BrowserStorage.prototype.readText = async function (path) {
  var f = await this.readFile(path)
  return f ? f.text() : null
}

BrowserStorage.prototype.exists = async function (path) {
  return (await BrowserStorage.run('files', 'readonly', function (o) { return o.count(path) })) > 0
}

BrowserStorage.prototype.list = async function (prefix) {
  var base = prefix ? prefix.replace(/\/?$/, '/') : '', ks = await BrowserStorage.run('files', 'readonly', function (o) { return o.getAllKeys() }), files = [], folders = {}
  ks.forEach(function (p) {
    if (p.indexOf(base) != 0) return
    files.push(p)
    var ps = p.split('/')
    for (var i = 1; i < ps.length; i++) {
      var d = ps.slice(0, i).join('/')
      if (d.length >= base.length) folders[d] = 1
    }
  })
  ;(this.meta.folders || []).forEach(function (f) { if (f.indexOf(base) == 0) folders[f] = 1 })
  return { files: files, folders: Object.keys(folders) }
}

BrowserStorage.prototype.write = async function (path, data) {
  await BrowserStorage.run('files', 'readwrite', function (o) { return o.put(data, path) })
}

BrowserStorage.prototype.remove = async function (path) {
  await BrowserStorage.run('files', 'readwrite', function (o) { return o.delete(path) })
}

BrowserStorage.prototype.removePage = async function (slug) {
  var l = await this.list(slug)
  if (l.files.length == 1 && l.files[0] == slug + '/index.html') await this.remove(l.files[0])
}

BrowserStorage.prototype.makeFolder = async function (path) {
  var m = this.meta
  m.folders = m.folders || []
  if (m.folders.indexOf(path) < 0) m.folders.push(path)
  await BrowserStorage.run('meta', 'readwrite', function (o) { return o.put(m, 'site') })
}

BrowserStorage.prototype.finish = async function () {
  return { saved: true }
}
