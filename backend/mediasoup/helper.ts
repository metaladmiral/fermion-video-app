import path from "path";
import { promises as fs } from "fs";
import { ChildProcess } from "child_process";

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
