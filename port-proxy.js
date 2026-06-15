const http = require('http');
const PORT = 8000;
const TARGET = 9090;

http.createServer((req, res) => {
    const options = {
        hostname: '127.0.0.1',
        port: TARGET,
        path: req.url,
        method: req.method,
        headers: req.headers
    };
    const proxy = http.request(options, (targetRes) => {
        res.writeHead(targetRes.statusCode, targetRes.headers);
        targetRes.pipe(res);
    });
    req.pipe(proxy);
}).listen(PORT, () => console.log(`Proxy: port ${PORT} → ${TARGET}`));