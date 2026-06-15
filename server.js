const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = __dirname;
const port = Number(process.env.PORT || 8080);
const clients = new Map();
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const target = path.join(root, url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname));

  if (!target.startsWith(root)) {
    res.writeHead(403);
    res.end("forbidden");
    return;
  }

  fs.readFile(target, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("not found");
      return;
    }

    res.writeHead(200, { "Content-Type": types[path.extname(target)] || "application/octet-stream" });
    res.end(data);
  });
});

server.on("upgrade", (req, socket) => {
  if ((req.headers.upgrade || "").toLowerCase() !== "websocket") {
    socket.destroy();
    return;
  }

  const key = req.headers["sec-websocket-key"];
  const accept = crypto.createHash("sha1")
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest("base64");

  socket.write([
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${accept}`,
    "",
    "",
  ].join("\r\n"));

  const id = crypto.randomUUID();
  clients.set(id, socket);
  socket.on("data", (buffer) => {
    const text = decodeFrame(buffer);
    if (!text) return;
    for (const [clientId, client] of clients) {
      if (clientId !== id && !client.destroyed) client.write(encodeFrame(text));
    }
  });
  socket.on("close", () => clients.delete(id));
  socket.on("error", () => clients.delete(id));
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Omok Arena: http://localhost:${port}`);
});

function decodeFrame(buffer) {
  const second = buffer[1];
  const lengthCode = second & 127;
  let offset = 2;
  let length = lengthCode;

  if (lengthCode === 126) {
    length = buffer.readUInt16BE(offset);
    offset += 2;
  } else if (lengthCode === 127) {
    length = Number(buffer.readBigUInt64BE(offset));
    offset += 8;
  }

  const mask = buffer.subarray(offset, offset + 4);
  offset += 4;
  const payload = buffer.subarray(offset, offset + length);
  const decoded = Buffer.alloc(payload.length);

  for (let index = 0; index < payload.length; index += 1) {
    decoded[index] = payload[index] ^ mask[index % 4];
  }

  return decoded.toString("utf8");
}

function encodeFrame(text) {
  const payload = Buffer.from(text);
  const length = payload.length;

  if (length < 126) {
    return Buffer.concat([Buffer.from([129, length]), payload]);
  }

  const header = Buffer.alloc(4);
  header[0] = 129;
  header[1] = 126;
  header.writeUInt16BE(length, 2);
  return Buffer.concat([header, payload]);
}
