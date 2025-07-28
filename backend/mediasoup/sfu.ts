import * as mediasoup from "mediasoup";
import { RtpCodecCapability } from "mediasoup/node/lib/rtpParametersTypes";
import { config } from "./config";
import stream from "./stream";
import { Producer, Consumer } from "./types";
export class Room {
  router: mediasoup.types.Router;
  transports: Map<string, mediasoup.types.WebRtcTransport>;
  producers: Producer;
  consumers: Consumer;
  constructor(router: mediasoup.types.Router) {
    this.router = router;
    this.transports = new Map();
    this.producers = new Map();
    this.consumers = new Map();
  }
  async createWebRtcTransport() {
    const transport = await this.router.createWebRtcTransport(
      config.webRtcTransport
    );
    this.transports.set(transport.id, transport);

    transport.on("dtlsstatechange", (dtlsState) => {
      if (dtlsState === "closed") {
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

// know what are these exactly after completing
const mediaCodecs: RtpCodecCapability[] = [
  {
    kind: "audio",
    mimeType: "audio/opus",
    clockRate: 48000,
    channels: 2,
  },
  {
    kind: "video",
    mimeType: "video/H264",
    clockRate: 90000,
    parameters: {
      "packetization-mode": 1,
      "profile-level-id": "42e01f",
      "level-asymmetry-allowed": 1,
    },
  },
];

export async function initMediasoup(worker: mediasoup.types.Worker) {
  const router = await worker.createRouter({ mediaCodecs });
  console.log("Mediasoup router created with ID: ", router.id);
  return router;
}

export function createRoom(router: mediasoup.types.Router) {
  const room = new Room(router);
  stream(router, room);
  return room;
}
