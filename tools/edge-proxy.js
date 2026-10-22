// GitHub 边缘 IP 转发（临时）：github.com:443 默认解析的 IP 被阻断时用它
// 由 sync-github.ps1 自动启动，监听 127.0.0.1:1080
const net = require('net')

const IPS = (process.env.TARGET_IPS || '140.82.121.3,20.27.177.113,20.200.245.247').split(',')
const PORT = Number(process.env.PORT || 1080)

function dial(ip, port, cb) {
  const s = net.connect({ host: ip, port })
  let done = false
  const t = setTimeout(() => { if (!done) { done = true; s.destroy(); cb(new Error('timeout')) } }, 5000)
  s.once('connect', () => { if (done) return; done = true; clearTimeout(t); cb(null, s) })
  s.once('error', e => { if (done) return; done = true; clearTimeout(t); cb(e) })
}

function tryAll(port, cb, i) {
  i = i || 0
  if (i >= IPS.length) return cb(new Error('all failed'))
  dial(IPS[i], port, (err, s) => {
    if (err) return tryAll(port, cb, i + 1)
    cb(null, s)
  })
}

net.createServer(client => {
  client.on('error', () => {})
  client.once('data', chunk => {
    const m = chunk.toString('latin1').match(/^CONNECT\s+([^\s:]+):(\d+)/)
    if (!m) { client.destroy(); return }
    tryAll(Number(m[2]) || 443, (err, up) => {
      if (err) { client.destroy(); return }
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      client.pipe(up); up.pipe(client)
      up.on('error', () => client.destroy())
      up.on('close', () => client.destroy())
      client.on('close', () => up.destroy())
    })
  })
}).listen(PORT, '127.0.0.1', () => console.log('edge proxy ready :' + PORT))
