import * as mediasoup from "mediasoup";
import { mediasoupConfig } from "./config";
import startLiveStream from "./stream";
import {
  ProducerMap,
  ConsumerMap,
  RtpConsumersForFfmpeg,
  ProducersInFfmpeg,
} from "../types";
import { ChildProcessController } from "../helper";

export class Room {
  router: mediasoup.types.Router;
  transports: Map<string, mediasoup.types.WebRtcTransport>;
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

  async createWebRtcTransport() {
    const transport = await this.router.createWebRtcTransport(
      mediasoupConfig.webRtcTransport
    );
    this.transports.set(transport.id, transport);

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

  getTransport(id: string) {
    return this.transports.get(id);
  }
}

export async function initMediasoup(worker: mediasoup.types.Worker) {
  const router = await worker.createRouter({
    mediaCodecs: mediasoupConfig.mediaCodecs,
  });
  console.log("Mediasoup router created with ID: ", router.id);
  return router;
}

export function createRoom(router: mediasoup.types.Router) {
  const room = new Room(router);

  // Periodically check for producer changes and restart FFmpeg stream if needed
  setInterval(() => {
    startLiveStream(router, room);
  }, 8000);
  return room;
}
