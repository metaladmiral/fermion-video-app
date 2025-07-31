import * as mediasoup from "mediasoup";
import { Room } from "./sfu";
import {
  buildSdpLines,
  cleanupRtpConsumers,
  generateSdp,
  getRandomPort,
} from "../helper";
import path from "path";
import { deepEqual } from "fast-equals";
import { spawnFFmpeg } from "../ffmpeg/ffmpeg";
import { unlink } from "fs/promises";

const CONSUMER_RESUME_DELAY_MS = 1000;

// this fxn checks starts a new Ffmpeg process only if there is an addition/removal of a producer
export default async function startLiveStream(
  router: mediasoup.types.Router,
  room: Room
) {
  // check if any producer is added or removed in a room
  const hasProducersChanged = !deepEqual(
    room.producers,
    room.producersInFfmpeg
  );

  // Skip stream() if producers didn't change or ffmpeg delay is active to avoid race conditions
  if (!hasProducersChanged || room.shouldDelayFfmpegCall) {
    console.log(
      "aborting stream() fxn call, Change in producers:",
      hasProducersChanged,
      " delay:",
      room.shouldDelayFfmpegCall
    );
    return;
  }

  // update producers list
  room.producersInFfmpeg = new Map(room.producers);

  // clean-up if there is already a ffmpeg process
  if (room.ffmpegProcessController?.process) {
    console.log("cleaning up the old ffmpeg process");
    await room.ffmpegProcessController.cleanup();
    cleanupRtpConsumers(room);
    console.log("clean up done");
  }

  let basePort = getRandomPort();
  const sdpLines: string[] = [];

  // create a plain transport and a consumer for every producer in the room for ffmpeg
  for (const [socketid, producersMap] of room.producers) {
    for (const [producerId, producer] of producersMap) {
      const rtpTransport = await router.createPlainTransport({
        listenIp: { ip: "127.0.0.1", announcedIp: undefined },
        rtcpMux: false,
        comedia: false,
      });

      await rtpTransport.connect({
        ip: "127.0.0.1",
        port: basePort,
        rtcpPort: basePort + 1,
      });

      const consumer = await rtpTransport.consume({
        producerId: producerId,
        rtpCapabilities: router.rtpCapabilities,
        paused: true, // start as paused to ensure Ffmpeg is ready before media flows
      });
      room.rtpConsumersForFfmpeg.set(consumer.id, consumer);

      buildSdpLines(
        sdpLines, // passed by reference
        consumer.rtpParameters.codecs[0],
        basePort,
        producer.kind
      );

      basePort += 2;
    }
  }

  if (!sdpLines.length) {
    console.log("No producers yet!");
    if (!room.ffmpegProcessController?.process) {
      // deleting helps the frontend to show if its live or not
      console.log("no process... deleted stream.m3u8 if exists");
      await unlink(path.join(__dirname, "../../public/hls/stream.m3u8"));
    }
    return;
  }

  // ---------- SDP Generation and FFmpeg Spawn ----------

  // generate sdp
  const sdpPath = await generateSdp({
    sdpParams: sdpLines,
  });

  room.ffmpegProcessController = await spawnFFmpeg(
    sdpPath,
    path.join(__dirname, "../../public/hls") // output dir for hls chunks
  );
  await new Promise((res) => setTimeout(res, CONSUMER_RESUME_DELAY_MS));
  for (const rtpConsumer of room.rtpConsumersForFfmpeg.values()) {
    try {
      await rtpConsumer.resume();
    } catch (err) {
      console.log("error resuming consumer");
    }
  }
}
