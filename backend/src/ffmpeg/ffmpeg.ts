import { spawn } from "child_process";
import path from "path";
import { promises as fs } from "fs";
import { gracefulProcessKill, ChildProcessController } from "../helper";

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

  const ffmpegProcess = spawn("ffmpeg", args);

  ffmpegProcess.stdout.on("data", async (data) => {
    await fs.appendFile(path.join(__dirname, "../../logs/ffmpeg.logs"), data);
  });

  ffmpegProcess.stderr.on("data", async (data) => {
    await fs.appendFile(path.join(__dirname, "../../logs/ffmpeg.logs"), data);
  });

  ffmpegProcess.on("exit", async (code) => {
    console.log(`FFmpeg exited with code ${code}`);
  });

  const childProcessControllerInstance = new ChildProcessController(
    ffmpegProcess
  );
  return Promise.resolve(childProcessControllerInstance);
}
