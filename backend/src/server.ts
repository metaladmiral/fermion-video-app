import express from "express";
import http from "http";
import { createSocketServer } from "./ws/ws";
import { createMediasoupWorker } from "./mediasoup/worker";
import { createRoom, initMediasoup } from "./mediasoup/sfu";
import path from "path";
import { delayFfmpegRun } from "./helper";
import cors from "cors";

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = createSocketServer(server);

app.use("/", express.static(path.join(__dirname, "../public/")));

async function main() {
  const mediasoupWorker = await createMediasoupWorker();
  const router = await initMediasoup(mediasoupWorker);
  const room = createRoom(router);
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
        const { param } = await room.createWebRtcTransport(socket.id);
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
          const transport = room.getTransport(socket.id, transportId);
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
          delayFfmpegRun(room);

          const transport = room.getTransport(socket.id, transportId);
          if (!transport) throw new Error("Transport not found");
          const producer = await transport.produce({ kind, rtpParameters });

          console.log("new producer: " + producer.id);

          // room.producers.set(socket.id, producer);

          producer.on("transportclose", () => {
            console.error("Producer Transport close");
            // emit msg to client to close the producer
            // stream(router, room, true);
            socket.emit("removeProducerInClient", {
              producerId: producer.id,
            });
          });

          const producerMap = new Map();
          if (room.producers.has(socket.id)) {
            room.producers.get(socket.id)?.set(producer.id, producer);
          } else {
            producerMap.set(producer.id, producer);
            room.producers.set(socket.id, producerMap);
          }

          callback({ id: producer.id });

          // stream(router, room, true);
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
          const transport = room.getTransport(socket.id, transportId);
          if (!transport) throw new Error("Transport not found");
          const consumer = await transport.consume({
            producerId,
            rtpCapabilities,
            paused: false,
          });

          consumer.on("producerclose", () => {
            console.log("closing consumer invoked for: ", consumer.id);
            if (room.consumers.get(socket.id)?.delete(consumer.id)) {
              console.log("Removed consumer: ", consumer.id);
            }
            // also emit through socket to close consumer in the client-side
            socket.emit("removeConsumerInClient", {
              consumerId: consumer.id,
            });
          });

          consumer.on("transportclose", () => {
            // emit to client to close this consumer at the client-side
            socket.emit("removeConsumerInClient", {
              consumerId: consumer.id,
            });
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

    socket.on("removeConsumerInServer", ({ consumerId }, callback) => {
      const consumers = room.consumers.get(socket.id);
      const consumer = consumers?.get(consumerId);
      if (consumer) consumer.close();
      consumers?.delete(consumerId);
    });

    socket.on("removeProducerInServer", ({ producerId }, callback) => {
      const producers = room.producers.get(socket.id);
      const producer = producers?.get(producerId);
      if (producer) producer.close();
      producers?.delete(producerId);
      // stream(router, room, true);
    });

    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);

      // Close and remove transports
      const currentTransports = room.consumers.get(socket.id);
      if (currentTransports) {
        for (const transport of currentTransports.values()) {
          transport.close();
        }
      }
      room.transports.delete(socket.id);

      // Close and remove consumers
      const currentConsumers = room.consumers.get(socket.id);
      if (currentConsumers) {
        for (const consumer of currentConsumers.values()) {
          consumer.close();
        }
      }
      room.consumers.delete(socket.id);

      // Close and remove producers
      const currentProducers = room.producers.get(socket.id);
      if (currentProducers) {
        for (const producer of currentProducers.values()) {
          producer.close();
        }
      }
      room.producers.delete(socket.id);
    });
  });

  server.listen(3001, "0.0.0.0", () => {
    console.log("✅ SFU backend running on http://localhost:3001");
  });
}

main().catch(console.error);
