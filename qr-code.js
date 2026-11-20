var QECC = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26], QNB = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5]

function qmul(x, y) {
  var z = 0
  for (var i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d)
    z ^= ((y >>> i) & 1) * x
  }
  return z
}

function qdiv(n) {
  var r = new Array(n).fill(0), rt = 1
  r[n - 1] = 1
  for (var i = 0; i < n; i++) {
    for (var j = 0; j < n; j++) {
      r[j] = qmul(r[j], rt)
      if (j + 1 < n) r[j] ^= r[j + 1]
    }
    rt = qmul(rt, 2)
  }
  return r
}

function qrem(d, dv) {
  var r = dv.map(function () { return 0 })
  d.forEach(function (b) {
    var f = b ^ r.shift()
    r.push(0)
    dv.forEach(function (c, i) { r[i] ^= qmul(c, f) })
  })
  return r
}

function qraw(v) {
  var r = (16 * v + 128) * v + 64
  if (v >= 2) {
    var n = Math.floor(v / 7) + 2
    r -= (25 * n - 10) * n - 55
    if (v >= 7) r -= 36
  }
  return r
}

function qr(text) {
  var data = Array.from(new TextEncoder().encode(text)), v, raw, cap
  for (v = 1; v <= 10; v++) {
    raw = qraw(v) >> 3
    cap = raw - QECC[v] * QNB[v]
    if (4 + (v < 10 ? 8 : 16) + data.length * 8 <= cap * 8) break
  }
  if (v > 10) return null
  var bits = []
  function put(x, n) { for (var i = n - 1; i >= 0; i--) bits.push((x >>> i) & 1) }
  put(4, 4)
  put(data.length, v < 10 ? 8 : 16)
  data.forEach(function (b) { put(b, 8) })
  put(0, Math.min(4, cap * 8 - bits.length))
  put(0, (8 - bits.length % 8) % 8)
  for (var pad = 0xec; bits.length < cap * 8; pad ^= 0xec ^ 0x11) put(pad, 8)
  var cw = []
  for (var i = 0; i < bits.length; i += 8) {
    var x = 0
    for (var j = 0; j < 8; j++) x = x << 1 | bits[i + j]
    cw.push(x)
  }
  var nb = QNB[v], ec = QECC[v], sh = nb - raw % nb, sl = Math.floor(raw / nb), dv = qdiv(ec), bl = [], k = 0
  for (i = 0; i < nb; i++) {
    var d = cw.slice(k, k += sl - ec + (i < sh ? 0 : 1)), e = qrem(d, dv)
    if (i < sh) d.push(0)
    bl.push(d.concat(e))
  }
  var all = []
  for (i = 0; i < bl[0].length; i++) bl.forEach(function (b, j) { if (i != sl - ec || j >= sh) all.push(b[i]) })

  var n = v * 4 + 17, m = [], fn = []
  for (i = 0; i < n; i++) { m.push(new Array(n).fill(false)); fn.push(new Array(n).fill(false)) }
  function set(x, y, on) { m[y][x] = on; fn[y][x] = true }
  function bit(x, i) { return ((x >>> i) & 1) != 0 }
  for (i = 0; i < n; i++) { set(6, i, i % 2 == 0); set(i, 6, i % 2 == 0) }
  ;[[3, 3], [n - 4, 3], [3, n - 4]].forEach(function (c) {
    for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) {
      var xx = c[0] + dx, yy = c[1] + dy, dd = Math.max(Math.abs(dx), Math.abs(dy))
      if (xx >= 0 && xx < n && yy >= 0 && yy < n) set(xx, yy, dd != 2 && dd != 4)
    }
  })
  if (v > 1) {
    var na = Math.floor(v / 7) + 2, stp = Math.floor((v * 8 + na * 3 + 5) / (na * 4 - 4)) * 2, ps = [6]
    for (var q = n - 7; ps.length < na; q -= stp) ps.splice(1, 0, q)
    ps.forEach(function (a, ai) {
      ps.forEach(function (b, bi) {
        if (ai == 0 && bi == 0 || ai == 0 && bi == na - 1 || ai == na - 1 && bi == 0) return
        for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) set(a + dx, b + dy, Math.max(Math.abs(dx), Math.abs(dy)) != 1)
      })
    })
  }
  function fmt(mk) {
    var dt = mk, r = dt
    for (var i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537)
    var b = (dt << 10 | r) ^ 0x5412
    for (i = 0; i <= 5; i++) set(8, i, bit(b, i))
    set(8, 7, bit(b, 6))
    set(8, 8, bit(b, 7))
    set(7, 8, bit(b, 8))
    for (i = 9; i < 15; i++) set(14 - i, 8, bit(b, i))
    for (i = 0; i < 8; i++) set(n - 1 - i, 8, bit(b, i))
    for (i = 8; i < 15; i++) set(8, n - 15 + i, bit(b, i))
    set(8, n - 8, true)
  }
  fmt(0)
  if (v >= 7) {
    var r = v
    for (i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25)
    var vb = v << 12 | r
    for (i = 0; i < 18; i++) {
      var a = n - 11 + i % 3, b = Math.floor(i / 3)
      set(a, b, bit(vb, i))
      set(b, a, bit(vb, i))
    }
  }
  i = 0
  for (var rt = n - 1; rt >= 1; rt -= 2) {
    if (rt == 6) rt = 5
    for (var vt = 0; vt < n; vt++) {
      for (j = 0; j < 2; j++) {
        var cx = rt - j, up = ((rt + 1) & 2) == 0, cy = up ? n - 1 - vt : vt
        if (!fn[cy][cx] && i < all.length * 8) {
          m[cy][cx] = bit(all[i >>> 3], 7 - (i & 7))
          i++
        }
      }
    }
  }
  function mask(mk) {
    for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) {
      if (fn[y][x]) continue
      var f = [(x + y) % 2, y % 2, x % 3, (x + y) % 3, (Math.floor(x / 3) + Math.floor(y / 2)) % 2, x * y % 2 + x * y % 3, (x * y % 2 + x * y % 3) % 2, ((x + y) % 2 + x * y % 3) % 2][mk]
      if (f == 0) m[y][x] = !m[y][x]
    }
  }
  function cost() {
    var p = 0, dk = 0
    for (var y = 0; y < n; y++) {
      for (var a = 0; a < 2; a++) {
        var run = 1
        for (var x = 1; x < n; x++) {
          var c0 = a ? m[x][y] : m[y][x], c1 = a ? m[x - 1][y] : m[y][x - 1]
          if (c0 == c1) { run++; if (run == 5) p += 3; else if (run > 5) p++ }
          else run = 1
        }
      }
      for (x = 0; x < n; x++) {
        if (m[y][x]) dk++
        if (y < n - 1 && x < n - 1 && m[y][x] == m[y][x + 1] && m[y][x] == m[y + 1][x] && m[y][x] == m[y + 1][x + 1]) p += 3
      }
    }
    return p + (Math.ceil(Math.abs(dk * 20 - n * n * 10) / (n * n)) - 1) * 10
  }
  var best = 0, low = Infinity
  for (var mk = 0; mk < 8; mk++) {
    mask(mk)
    fmt(mk)
    var c = cost()
    if (c < low) { low = c; best = mk }
    mask(mk)
  }
  mask(best)
  fmt(best)
  return m
}

function qrsvg(text) {
  var m = qr(text)
  if (!m) return ''
  var n = m.length, d = ''
  m.forEach(function (row, y) { row.forEach(function (on, x) { if (on) d += 'M' + (x + 4) + ' ' + (y + 4) + 'h1v1h-1z' }) })
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + (n + 8) + ' ' + (n + 8) + '" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="' + d + '" fill="#111"/></svg>'
}
