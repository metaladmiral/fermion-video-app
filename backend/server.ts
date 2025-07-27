// /backend/server.ts
import express from "express";
import http from "http";
import { createSocketServer } from "./ws/ws";
import { createMediasoupWorker } from "./mediasoup/worker";
import { initMediasoup } from "./mediasoup/sfu";
import path from "path";
// import { initMediasoup } from "./mediasoup/sfu";

const app = express();
const server = http.createServer(app);
const io = createSocketServer(server);

app.use("/hls", express.static(path.join(__dirname, "/mediasoup/public/hls")));

async function main() {
  const mediasoupWorker = await createMediasoupWorker();
  const room = await initMediasoup(mediasoupWorker);
  setInterval(() => {
    console.log(
      "Producers count (/ed by 2): ",
      room.producers.size,
      " Consumer count: ",
      room.consumers.size
    );

    const consumerList = [];
    for (const consumerObj of room.consumers.values()) {
      for (const consumer of consumerObj.values()) {
        // console.log(consumer.id);
        consumerList.push({
          id: consumer.id,
          kind: consumer.kind,
        });
      }
    }
    console.log("Consumers: ", consumerList);
  }, 15000);

  io.on("connection", (socket) => {
    socket.on("getProducers", async (_, callback) => {
      const existingProducers = [];
      for (const [socketId, producerMap] of room.producers.entries()) {
        if (socketId === socket.id) continue; // Skip the current socket
        for (const [producerId, producer] of producerMap.entries()) {
          existingProducers.push({
            socketId,
            producerId,
            kind: producer.kind,
          });
        }
      }
      callback(existingProducers);
    });

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

          // room.producers.set(socket.id, producer);

          const producerMap = new Map();
          if (room.producers.has(socket.id)) {
            room.producers.get(socket.id)?.set(producer.id, producer);
          } else {
            producerMap.set(producer.id, producer);
            room.producers.set(socket.id, producerMap);
          }

          callback({ id: producer.id });

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

          if (room.consumers.has(socket.id)) {
            room.consumers.get(socket.id)?.set(consumer.id, consumer);
          } else {
            const consumerMap = new Map();
            consumerMap.set(consumer.id, consumer);
            room.consumers.set(socket.id, consumerMap);
          }

          callback({
            id: consumer.id,
            producerId,
            kind: consumer.kind,
            rtpParameters: consumer.rtpParameters,
          });
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
      if (room.consumers.has(socket.id)) {
        const currentConsumers = room.consumers.get(socket.id);

        if (currentConsumers) {
          for (const consumer of currentConsumers.values()) {
            consumer.close();
          }
        }
      }
      room.consumers.delete(socket.id);

      if (room.producers.has(socket.id)) {
        const currentProducers = room.producers.get(socket.id);

        if (currentProducers) {
          for (const producer of currentProducers.values()) {
            producer.close();
          }
        }
      }
      room.producers.delete(socket.id);
      // Remove producer
      // room.producers.delete(socket.id);
      // console.log("Producer removed for socket:", socket.id);
    });
  });

  server.listen(3001, () => {
    console.log("✅ SFU backend running on http://localhost:3001");
  });
}

main().catch(console.error);
