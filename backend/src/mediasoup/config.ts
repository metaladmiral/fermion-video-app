import * as mediasoup from "mediasoup";
import { RtpCodecCapability } from "mediasoup/node/lib/rtpParametersTypes";
import dotenv from "dotenv";

dotenv.config();

const DEPLOYMENT = process.env.DEPLOYMENT_ENV || "DEV";
const PUBLIC_DOMAIN = process.env.PROD_DOMAIN || "fermion-backend.erpzen.in";
const ANNOUNCED_IP = DEPLOYMENT == "DEV" ? "127.0.0.1" : PUBLIC_DOMAIN;

export const mediasoupConfig: {
  webRtcTransport: mediasoup.types.WebRtcTransportOptions;
  mediaCodecs: RtpCodecCapability[];
} = {
  webRtcTransport: {
    listenIps: [
      {
        ip: "0.0.0.0",
        announcedIp: ANNOUNCED_IP, // 127.0.0.1 for local, Public IP/Domain for prod
      },
    ],
    initialAvailableOutgoingBitrate: 1000000,
    enableUdp: true,
    enableTcp: true,
    maxSctpMessageSize: 262144,
  },
  mediaCodecs: [
    {
      kind: "audio",
      mimeType: "audio/opus",
      clockRate: 48000,
      channels: 2,
      preferredPayloadType: 100,
    },
    {
      kind: "video",
      mimeType: "video/H264",
      clockRate: 90000,
      preferredPayloadType: 101,
      parameters: {
        "packetization-mode": 1,
        "profile-level-id": "42e01f",
        "level-asymmetry-allowed": 1,
      },
    },
  ],
};
