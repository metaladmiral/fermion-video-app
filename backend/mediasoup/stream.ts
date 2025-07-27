import * as mediasoup from "mediasoup";
import { Room } from "./sfu";
import { Producer } from "./types";
import { generateSdp } from "./helper";
import { spawn } from "child_process";
import path from "path";
import { promises as fs } from "fs";

async function createConsumersForStreaming(
  router: mediasoup.types.Router,
  audioTransport: mediasoup.types.Transport,
  videoTransport: mediasoup.types.Transport,
  producers: Producer
) {
  for (const [socketid, producersMap] of producers) {
    for (const [producerId, producer] of producersMap) {
      // Create consumers on appropriate transports based on media type
      const transport =
        producer.kind === "audio" ? audioTransport : videoTransport;

      await transport.consume({
        producerId: producer.id,
        rtpCapabilities: router.rtpCapabilities,
        paused: false,
      });
    }
  }
}

export default async function stream(
  router: mediasoup.types.Router,
  room: Room
) {
  // Create separate transports for audio and video to avoid port conflicts
  const audioTransport = await router.createPlainTransport({
    listenIp: { ip: "127.0.0.1", announcedIp: undefined },
    rtcpMux: false,
    comedia: true, // Enable comedia to handle dynamic ports
  });

  const videoTransport = await router.createPlainTransport({
    listenIp: { ip: "127.0.0.1", announcedIp: undefined },
    rtcpMux: false,
    comedia: true, // Enable comedia to handle dynamic ports
  });

  console.log("RTP Transports created:", {
    audio: {
      ip: audioTransport.tuple.localIp,
      port: audioTransport.tuple.localPort,
      rtcpPort: audioTransport.rtcpTuple?.localPort,
    },
    video: {
      ip: videoTransport.tuple.localIp,
      port: videoTransport.tuple.localPort,
      rtcpPort: videoTransport.rtcpTuple?.localPort,
    },
  });

  if (room.producers.size > 0) {
    await createConsumersForStreaming(
      router,
      audioTransport,
      videoTransport,
      room.producers
    );

    const sdpPath = await generateSdp({
      audioPort: audioTransport.tuple.localPort,
      videoPort: videoTransport.tuple.localPort,
    });

    console.log("SDP generated at:", sdpPath);
    spawnFFmpeg(sdpPath, path.join(__dirname, "public/hls"));
  } else {
    console.log("No producers yet... registering an interval to check");
    const interval = setInterval(async () => {
      if (room.producers.size > 0) {
        clearInterval(interval);
        console.log("Creating Consumers");
        await createConsumersForStreaming(
          router,
          audioTransport,
          videoTransport,
          room.producers
        );

        console.log("Generating the SDP path now:");
        const sdpPath = await generateSdp({
          audioPort: audioTransport.tuple.localPort,
          videoPort: videoTransport.tuple.localPort,
        });
        console.log("SDP generated at:", sdpPath);

        spawnFFmpeg(sdpPath, path.join(__dirname, "public/hls"));
      }
    }, 8000);
  }
}

function spawnFFmpeg(sdpPath: string, outputDir: string) {
  console.log("Starting FFmpeg with SDP:", sdpPath);

  // Ensure output directory exists
  require("fs").mkdirSync(outputDir, { recursive: true });

  const ffmpeg = spawn("ffmpeg", [
    "-y", // Overwrite output files
    "-protocol_whitelist",
    "file,udp,rtp",
    "-fflags",
    "+genpts", // Generate presentation timestamps
    "-i",
    sdpPath,
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-tune",
    "zerolatency",
    "-profile:v",
    "baseline", // Use baseline profile for better compatibility
    "-level",
    "3.1",
    "-pix_fmt",
    "yuv420p", // Ensure compatible pixel format
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
    "-hls_allow_cache",
    "0",
    path.join(outputDir, "stream.m3u8"),
  ]);

  ffmpeg.stdout.on("data", async (data) => {
    console.log(`FFmpeg stdout: ${data}`);
    try {
      await fs.appendFile(path.join(__dirname, "/logs/ffmpeg.logs"), data);
    } catch (err) {
      console.error("Failed to write to log file:", err);
    }
  });

  ffmpeg.stderr.on("data", async (data) => {
    console.log(`FFmpeg stderr: ${data}`);
    try {
      await fs.appendFile(path.join(__dirname, "/logs/ffmpeg.logs"), data);
    } catch (err) {
      console.error("Failed to write to log file:", err);
    }
  });

  ffmpeg.on("exit", async (code) => {
    console.log(`FFmpeg exited with code ${code}`);
  });

  ffmpeg.on("error", (err) => {
    console.error("FFmpeg process error:", err);
  });

  return ffmpeg;
}
