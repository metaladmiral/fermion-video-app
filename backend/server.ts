// /backend/server.ts
import express from "express";
import http from "http";
import { createSocketServer } from "./ws/ws";
import { createMediasoupWorker } from "./mediasoup/worker";
import { initMediasoup } from "./mediasoup/sfu";
// import { initMediasoup } from "./mediasoup/sfu";

const app = express();
const server = http.createServer(app);
const io = createSocketServer(server);

async function main() {
  const mediasoupWorker = await createMediasoupWorker();
  const room = await initMediasoup(mediasoupWorker);

  // setInterval(() => {
  //   console.log("Room state:", {
  //     producerIds: {
  //       count: room.producers.size,
  //       list: JSON.stringify(
  //         Array.from(room.producers.values()).map((p) => ({
  //           id: p.id,
  //         }))
  //       ),
  //     },
  //     consumerIds: {
  //       count: room.consumers.size,
  //       list: JSON.stringify(
  //         Array.from(room.consumers.values()).map((c) => ({
  //           id: c.id,
  //         }))
  //       ),
  //     },
  //   });
  // }, 5000);

  setInterval(() => {
    console.log(
      "Producer count:",
      room.producers.size,
      "Consumer count:",
      room.consumers.size
    );
  }, 10000);

  io.on("connection", (socket) => {
    const otherProducers = Array.from(room.producers.entries())
      .filter(([id]) => id !== socket.id)
      .map(([id, producer]) => ({
        producerId: producer.id,
        socketId: id,
        kind: producer.kind,
      }));
    socket.emit("existingProducers", otherProducers);

    socket.on("createTransport", async (_, callback) => {
      try {
        const { param } = await room.createWebRtcTransport();
        callback({ param });
      } catch (error) {
        console.error("Error creating transport:", error);
        callback({ error: "Failed to create transport" });
      }
    });

    socket.on(
      "connectTransport",
      async ({ transportId, dtlsParameters }, callback) => {
        try {
          const transport = room.getTransport(transportId);
          if (!transport) throw new Error("Transport not found");
          await transport.connect({ dtlsParameters });
          callback({ success: true });
        } catch (error) {
          callback({ error });
        }
      }
    );

    socket.on(
      "produce",
      async ({ transportId, kind, rtpParameters }, callback) => {
        try {
          const transport = room.getTransport(transportId);
          if (!transport) throw new Error("Transport not found");
          const producer = await transport.produce({ kind, rtpParameters });

          room.producers.set(socket.id, producer);
          callback({ id: producer.id });

          console.log("New producer created:", producer.id, socket.id);

          socket.broadcast.emit("newProducer", {
            producerId: producer.id,
            socketId: socket.id,
            kind,
          });
        } catch (error) {
          console.error("Error producing:", error);
          callback({ error: "Failed to produce" });
        }
      }
    );

    socket.on(
      "consume",
      async ({ producerId, transportId, rtpCapabilities }, callback) => {
        try {
          const transport = room.getTransport(transportId);
          if (!transport) throw new Error("Transport not found");
          const consumer = await transport.consume({
            producerId,
            rtpCapabilities,
            paused: false,
          });
          room.consumers.set(socket.id, consumer);
          callback({
            id: consumer.id,
            producerId,
            kind: consumer.kind,
            rtpParameters: consumer.rtpParameters,
          });
          console.log("Consumer call for:", producerId);
        } catch (error) {
          callback({ error });
        }
      }
    );

    socket.on("getRtpCapabilities", (callback) => {
      callback(room.router.rtpCapabilities);
    });

    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
      // Close and remove transports
      const transport = room.transports.get(socket.id);
      if (transport) {
        transport.close();
        room.transports.delete(socket.id);
        console.log("Transport closed for socket:", socket.id);
      }

      // Close and remove consumers
      const consumer = room.consumers.get(socket.id);
      if (consumer) {
        consumer.close();
        room.consumers.delete(socket.id);
        console.log("Consumer closed for socket:", socket.id, consumer.id);
      }

      // Remove producer
      const producer = room.producers.get(socket.id);
      if (producer) {
        room.producers.delete(socket.id);
        console.log("Producer closed for socket:", socket.id, producer.id);
      }
    });
  });

  server.listen(3001, () => {
    console.log("✅ SFU backend running on http://localhost:3001");
  });
}

main().catch(console.error);
