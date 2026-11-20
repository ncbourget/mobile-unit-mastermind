var SITE = new URL('site/', self.registration.scope)

var TYPES = {
  html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8', txt: 'text/plain; charset=utf-8', xml: 'application/xml', svg: 'image/svg+xml',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', ico: 'image/x-icon',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mp3: 'audio/mpeg', wav: 'audio/wav',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf', pdf: 'application/pdf'
}

self.addEventListener('install', function () { self.skipWaiting() })
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()) })

self.addEventListener('fetch', function (e) {
  var u = new URL(e.request.url)
  if (!/^(GET|HEAD)$/.test(e.request.method) || u.origin != SITE.origin || u.pathname.indexOf(SITE.pathname) != 0) return
  e.respondWith(serve(u, e.clientId))
})

function isEditor(c) {
  var u = new URL(c.url)
  return u.pathname.indexOf(SITE.pathname) != 0 && !/preview\.html$/.test(u.pathname)
}

function ask(c, path) {
  return new Promise(function (ok) {
    var ch = new MessageChannel(), t = setTimeout(function () { ok(null) }, 20000)
    ch.port1.onmessage = function (m) {
      clearTimeout(t)
      ok(m.data && m.data.found ? m.data : null)
    }
    c.postMessage({ type: 'site-file', path: path }, [ch.port2])
  })
}

async function serve(u, clientId) {
  var path = decodeURIComponent(u.pathname.slice(SITE.pathname.length))
  if (path == '' || /\/$/.test(path)) path += 'index.html'
  var all = (await self.clients.matchAll({ type: 'window' })).filter(isEditor)
  all.sort(function (a, b) { return (b.id == clientId) - (a.id == clientId) })
  for (var c of all) {
    var r = await ask(c, path)
    if (r) {
      var ext = path.split('.').pop().toLowerCase()
      return new Response(r.body, { headers: { 'content-type': TYPES[ext] || r.type || 'application/octet-stream', 'cache-control': 'no-store' } })
    }
  }
  var why = all.length ? path + ' is not in this site' : 'open mastermind and connect a site first'
  return new Response(why, { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } })
}
