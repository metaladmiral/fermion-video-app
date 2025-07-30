import path from "path";
import { promises as fs } from "fs";
import { ChildProcess } from "child_process";
import { Room } from "./mediasoup/sfu";
import * as mediasoup from "mediasoup";

export function buildSdpLines(
  sdpLines: string[],
  consumerCodecs: mediasoup.types.RtpCodecParameters,
  basePort: number,
  producerKind: string
) {
  const consumerRtpParamInfo = consumerCodecs;
  const payloadType = consumerRtpParamInfo.payloadType;
  const codec = consumerRtpParamInfo.mimeType.split("/")[1];
  const clockRate = consumerRtpParamInfo.clockRate;
  const channels = consumerRtpParamInfo.channels;
  const mediaType = consumerRtpParamInfo.mimeType.startsWith("video/")
    ? "video"
    : "audio";
  const rateStr = channels ? `${clockRate}/${channels}` : `${clockRate}`;

  sdpLines.push(`m=${mediaType} ${basePort} RTP/AVP ${payloadType}`);
  sdpLines.push(`a=rtpmap:${payloadType} ${codec}/${rateStr}`);
  if (producerKind == "video") {
    sdpLines.push(`a=framerate:30`);
  }
  sdpLines.push(`a=rtcp:${basePort + 1} IN IP4 127.0.0.1`);
  sdpLines.push(``);
}

export async function generateSdp({ sdpParams }: { sdpParams: string[] }) {
  // Generate a proper SDP with correct formatting
  const sdp = [
    "v=0",
    "o=- 0 0 IN IP4 127.0.0.1",
    "s=Mediasoup Stream",
    "t=0 0",
    "c=IN IP4 127.0.0.1",
    "",
    ...sdpParams,
  ].join("\r\n");

  const sdpPath = path.join(__dirname, "stream.sdp");
  await fs.writeFile(sdpPath, sdp);
  return sdpPath;
}

export class ChildProcessController {
  process: ChildProcess | null;
  constructor(process: ChildProcess) {
    this.process = process;
  }

  async cleanup() {
    if (this.process && !this.process.killed) {
      await gracefulProcessKill(this.process);
      this.process = null;
    }
  }
}

export async function gracefulProcessKill(
  process: ChildProcess,
  gracePeriodMs: number = 5000
): Promise<void> {
  if (!process.pid) {
    return; // process already died
  }

  return new Promise<void>((resolve) => {
    let isResolved = false;
    const forceKillTimer = setTimeout(() => {
      if (!isResolved && process.pid) {
        console.log("kill signal sent");
        process.kill("SIGKILL");
      }
    }, gracePeriodMs);

    const onExit = (code: number | null, signal: string | null) => {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(forceKillTimer);
        console.log(
          `FFmpeg exited gracefully with code ${code}, signal ${signal}`
        );
        resolve();
      }
    };

    process.once("exit", onExit);

    process.kill("SIGTERM");
  });
}

export function cleanupRtpConsumers(room: Room) {
  room.rtpConsumersForFfmpeg.clear();
}

// is called as soon as the a new producer is registered.
export async function delayFfmpegRun(room: Room) {
  room.shouldDelayFfmpegCall = true;
  setTimeout(() => {
    room.shouldDelayFfmpegCall = false;
  }, 3000);
}

export function getRandomPort() {
  return Math.floor(Math.random() * (45000 - 1024)) + 1024;
}
