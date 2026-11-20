var CRC = (function () {
  var t = []
  for (var n = 0; n < 256; n++) {
    var c = n
    for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(u) {
  var c = 0xffffffff
  for (var i = 0; i < u.length; i++) c = CRC[(c ^ u[i]) & 255] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function zip(files) {
  var parts = [], cd = [], off = 0, d = new Date()
  var tm = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)
  var dt = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  files.forEach(function (f) {
    var nm = new TextEncoder().encode(f.path), cr = crc32(f.data), h = new DataView(new ArrayBuffer(30)), e = new DataView(new ArrayBuffer(46))
    h.setUint32(0, 0x04034b50, true)
    h.setUint16(4, 20, true)
    h.setUint16(6, 0x0800, true)
    h.setUint16(10, tm, true)
    h.setUint16(12, dt, true)
    h.setUint32(14, cr, true)
    h.setUint32(18, f.data.length, true)
    h.setUint32(22, f.data.length, true)
    h.setUint16(26, nm.length, true)
    e.setUint32(0, 0x02014b50, true)
    e.setUint16(4, 20, true)
    e.setUint16(6, 20, true)
    e.setUint16(8, 0x0800, true)
    e.setUint16(12, tm, true)
    e.setUint16(14, dt, true)
    e.setUint32(16, cr, true)
    e.setUint32(20, f.data.length, true)
    e.setUint32(24, f.data.length, true)
    e.setUint16(28, nm.length, true)
    e.setUint32(42, off, true)
    parts.push(h, nm, f.data)
    cd.push(e, nm)
    off += 30 + nm.length + f.data.length
  })
  var size = cd.reduce(function (a, x) { return a + x.byteLength }, 0), end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true)
  end.setUint16(8, files.length, true)
  end.setUint16(10, files.length, true)
  end.setUint32(12, size, true)
  end.setUint32(16, off, true)
  return new Blob(parts.concat(cd, [end]), { type: 'application/zip' })
}

function folderName(n) {
  return String(n || 'site').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'site'
}

async function downloadSite(store) {
  var ls = await store.list(''), top = folderName(store.name), files = []
  for (var p of ls.files.sort()) {
    var f = await store.readFile(p)
    if (f) files.push({ path: top + '/' + p, data: new Uint8Array(await f.arrayBuffer()) })
  }
  var a = document.createElement('a')
  a.href = URL.createObjectURL(zip(files))
  a.download = top + '.zip'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(function () { URL.revokeObjectURL(a.href) }, 60000)
  return files.length
}
