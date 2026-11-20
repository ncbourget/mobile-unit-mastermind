function esc(v) {
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function html(p, slug, rt) {
  var bl = (s.common || []).concat(p.blocks), box = document.createElement('div'), g = pgd(s, p), bd = document.createElement('div'), bs
  RT = rt
  CUR = slug
  box.id = 'pg'
  grd(box, g)
  plen(box, p, g)
  auto(bl, g)
  pend(bl, p)
  pbg(bd, s, p)
  bs = bd.getAttribute('style')
  var hold = document.createElement('div')
  hold.style.cssText = 'position: absolute; left: -99999px; top: 0; width: ' + cv.offsetWidth + 'px'
  document.body.appendChild(hold)
  base(hold, s, p)
  hold.appendChild(box)
  bl.forEach(function (b) {
    var d = document.createElement('div')
    d.className = 'b'
    lay(d, b)
    d.appendChild(bk(b))
    box.appendChild(d)
  })
  bas(box)
  sdash(box)
  box.querySelectorAll('.c-text.m-fit').forEach(fitx)
  box.querySelectorAll('.c-text.m-lock').forEach(function (c) {
    if ((c.scrollHeight > c.clientHeight + 1 || c.scrollWidth > c.clientWidth + 1) && PO.indexOf(tx(p.title)) < 0) PO.push(tx(p.title) || slug || 'home')
  })
  hold.remove()
  return '<!doctype html>\n<html lang="' + LS[0] + '">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<title>' + esc(tx(p.title) || 'untitled') + '</title>\n' +
    '<link rel="icon" href="' + rt + esc(s.icon || 'assets/favicon.svg') + '">\n' +
    '<link rel="stylesheet" href="' + rt + 'page.css">\n' +
    extras(s, p).filter(function (x) { return /\.css$/i.test(x) }).map(function (x) { return '<link rel="stylesheet" href="' + rt + esc(x) + '">\n' }).join('') +
    '</head>\n<body data-rt="' + rt + '" data-p="' + esc(slug) + '"' + (bs ? ' style="' + esc(bs) + '"' : '') + '>\n' +
    box.outerHTML + '\n' +
    '<script src="' + rt + 'render.js"></script>\n<script src="' + rt + 'site.js"></script>\n</body>\n</html>\n'
}

var PO = []

function build() {
  var kl = L, km = MOB, kc = CUR, f = {}, now = [], del = []
  PO = []
  EVX = 1
  L = LS[0]
  MOB = false
  s.pages.forEach(function (p) {
    var sl = p.slug || ''
    f[sl ? sl + '/index.html' : 'index.html'] = html(p, sl, sl ? '../' : '')
    if (sl) now.push(sl)
  })
  f['404.html'] = html({ title: '404', blocks: [nf()] }, '404', s.root || '/')
  ;(s.out || []).forEach(function (o) { if (now.indexOf(o) < 0) del.push(o) })
  L = kl
  MOB = km
  CUR = kc
  RT = 'site/'
  EVX = 0
  return { f: f, now: now, del: del }
}
