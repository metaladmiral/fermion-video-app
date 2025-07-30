import * as mediasoup from "mediasoup";
import { Room } from "./sfu";
import { Producer } from "./types";
import { cleanupRtpConsumers, generateSdp } from "./helper";
import { spawn } from "child_process";
import path from "path";
import { promises as fs } from "fs";
import { ChildProcessController } from "./types";
import { gracefulProcessKill } from "./helper";
import { deepEqual } from "fast-equals";

let streamInternvalFxn: ReturnType<typeof setInterval>;
// const consumers = new Map<string, mediasoup.types.Consumer>();
let producersInFfmpeg = new Map();

export default async function stream(
  router: mediasoup.types.Router,
  room: Room
  // changeInProducers: boolean = false // checks if stream is called due to addition/removal of a producer
) {
  // check if any producer is added or removed.
  const changeInProducer = !deepEqual(room.producers, producersInFfmpeg);
  if (
    !changeInProducer ||
    room.delayFfmpeg // to tackle race condition when multiple producers come in a very short span and ffmpeg runs in b/w then - ignoring one of the producers. Can happen mostly with audio producers.
  ) {
    console.log(
      "aborting stream() fxn call, CIP:",
      changeInProducer,
      " delay:",
      room.delayFfmpeg
    );
    return;
  }

  producersInFfmpeg = new Map(room.producers);

  // if (changeInProducers) {
  //   console.log("CHANGE IN PRODUCERS");
  if (room.ffmpegProcessController) {
    console.log("cleaning up the old ffmpeg process");
    const a = await room.ffmpegProcessController.cleanup(
      room.ffmpegProcessController.process
    );
    cleanupRtpConsumers(room);

    console.log("clean up done");
    console.log(a);
  }
  // }

  console.log("in stream");
  let basePort = Math.floor(Math.random() * (65535 - 1024 + 1)) + 1024;
  const sdpLines = [];

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
        paused: true,
      });
      console.log("new consumer for ffmpeg: ", consumer.id);

      room.rtpConsumersForFfmpeg.set(consumer.id, consumer);

      const payloadType = consumer.rtpParameters.codecs[0].payloadType;
      const codec = consumer.rtpParameters.codecs[0].mimeType.split("/")[1];
      const clockRate = consumer.rtpParameters.codecs[0].clockRate;
      const channels = consumer.rtpParameters.codecs[0].channels;

      const mediaType = consumer.rtpParameters.codecs[0].mimeType.startsWith(
        "video/"
      )
        ? "video"
        : "audio";

      const rateStr = channels ? `${clockRate}/${channels}` : `${clockRate}`;

      sdpLines.push(`m=${mediaType} ${basePort} RTP/AVP ${payloadType}`);
      sdpLines.push(`a=rtpmap:${payloadType} ${codec}/${rateStr}`);
      if (producer.kind == "video") {
        sdpLines.push(`a=framerate:30`);
      }
      sdpLines.push(`a=rtcp:${basePort + 1} IN IP4 127.0.0.1`);
      sdpLines.push(``);

      basePort += 2;
    }
  }

  if (!sdpLines.length) {
    console.log("No producers yet!");
    return;
  }

  // if (!sdpLines.length && !streamInternvalFxn) {
  //   streamInternvalFxn = setInterval(() => {
  //     stream(router, room);
  //   }, 16000);
  //   return;
  // } else if (!sdpLines.length && streamInternvalFxn) {
  //   return;
  // } else {
  //   clearInterval(streamInternvalFxn);
  // }

  // generate sdp
  const sdpPath = await generateSdp({
    sdpParams: sdpLines,
  });

  console.log("SdpPath: ", sdpPath);
  room.ffmpegProcessController = await spawnFFmpeg(
    sdpPath,
    path.join(__dirname, "public/hls")
  );
  await new Promise((res) => setTimeout(res, 1000));
  for (const [_, consumer__] of room.rtpConsumersForFfmpeg.entries()) {
    await consumer__.resume();
  }
}

export async function spawnFFmpeg(
  sdpPath: string,
  outputDir: string
): Promise<ChildProcessController> {
  console.log("starting ffmpeg now");

  const sdpText = await fs.readFile(sdpPath, "utf-8");
  const videoStreamCount = (sdpText.match(/^m=video /gm) || []).length;

  const args = [
    "-protocol_whitelist",
    "file,udp,rtp",
    "-fflags",
    "+genpts",
    "-analyzeduration",
    "1000000",
    "-probesize",
    "1000000",
    "-i",
    sdpPath,
  ];

  if (videoStreamCount > 1) {
    console.error("BOOM BOOM");
    const scaleHeight = 360;
    const scaleWidth = 360;

    const scaledInputs = Array.from({ length: videoStreamCount }, (_, i) => {
      return `[0:v:${i}]scale=${scaleWidth}:${scaleHeight}[vs${i}]`;
    });

    const videoInputs = Array.from(
      { length: videoStreamCount },
      (_, i) => `[vs${i}]`
    ).join("");

    const filter = `${scaledInputs.join(
      ";"
    )};${videoInputs}hstack=inputs=${videoStreamCount}[v]`;

    args.push(
      "-filter_complex",
      filter,
      "-map",
      "[v]",
      "-map",
      "0:a?" // optional audio
    );
  }

  args.push(
    // Re-encode video
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-tune",
    "zerolatency",
    "-profile:v",
    "baseline",
    "-level:v",
    "3.1",
    "-r",
    "30", // Output framerate
    "-g",
    "60", // GOP = 2 sec
    "-keyint_min",
    "30",
    "-sc_threshold",
    "0",
    // Audio encoding
    "-c:a",
    "aac",
    "-ar",
    "44100",
    "-b:a",
    "128k",
    // Output HLS
    "-f",
    "hls",
    "-hls_time",
    "2",
    "-hls_list_size",
    "5",
    "-hls_flags",
    "delete_segments",
    "-use_wallclock_as_timestamps",
    "1",
    "-avoid_negative_ts",
    "make_zero",
    "-max_muxing_queue_size",
    "1024",
    path.join(outputDir, "stream.m3u8")
  );

  const ffmpeg = spawn("ffmpeg", args);

  ffmpeg.stdout.on("data", async (data) => {
    await fs.appendFile(path.join(__dirname, "/logs/ffmpeg.logs"), data);
  });

  ffmpeg.stderr.on("data", async (data) => {
    await fs.appendFile(path.join(__dirname, "/logs/ffmpeg.logs"), data);
  });

  ffmpeg.on("exit", async (code) => {
    console.log(`FFmpeg exited with code ${code}`);
  });

  const childProcessControllerInstance: ChildProcessController = {
    process: ffmpeg,
    cleanup: gracefulProcessKill,
    isRunning: true,
  };
  return Promise.resolve(childProcessControllerInstance);
}
