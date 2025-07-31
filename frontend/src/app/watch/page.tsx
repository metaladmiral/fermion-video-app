"use client";
import { useEffect, useRef, useState } from "react";
import Hls, { MediaAttachingData } from "hls.js";

export default function WatchPage() {
  const video = useRef<HTMLVideoElement>(null);
  const [isVideoWorking, setIsVideoWorking] = useState<boolean>(true);
  //   const m3u8Source = "http://localhost:3001/hls/stream.m3u8";
  //   const m3u8Source = "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";
  useEffect(() => {
    const host = process.env.NEXT_PUBLIC_BACKEND_SERVER_URL || "localhost:3001";

    const m3u8Source = `${host}/hls/stream.m3u8`;

    const hlsSupported = Hls.isSupported();
    let hls: Hls;

    if (hlsSupported && video.current) {
      hls = new Hls();
      hls.loadSource(m3u8Source);
      hls.attachMedia(video.current);

      hls.on(Hls.Events.ERROR, function (event, data) {
        console.log(data);

        if (data.type == Hls.ErrorTypes.MEDIA_ERROR) {
          setIsVideoWorking(!isVideoWorking);
        } else {
          setIsVideoWorking(false);
        }
      });

      hls.on(Hls.Events.MANIFEST_PARSED, function (event, data) {
        console.log("parsed");
        setIsVideoWorking(true);
      });

      hls.on(Hls.Events.LEVEL_LOADED, function (event, data) {
        const isLive = data.details.live;
        if (!isLive) {
          console.log("Stream ended. Restarting HLS in 5 seconds...");

          hls.destroy();

          setTimeout(() => {
            setIsVideoWorking((prev) => !prev); // triggers re-run of useEffect
          }, 5000);
        }
      });

      return () => {
        hls.destroy();
      };
    } else if (video.current?.canPlayType("application/vnd.apple.mpegurl")) {
      video.current.src = m3u8Source;
    } else {
      alert("HLS not supported on this browser");
    }
  }, [isVideoWorking]);

  return (
    <>
      <br />
      Status:{" "}
      {isVideoWorking ? (
        <span style={{ color: "green" }}>LIVE</span>
      ) : (
        <span style={{ color: "red" }}>NOT LIVE</span>
      )}
      <br />
      <span>/watch route (watch live stream)</span>
      <br />
      <br />
      <video
        id="video"
        className="w-[350px] md:w-[520px] lg:w-[850px]"
        ref={video}
        autoPlay={true}
        controls
      ></video>
    </>
  );
}
