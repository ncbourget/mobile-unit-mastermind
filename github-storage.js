function GitHubStorage(repo, branch, token) {
  this.kind = 'github'
  this.repo = repo
  this.branch = branch
  this.token = token
  this.name = repo
  this.id = 'github:' + repo
  this.head = null
  this.baseTree = null
  this.tree = {}
  this.folders = {}
  this.changes = new Map()
  this.cache = new Map()
}

GitHubStorage.saved = function () {
  try {
    return JSON.parse(localStorage.getItem('mastermind-github') || sessionStorage.getItem('mastermind-github') || 'null')
  } catch (e) {
    return null
  }
}

GitHubStorage.keep = function (o, remember) {
  var v = JSON.stringify(o)
  try {
    sessionStorage.setItem('mastermind-github', v)
    if (remember) localStorage.setItem('mastermind-github', v)
    else localStorage.removeItem('mastermind-github')
  } catch (e) {}
}

GitHubStorage.forget = function () {
  try {
    localStorage.removeItem('mastermind-github')
    sessionStorage.removeItem('mastermind-github')
  } catch (e) {}
}

GitHubStorage.open = async function (repo, branch, token) {
  repo = repo.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/+$/, '')
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('the repo should look like owner/name')
  var g = new GitHubStorage(repo, (branch || '').trim(), token.trim())
  var info = await g.api('')
  if (!info.permissions || !info.permissions.push) throw new Error('this token can read ' + repo + ' but cannot save to it. give it contents: read and write')
  if (!g.branch) g.branch = info.default_branch
  await g.load()
  return g
}

GitHubStorage.prototype.api = async function (path, method, body) {
  var r
  try {
    r = await fetch('https://api.github.com/repos/' + this.repo + path, {
      method: method || 'GET',
      headers: { authorization: 'Bearer ' + this.token, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store'
    })
  } catch (e) {
    throw new Error('could not reach GitHub, check the connection')
  }
  if (r.status == 401) throw new Error('GitHub did not accept the token')
  if (r.status == 404) throw new Error('GitHub could not find ' + this.repo + (path ? '' : '. check the name, and that the token can see this repo'))
  var j = await r.json().catch(function () { return {} })
  if (!r.ok) {
    var e = new Error('GitHub said ' + r.status + (j.message ? ': ' + j.message : ''))
    e.status = r.status
    throw e
  }
  return j
}

GitHubStorage.prototype.load = async function () {
  var ref = await this.api('/git/ref/heads/' + encodeURIComponent(this.branch))
  var c = await this.api('/git/commits/' + ref.object.sha)
  var t = await this.api('/git/trees/' + c.tree.sha + '?recursive=1')
  if (t.truncated) throw new Error('this repo is too big to open from the browser for now')
  this.head = ref.object.sha
  this.baseTree = c.tree.sha
  this.tree = {}
  this.folders = {}
  for (var e of t.tree) {
    if (e.type == 'blob') this.tree[e.path] = e.sha
    else if (e.type == 'tree') this.folders[e.path] = 1
  }
}

GitHubStorage.prototype.readFile = async function (path) {
  if (this.changes.has(path)) {
    var v = this.changes.get(path)
    return v == null ? null : v instanceof Blob ? v : new Blob([v])
  }
  var sha = this.tree[path]
  if (!sha) return null
  if (this.cache.has(sha)) return this.cache.get(sha)
  var self = this
  var p = fetch('https://api.github.com/repos/' + this.repo + '/git/blobs/' + sha, {
    headers: { authorization: 'Bearer ' + this.token, accept: 'application/vnd.github.raw+json', 'x-github-api-version': '2022-11-28' }
  }).then(function (r) {
    if (!r.ok) throw new Error('GitHub said ' + r.status)
    return r.blob()
  }).catch(function (e) {
    self.cache.delete(sha)
    throw e
  })
  this.cache.set(sha, p)
  return p
}

GitHubStorage.prototype.readText = async function (path) {
  var f = await this.readFile(path)
  return f ? f.text() : null
}

GitHubStorage.prototype.exists = async function (path) {
  if (this.changes.has(path)) return this.changes.get(path) != null
  return !!this.tree[path]
}

GitHubStorage.prototype.list = async function (prefix) {
  var base = prefix ? prefix.replace(/\/?$/, '/') : '', files = {}, folders = {}
  for (var p in this.tree) if (p.indexOf(base) == 0) files[p] = 1
  this.changes.forEach(function (v, p) {
    if (p.indexOf(base) != 0) return
    if (v == null) delete files[p]
    else files[p] = 1
  })
  for (var f in this.folders) if (f.indexOf(base) == 0) folders[f] = 1
  Object.keys(files).forEach(function (p) {
    var ps = p.split('/')
    for (var i = 1; i < ps.length; i++) {
      var d = ps.slice(0, i).join('/')
      if (d.indexOf(base) == 0 && d.length >= base.length) folders[d] = 1
    }
  })
  return { files: Object.keys(files), folders: Object.keys(folders) }
}

GitHubStorage.prototype.write = async function (path, data) {
  this.changes.set(path, data)
}

GitHubStorage.prototype.remove = async function (path) {
  this.changes.set(path, null)
}

GitHubStorage.prototype.removePage = async function (slug) {
  var l = await this.list(slug)
  if (l.files.length == 1 && l.files[0] == slug + '/index.html') await this.remove(l.files[0])
}

GitHubStorage.prototype.makeFolder = async function (path) {
  this.folders[path] = 1
}

GitHubStorage.prototype.pending = function () {
  return this.changes.size
}

function base64(blob) {
  return new Promise(function (ok, no) {
    var fr = new FileReader()
    fr.onload = function () { ok(fr.result.slice(fr.result.indexOf(',') + 1)) }
    fr.onerror = function () { no(fr.error) }
    fr.readAsDataURL(blob)
  })
}

GitHubStorage.prototype.finish = async function (message) {
  if (!this.changes.size) return { saved: true, sha: this.head, same: true }
  var entries = []
  for (var [path, v] of this.changes) {
    if (v == null) {
      if (this.tree[path]) entries.push({ path: path, mode: '100644', type: 'blob', sha: null })
    } else if (typeof v == 'string') {
      entries.push({ path: path, mode: '100644', type: 'blob', content: v })
    } else {
      var b = await this.api('/git/blobs', 'POST', { content: await base64(v), encoding: 'base64' })
      entries.push({ path: path, mode: '100644', type: 'blob', sha: b.sha })
    }
  }
  if (!entries.length) {
    this.changes.clear()
    return { saved: true, sha: this.head, same: true }
  }
  var nt = await this.api('/git/trees', 'POST', { base_tree: this.baseTree, tree: entries })
  if (nt.sha == this.baseTree) {
    this.changes.clear()
    return { saved: true, sha: this.head, same: true }
  }
  var c = await this.api('/git/commits', 'POST', { message: message || 'update from Mastermind', tree: nt.sha, parents: [this.head] })
  try {
    await this.api('/git/refs/heads/' + encodeURIComponent(this.branch), 'PATCH', { sha: c.sha, force: false })
  } catch (e) {
    if (e.status == 422) throw new Error('someone pushed to ' + this.branch + ' since you opened it. reconnect to pick up their changes, then save again')
    throw e
  }
  await this.load()
  this.changes.clear()
  return { saved: true, sha: c.sha }
}
