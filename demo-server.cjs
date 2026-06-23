// Máy chủ tĩnh tối giản chỉ để xem thử demo.html (không liên quan app thật).
// Chạy: node demo-server.cjs  →  http://localhost:4173
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, 'public');
const PORT = 4173;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

http.createServer((req, res) => {
  let rel = decodeURIComponent(req.url.split('?')[0]);
  if (rel === '/' || rel === '') rel = '/demo.html';
  const filePath = path.normalize(path.join(ROOT, rel));
  if (!filePath.startsWith(ROOT)) { res.statusCode = 403; return res.end('Forbidden'); }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.statusCode = 404; return res.end('Not found'); }
    res.setHeader('Content-Type', TYPES[path.extname(filePath)] || 'application/octet-stream');
    res.end(data);
  });
}).listen(PORT, () => console.log(`Demo UI: http://localhost:${PORT}`));
