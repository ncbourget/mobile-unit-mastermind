function FolderStorage(handle) {
  this.kind = 'folder'
  this.handle = handle
  this.name = handle.name
  this.id = 'folder:' + handle.name
}

FolderStorage.supported = function () {
  return !!window.showDirectoryPicker
}

FolderStorage.pick = async function () {
  var h = await showDirectoryPicker({ id: 'mastermind-site', mode: 'readwrite' })
  await FolderStorage.remember(h)
  return new FolderStorage(h)
}

FolderStorage.reopen = async function () {
  var h = await FolderStorage.recall()
  if (!h) return null
  if (await h.requestPermission({ mode: 'readwrite' }) != 'granted') return null
  return new FolderStorage(h)
}

FolderStorage.db = function () {
  return new Promise(function (ok, no) {
    var q = indexedDB.open('mastermind', 1)
    q.onupgradeneeded = function () { q.result.createObjectStore('h') }
    q.onsuccess = function () { ok(q.result) }
    q.onerror = function () { no(q.error) }
  })
}

FolderStorage.remember = async function (h) {
  try {
    var d = await FolderStorage.db()
    d.transaction('h', 'readwrite').objectStore('h').put(h, 'dir')
  } catch (e) {}
}

FolderStorage.recall = async function () {
  try {
    var d = await FolderStorage.db()
    return await new Promise(function (ok) {
      var q = d.transaction('h').objectStore('h').get('dir')
      q.onsuccess = function () { ok(q.result || null) }
      q.onerror = function () { ok(null) }
    })
  } catch (e) {
    return null
  }
}

FolderStorage.prototype.folder = async function (parts, make) {
  var d = this.handle
  for (var x of parts) {
    if (!x) continue
    d = await d.getDirectoryHandle(x, { create: !!make })
  }
  return d
}

FolderStorage.prototype.readFile = async function (path) {
  var ps = path.split('/'), n = ps.pop()
  try {
    var d = await this.folder(ps)
    return await (await d.getFileHandle(n)).getFile()
  } catch (e) {
    return null
  }
}

FolderStorage.prototype.readText = async function (path) {
  var f = await this.readFile(path)
  return f ? f.text() : null
}

FolderStorage.prototype.exists = async function (path) {
  return !!(await this.readFile(path))
}

FolderStorage.prototype.list = async function (prefix) {
  var files = [], folders = [], start
  try {
    start = await this.folder(prefix.split('/'))
  } catch (e) {
    return { files: files, folders: folders }
  }
  var base = prefix ? prefix.replace(/\/?$/, '/') : ''
  async function walk(d, p) {
    for await (var [n, h] of d.entries()) {
      if (n.charAt(0) == '.') continue
      if (h.kind == 'directory') {
        folders.push(p + n)
        await walk(h, p + n + '/')
      } else files.push(p + n)
    }
  }
  await walk(start, base)
  return { files: files, folders: folders }
}

FolderStorage.prototype.write = async function (path, data) {
  var ps = path.split('/'), n = ps.pop()
  var d = await this.folder(ps, true)
  var w = await (await d.getFileHandle(n, { create: true })).createWritable()
  await w.write(data)
  await w.close()
}

FolderStorage.prototype.remove = async function (path) {
  var ps = path.split('/'), n = ps.pop()
  try {
    var d = await this.folder(ps)
    await d.removeEntry(n)
  } catch (e) {}
}

FolderStorage.prototype.removePage = async function (slug) {
  var d
  try {
    d = await this.folder(slug.split('/'))
  } catch (e) {
    return
  }
  for await (var n of d.keys()) if (n != 'index.html') return
  var ps = slug.split('/'), last = ps.pop()
  await (await this.folder(ps)).removeEntry(last, { recursive: true })
}

FolderStorage.prototype.makeFolder = async function (path) {
  await this.folder(path.split('/'), true)
}

FolderStorage.prototype.finish = async function () {
  return { saved: true }
}
