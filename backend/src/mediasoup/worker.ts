import * as mediasoup from "mediasoup";

export async function createMediasoupWorker(): Promise<mediasoup.types.Worker> {
  const worker = await mediasoup.createWorker({
    rtcMinPort: 40000,
    rtcMaxPort: 49999,
  });

  worker.on("died", () => {
    console.error("Mediasoup worker died, exiting in 2 seconds...");
    setTimeout(() => process.exit(1), 2000);
  });

  console.log("Mediasoup worker started, PID:", worker.pid);
  return worker;
}
