"use client";
import { useEffect, useRef, useState } from "react";
import Hls, { MediaAttachingData } from "hls.js";

export default function WatchPage() {
  const video = useRef<HTMLVideoElement>(null);
  const [isVideoWorking, setIsVideoWorking] = useState<boolean>(true);
  //   const m3u8Source = "http://localhost:3001/hls/stream.m3u8";
  //   const m3u8Source = "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";
  useEffect(() => {
    let host = "localhost";
    let port = "3001";
    if (typeof window !== "undefined") {
      host = window.location.host.split(":")[0];
    }

    const m3u8Source = `http://${host}:${port}/hls/stream.m3u8`;

    const hlsSupported = Hls.isSupported();

    if (hlsSupported && video.current) {
      const hls = new Hls();
      hls.loadSource(m3u8Source);
      hls.attachMedia(video.current);

      hls.on(Hls.Events.ERROR, function () {
        console.log();
        setIsVideoWorking(false);
      });

      setIsVideoWorking(true);
      //   hls.on(Hls.Events.)
    } else if (video.current?.canPlayType("application/vnd.apple.mpegurl")) {
      video.current.src = m3u8Source;
    } else {
      alert("HLS not supported on this browser");
    }
  }, [isVideoWorking]);

  return (
    <>
      <br />
      <span>/watch route (watch live stream)</span>
      <br />
      <br />
      <video
        id="video"
        className="w-[350px] md:w-[520px] lg:w-[850px]"
        ref={video}
        autoPlay
        controls
      ></video>
    </>
  );
}
