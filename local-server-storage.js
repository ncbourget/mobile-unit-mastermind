function LocalServerStorage(key, info) {
  this.kind = 'local'
  this.key = key
  this.name = info.name
  this.id = 'local:' + info.name
  this.info = info
}

LocalServerStorage.find = async function () {
  var q = new URLSearchParams(location.search), key = q.get('key')
  if (key) {
    try { sessionStorage.setItem('mastermind-local-key', key) } catch (e) {}
    q.delete('key')
    history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash)
  } else {
    try { key = sessionStorage.getItem('mastermind-local-key') } catch (e) {}
  }
  if (!key || !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return null
  var r = await fetch('/mastermind-api/info', { headers: { 'x-mastermind-key': key } }).catch(function () { return null })
  if (!r || !r.ok) return null
  return new LocalServerStorage(key, await r.json())
}

LocalServerStorage.prototype.call = function (w, p, o) {
  o = o || {}
  o.headers = Object.assign({ 'x-mastermind-key': this.key }, o.headers || {})
  o.cache = 'no-store'
  return fetch('/mastermind-api/' + w + (p != null ? '?p=' + encodeURIComponent(p) : ''), o).then(function (r) {
    if (r.status == 403) throw new Error('the Mastermind server stopped or restarted. run serve.js again and use the new link it prints')
    return r
  }, function () {
    throw new Error('can\'t reach the Mastermind server. is serve.js still running?')
  })
}

LocalServerStorage.prototype.readFile = async function (path) {
  var r = await this.call('file', path)
  return r.ok ? r.blob() : null
}

LocalServerStorage.prototype.readText = async function (path) {
  var f = await this.readFile(path)
  return f ? f.text() : null
}

LocalServerStorage.prototype.exists = async function (path) {
  return !!(await this.readFile(path))
}

LocalServerStorage.prototype.list = async function (prefix) {
  var l = await (await this.call('list')).json(), base = prefix ? prefix.replace(/\/?$/, '/') : ''
  return {
    files: l.files.filter(function (p) { return p.indexOf(base) == 0 }),
    folders: l.folders.filter(function (p) { return p.indexOf(base) == 0 })
  }
}

LocalServerStorage.prototype.write = async function (path, data) {
  var r = await this.call('file', path, { method: 'PUT', body: data })
  if (!r.ok) throw new Error('could not save ' + path + ': ' + (await r.text()))
}

LocalServerStorage.prototype.remove = async function (path) {
  await this.call('file', path, { method: 'DELETE' })
}

LocalServerStorage.prototype.removePage = async function (slug) {
  var l = await this.list(slug)
  if (l.files.length == 1 && l.files[0] == slug + '/index.html') await this.remove(l.files[0])
}

LocalServerStorage.prototype.makeFolder = async function () {}

LocalServerStorage.prototype.finish = async function () {
  return { saved: true }
}

LocalServerStorage.prototype.live = function (d) {
  return this.call('draft', null, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(d) }).catch(function () {})
}

LocalServerStorage.prototype.phones = async function () {
  return (await this.call('info')).json()
}
