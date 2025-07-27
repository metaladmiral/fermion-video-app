import * as mediasoup from "mediasoup";
import { Room } from "./sfu";
import { Producer } from "./types";
import { generateSdp } from "./helper";
import { spawn } from "child_process";
import path from "path";
import { promises as fs } from "fs";

async function createConsumersForStreaming(
  router: mediasoup.types.Router,
  rtpTransport: mediasoup.types.Transport,
  producers: Producer
) {
  for (const [socketid, producersMap] of producers) {
    for (const [producerId, producer] of producersMap) {
      await rtpTransport.consume({
        producerId: producer.id,
        rtpCapabilities: router.rtpCapabilities, // doesn't matter much here
        paused: false,
      });
    }
  }
}

export default async function stream(
  router: mediasoup.types.Router,
  room: Room
) {
  const rtpTransport = await router.createPlainTransport({
    listenIp: { ip: "127.0.0.1", announcedIp: undefined },
    rtcpMux: true,
    comedia: false,
  });

  console.log("RTP Transport created:", {
    ip: rtpTransport.tuple.localIp,
    port: rtpTransport.tuple.localPort,
    rtcpPort: rtpTransport.rtcpTuple?.localPort,
  });

  if (room.producers.size >= 4) {
    await createConsumersForStreaming(router, rtpTransport, room.producers);

    const sdpPath = await generateSdp({
      audioPort: rtpTransport.tuple.localPort,
      videoPort: rtpTransport.tuple.localPort,
    });
    console.log("SDP path");

    spawnFFmpeg(sdpPath, path.join(__dirname, "public/hls"));
  } else {
    console.log("no producers yet... registering an interval to chk");
    const interval = setInterval(async () => {
      if (room.producers.size > 0) {
        clearInterval(interval);
        console.log("Creating Consumers");
        await createConsumersForStreaming(router, rtpTransport, room.producers);

        console.log("Generating the SDP path now:");
        const sdpPath = await generateSdp({
          audioPort: rtpTransport.tuple.localPort,
          videoPort: rtpTransport.tuple.localPort,
        });
        console.log(sdpPath);

        spawnFFmpeg(sdpPath, path.join(__dirname, "public/hls"));
      }
    }, 8000);
  }
}

function spawnFFmpeg(sdpPath: string, outputDir: string) {
  console.log("starting ffmpeg now");
  const ffmpeg = spawn("ffmpeg", [
    "-protocol_whitelist",
    "file,udp,rtp",
    "-i",
    sdpPath,
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-tune",
    "zerolatency",
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
    path.join(outputDir, "stream.m3u8"),
  ]);

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
