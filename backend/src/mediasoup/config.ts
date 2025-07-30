import * as mediasoup from "mediasoup";
import { RtpCodecCapability } from "mediasoup/node/lib/rtpParametersTypes";

export const mediasoupConfig: {
  webRtcTransport: mediasoup.types.WebRtcTransportOptions;
  mediaCodecs: RtpCodecCapability[];
} = {
  webRtcTransport: {
    listenIps: [
      {
        ip: "0.0.0.0",
        announcedIp: "127.0.0.1",
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
