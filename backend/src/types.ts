import { ChildProcess } from "child_process";
import * as mediasoup from "mediasoup";

export type TransportMap = Map<
  string,
  Map<string, mediasoup.types.WebRtcTransport>
>;
export type ProducerMap = Map<string, Map<string, mediasoup.types.Producer>>;
export type ConsumerMap = Map<string, Map<string, mediasoup.types.Consumer>>;

export type RtpConsumersForFfmpeg = Map<string, mediasoup.types.Consumer>;
export type ProducersInFfmpeg = ProducerMap;
