import * as mediasoup from "mediasoup";
import { mediasoupConfig } from "./config";
import startLiveStream from "./stream";
import {
  ProducerMap,
  ConsumerMap,
  RtpConsumersForFfmpeg,
  ProducersInFfmpeg,
  TransportMap,
} from "../types";
import { ChildProcessController } from "../helper";
import { Socket } from "socket.io";

export class Room {
  router: mediasoup.types.Router;
  transports: TransportMap;
  producers: ProducerMap;
  consumers: ConsumerMap;

  ffmpegProcessController: ChildProcessController | null;
  rtpConsumersForFfmpeg: RtpConsumersForFfmpeg;
  producersInFfmpeg: ProducersInFfmpeg; // keeps track of the producers currently being served by ffmpeg
  shouldDelayFfmpegCall: boolean; // delay ffmpeg call if due to a recent change in producers list

  constructor(router: mediasoup.types.Router) {
    this.router = router;
    this.transports = new Map();
    this.producers = new Map();
    this.consumers = new Map();

    this.ffmpegProcessController = null;
    this.rtpConsumersForFfmpeg = new Map();
    this.producersInFfmpeg = new Map();
    this.shouldDelayFfmpegCall = false;
  }

  async createWebRtcTransport(socketId: string) {
    const transport = await this.router.createWebRtcTransport(
      mediasoupConfig.webRtcTransport
    );
    console.log("created transport Id: ", transport.id);
    const transportIdMap = this.transports.get(socketId) || new Map();
    transportIdMap.set(transport.id, transport);
    this.transports.set(socketId, transportIdMap);

    transport.on("dtlsstatechange", (dtlsState) => {
      if (dtlsState === "closed") {
        console.log("Closing a transport");
        transport.close();
      }
    });

    return {
      transport,
      param: {
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
      },
    };
  }

  getTransport(socketId: string, transportId: string) {
    return this.transports.get(socketId)?.get(transportId);
  }
}

export async function initMediasoup(worker: mediasoup.types.Worker) {
  try {
    const router = await worker.createRouter({
      mediaCodecs: mediasoupConfig.mediaCodecs,
    });
    console.log("Mediasoup router created with ID: ", router.id);
    return router;
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.log("Error creating a router: ", error.message);
    }
    return null;
  }
}

export function createRoom(router: mediasoup.types.Router) {
  const room = new Room(router);

  // Periodically check for producer changes and restart FFmpeg stream if needed
  setInterval(() => {
    startLiveStream(router, room);
  }, 8000);
  return room;
}
