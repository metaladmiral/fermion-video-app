import * as mediasoup from "mediasoup";

export const config: {
  webRtcTransport: mediasoup.types.WebRtcTransportOptions;
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
};
