import http from "http";
import { Server } from "socket.io";
import { RoomManager } from "./room-manager";
import type { ClientToServerEvents, ServerToClientEvents } from "../src/shared/game-types";

const port = Number(process.env.PORT || 3001);
const clientOrigin = process.env.CLIENT_ORIGIN || "http://localhost:3000";

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  res.writeHead(200, { "content-type": "text/plain" });
  res.end("Among Jose realtime server");
});

const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
  cors: {
    origin: clientOrigin,
    credentials: false
  }
});

const manager = new RoomManager(io);

io.on("connection", (socket) => {
  manager.attach(socket);
});

server.listen(port, () => {
  console.log(`Among Jose realtime server listening on ${port}`);
});
