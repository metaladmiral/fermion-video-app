import * as mediasoup from "mediasoup";

export async function createMediasoupWorker(
  retry: boolean = false
): Promise<mediasoup.types.Worker | null> {
  try {
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
  } catch (err) {
    console.error("Mediasoup worker creation failed", err);

    if (!retry) {
      console.error("Retrying in 5 seconds.........");
      await new Promise((res) => setTimeout(res, 5000));
      return await createMediasoupWorker(true);
    }
  }

  return null;
}
