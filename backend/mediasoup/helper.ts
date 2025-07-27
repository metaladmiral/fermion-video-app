import path from "path";
import { promises as fs } from "fs";

export async function generateSdp({
  audioPort,
  videoPort,
}: {
  audioPort: number;
  videoPort: number;
}) {
  // Generate a proper SDP with correct formatting
  const sdp = [
    "v=0",
    "o=- 0 0 IN IP4 127.0.0.1",
    "s=Mediasoup Stream",
    "t=0 0",
    "c=IN IP4 127.0.0.1",
    "",
    `m=audio ${audioPort} RTP/AVP 111`,
    "a=rtpmap:111 opus/48000/2",
    "a=fmtp:111 minptime=10;useinbandfec=1",
    "",
    `m=video ${videoPort} RTP/AVP 96`,
    "a=rtpmap:96 VP8/90000",
    "",
  ].join("\r\n");

  const sdpPath = path.join(__dirname, "stream.sdp");
  await fs.writeFile(sdpPath, sdp);
  return sdpPath;
}
