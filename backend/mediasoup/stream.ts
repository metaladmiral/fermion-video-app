import * as mediasoup from "mediasoup";
import { Room } from "./sfu";
import { Producer } from "./types";
import { generateSdp } from "./helper";
import { spawn } from "child_process";
import path from "path";
import { promises as fs } from "fs";

let streamInternvalFxn: ReturnType<typeof setInterval>;

export default async function stream(
  router: mediasoup.types.Router,
  room: Room
) {
  console.log("in stream");
  let basePort = 5004; // Ensure it's even and unique
  const sdpLines = [];

  for (const [socketid, producersMap] of room.producers) {
    for (const [producerId, producer] of producersMap) {
      const rtpTransport = await router.createPlainTransport({
        listenIp: { ip: "127.0.0.1", announcedIp: undefined },
        rtcpMux: true,
        comedia: false,
      });

      await rtpTransport.connect({
        ip: rtpTransport.tuple.localAddress,
        port: basePort,
      });

      const consumer = await rtpTransport.consume({
        producerId: producerId,
        rtpCapabilities: router.rtpCapabilities,
        paused: false,
      });

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
      sdpLines.push(`a=rtcp-mux`);
      sdpLines.push(``);

      basePort += 2;
    }
  }

  if (!sdpLines.length && !streamInternvalFxn) {
    streamInternvalFxn = setInterval(() => {
      stream(router, room);
    }, 8000);
    return;
  } else if (!sdpLines.length && streamInternvalFxn) {
    return;
  } else {
    clearInterval(streamInternvalFxn);
  }

  // generate sdp
  const sdpPath = await generateSdp({
    sdpParams: sdpLines,
  });

  console.log("SdpPath: ", sdpPath);
  spawnFFmpeg(sdpPath, path.join(__dirname, "public/hls"));
}

export async function spawnFFmpeg(sdpPath: string, outputDir: string) {
  console.log("starting ffmpeg now");

  const sdpText = await fs.readFile(sdpPath, "utf-8");
  const videoStreamCount = (sdpText.match(/^m=video /gm) || []).length;

  const args = [
    "-protocol_whitelist",
    "file,udp,rtp",
    "-fflags",
    "+genpts+igndts",
    "-i",
    sdpPath,
  ];

  if (videoStreamCount > 1) {
    const videoInputs = Array.from(
      { length: videoStreamCount },
      (_, i) => `[0:v:${i}]`
    ).join("");
    const filter = `${videoInputs}hstack=inputs=${videoStreamCount}[v]`;

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
    "-g",
    "30",
    "-keyint_min",
    "15",
    "-sc_threshold",
    "0",
    "-err_detect",
    "ignore_err",
    "-c:a",
    "aac",
    "-ar",
    "44100",
    "-b:a",
    "128k",
    "-f",
    "hls",
    "-hls_time",
    "2",
    "-hls_list_size",
    "5",
    "-hls_flags",
    "delete_segments",
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

  return ffmpeg;
}
