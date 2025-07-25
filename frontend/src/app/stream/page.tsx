"use client";
import { use, useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import * as mediasoupClient from "mediasoup-client";

type TransportResponse = {
  param?: {
    id: string;
    iceParameters: any;
    iceCandidates: any;
    dtlsParameters: any;
  };
  error?: string;
};

export default function StreamPage() {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [device, setDevice] = useState<mediasoupClient.Device | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<
    { id: string; stream: MediaStream }[]
  >([]);
  const [allProducers, setAllProducers] = useState<
    { socketId: string; producerId: string; kind: string }[]
  >([]);
  useEffect(() => {
    const socket = io("http://localhost:3001", { path: "/ws" });
    socket.on("existingProducers", (producers) => {
      console.log(producers);
      setAllProducers(producers);
    });

    socket.on("connect", () => {
      console.log("Connected to WebSocket server: ", socket.id);
    });

    setSocket(socket);

    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      });

    return () => {
      socket.disconnect();
    };
  }, []);

  // producer logic
  useEffect(() => {
    if (!socket) {
      return;
    }

    console.log("running loadDevice");

    const loadDevice = async () => {
      socket.emit("getRtpCapabilities", async (capabilities: any) => {
        const d = new mediasoupClient.Device();
        await d.load({ routerRtpCapabilities: capabilities });
        setDevice(d);

        socket.emit("createTransport", {}, (response: TransportResponse) => {
          if (response.param) {
            const sendTransport = d.createSendTransport({
              id: response.param.id,
              iceParameters: response.param.iceParameters,
              iceCandidates: response.param.iceCandidates,
              dtlsParameters: response.param.dtlsParameters,
            });

            sendTransport.on(
              "connect",
              async ({ dtlsParameters }, callback, errback) => {
                socket.emit(
                  "connectTransport",
                  { transportId: sendTransport.id, dtlsParameters },
                  (response: any) => {
                    if (response.success) {
                      callback();
                    } else {
                      errback(new Error("Failed to connect transport"));
                    }
                  }
                );
              }
            );

            sendTransport.on(
              "produce",
              ({ kind, rtpParameters }, callback, errback) => {
                socket.emit(
                  "produce",
                  { transportId: sendTransport.id, kind, rtpParameters },
                  (response: any) => {
                    if (response.error) {
                      errback(response.error);
                    } else {
                      callback({ id: response.id });
                    }
                  }
                );
              }
            );

            navigator.mediaDevices
              .getUserMedia({ video: true, audio: true })
              .then((stream) => {
                const videoTrack = stream.getVideoTracks()[0];
                const audioTrack = stream.getAudioTracks()[0];

                // Produce video
                if (videoTrack) {
                  sendTransport.produce({ track: videoTrack });
                }
                // Produce audio
                if (audioTrack) {
                  sendTransport.produce({ track: audioTrack });
                }
              });
          } else {
            console.error("Transport error:", response.error);
          }
        });
      });
    };

    loadDevice();
  }, [socket]);

  // consumer logic
  async function consumeProducer(
    producerId: string,
    kind: string,
    transport: any,
    transportId: string
  ) {
    if (!socket || !device) return;

    socket.emit(
      "consume",
      {
        producerId,
        transportId: transportId,
        rtpCapabilities: device.rtpCapabilities,
      },
      async (params: any) => {
        if (params.error) return;
        const consumer = await transport.consume({
          id: params.id,
          producerId: params.producerId,
          kind: params.kind,
          rtpParameters: params.rtpParameters,
        });
        await consumer.resume();
        const stream = new MediaStream([consumer.track]);
        setRemoteStreams((prev) => [
          ...prev,
          { id: params.producerId, stream },
        ]);
      }
    );
  }
  // useEffect(() => {
  //   if (!socket || !device) return;

  // Create recvTransport
  // function createRecvTransport(
  //   socket: Socket,
  //   device: mediasoupClient.Device,
  //   producerId: string,
  //   kind: any
  // ) {

  // }
  let recvTransport: any = useRef(null);
  let transportId: any = useRef("");

  useEffect(() => {
    if (socket && device) {
      socket.emit("createTransport", {}, (response: TransportResponse) => {
        if (response.param) {
          recvTransport.current = device.createRecvTransport({
            id: response.param.id,
            iceParameters: response.param.iceParameters,
            iceCandidates: response.param.iceCandidates,
            dtlsParameters: response.param.dtlsParameters,
          });

          transportId.current = recvTransport.current.id;

          recvTransport.current.on(
            "connect",
            ({ dtlsParameters }, callback, errback) => {
              socket.emit(
                "connectTransport",
                { transportId: transportId.current, dtlsParameters },
                (response: any) => {
                  if (response.success) {
                    callback();
                  } else {
                    errback(new Error("Failed to connect recvTransport"));
                  }
                }
              );
            }
          );
        }
      });

      allProducers.forEach(({ socketId, producerId, kind }) => {
        console.log("Consuming producer:", producerId, kind);
        consumeProducer(
          producerId,
          kind,
          recvTransport.current,
          transportId.current
        );
      });
      socket.on("newProducer", ({ producerId, kind }) => {
        console.log("New producer:", producerId, kind);
        consumeProducer(
          producerId,
          kind,
          recvTransport.current,
          transportId.current
        );
      });
    }
  }, [socket, device]);

  return (
    <div className="p-4">
      <h1 className="text-xl mb-4">/stream</h1>
      <div className="flex gap-4">
        <div>
          <h2 className="text-sm">My Camera</h2>
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            className="w-80 h-60 border"
          />
        </div>
        <div>
          <h2 className="text-sm">Remote Camera</h2>
          {remoteStreams.map(({ id, stream }) => (
            <video
              key={id}
              autoPlay
              playsInline
              className="w-80 h-60 border"
              ref={(el) => {
                if (el) {
                  el.srcObject = stream;
                }
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
