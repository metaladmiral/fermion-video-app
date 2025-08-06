import * as mediasoupClient from "mediasoup-client";

export type TransportResponse = {
  param?: {
    id: string;
    iceParameters: mediasoupClient.types.IceParameters;
    iceCandidates: mediasoupClient.types.IceCandidate[];
    dtlsParameters: mediasoupClient.types.DtlsParameters;
  };
  error?: string;
};

export type ExistingProducersList = {
  socketId: string;
  producerId: string;
  kind: "video" | "audio";
};

export interface SocketCallbackResponse {
  success?: boolean;
  error?: string;
}

export interface ProduceSocketCallbackResponse extends SocketCallbackResponse {
  id?: string; // backend sends produce-id
}

export interface ConsumeSocketCallbackResponse extends SocketCallbackResponse {
  id?: string; // backend sends consumer-id
  producerId?: string;
  kind?: "video" | "audio";
  rtpParameters?: mediasoupClient.types.RtpParameters;
}
