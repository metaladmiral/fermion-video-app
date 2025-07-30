import { Server as SocketIOServer } from "socket.io";

export const createSocketServer = (server: any) => {
  const io = new SocketIOServer(server, {
    cors: {
      origin: "https://fermion.erpzen.in",
      methods: ["GET", "POST"],
      credentials: true,
    },

    path: "/ws",
  });

  return io;
};
