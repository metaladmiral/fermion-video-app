import next from "next";
import express, { Request, Response } from "express";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { setupMediasoup } from "./lib/mediasoup-server";

const dev = process.env.NODE_ENV !== "production";
const nextApp = next({ dev });
const handle = nextApp.getRequestHandler();
const port = 3000;

nextApp.prepare().then(async () => {
  const app = express();
  const server = createServer(app);
  const io = new SocketIOServer(server, {
    cors: { origin: "*" },
  });

  await setupMediasoup(io); // pass Socket.IO instance to mediasoup

  app.all("*", (req, res) => handle(req, res));

  server.listen(port, () => {
    console.log(`✅ Server ready at http://localhost:${port}`);
  });
});
