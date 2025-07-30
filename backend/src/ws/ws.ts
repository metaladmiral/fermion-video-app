import { Server as SocketIOServer } from "socket.io";

export const createSocketServer = (server: any) => {
  const io = new SocketIOServer(server, {
    cors: { origin: "*" },
    path: "/ws",
  });

  return io;
};
