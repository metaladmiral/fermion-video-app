"use client";
import { useCallback, useEffect, useRef, useState } from "react";
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
    { id: string; kind: string; stream: MediaStream }[]
  >([]);
  const [allProducers, setAllProducers] = useState<
    { socketId: string; producerId: string; kind: string }[]
  >([]);

  const [isRecvTransportConnected, setIsRecvTransportConnected] =
    useState(false);

  useEffect(() => {
    const socket = io("http://localhost:3001", { path: "/ws" });
    socket.on("existingProducers", (producers) => {
      console.log(producers);
      setAllProducers(producers);
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
  const consumeProducer = async (
    producerId: string,
    kind: string,
    transport: any
  ) => {
    if (!socket || !device) return;

    socket.emit(
      "consume",
      {
        producerId,
        transportId: transport.id,
        rtpCapabilities: device.rtpCapabilities,
      },
      async (params: any) => {
        if (params.error) {
          console.log("Consume error: ", params.error);
          return;
        }
        const consumer = await transport.consume({
          id: params.id,
          producerId: params.producerId,
          kind: params.kind,
          rtpParameters: params.rtpParameters,
        });
        await consumer.resume();
        const stream = new MediaStream([consumer.track]);

        console.log("Consumer track ready?", consumer.track.readyState); // should be "live"
        console.log("Attaching stream to video...", stream);

        setRemoteStreams((prev) => [
          ...prev,
          { id: params.producerId, kind: params.kind, stream },
        ]);
      }
    );
  };

  const [recvTransport, setRecvTransport] = useState<any>(null);

  // useEffect(() => {
  //   console.log("First useEffect triggered:", {
  //     socket: !!socket,
  //     device: !!device,
  //     isRecvTransportConnected,
  //     allProducersLength: allProducers.length,
  //     recvTransport: !!recvTransport,
  //   });
  //   if (!socket || !device) return;
  //   if (isRecvTransportConnected) {
  //     allProducers.forEach(({ producerId, kind }) => {
  //       console.log("Consuming producer:", producerId, kind);
  //       consumeProducer(producerId, kind, recvTransport);
  //     });
  //   }
  // }, [
  //   socket,
  //   device,
  //   isRecvTransportConnected,
  //   consumeProducer,
  //   allProducers,
  //   recvTransport,
  // ]);

  // allProducers.forEach(({ producerId, kind }) => {
  //   console.log("Consuming producer:", producerId, kind);
  //   consumeProducer(producerId, kind, recvTransport);
  // });

  function shittyFxn() {
    console.log("assys");
    // allProducers.forEach(({ producerId, kind }) => {
    //       console.log("Consuming producer:", producerId, kind);
    //       consumeProducer(producerId, kind, recvTransportLocal);
    //     });
  }

  // Helper to sync existing producers after transport is connected
  async function syncWithRoom(recvTransport: any) {
    if (!socket || !device || !recvTransport) {
      console.log(" no socket or device or recv transport returning...");
      return;
    }

    socket.emit("getProducers", {}, (producers: any[]) => {
      console.log("Active producers received:", producers);
      producers.forEach(({ socketId, producerId, kind }: any) => {
        console.log("Consuming:", producerId, kind);
        consumeProducer(producerId, kind, recvTransport);
      });
    });
  }

  useEffect(() => {
    if (!socket || !device) return;

    // Create recvTransport
    console.log("create transport emit");
    socket.emit("createTransport", {}, (response: TransportResponse) => {
      if (response.param) {
        console.log("create recvTransport");
        const recvTransportLocal = device.createRecvTransport({
          id: response.param.id,
          iceParameters: response.param.iceParameters,
          iceCandidates: response.param.iceCandidates,
          dtlsParameters: response.param.dtlsParameters,
        });

        recvTransportLocal.on(
          "connect",
          ({ dtlsParameters }, callback, errback) => {
            console.log("connect transport emit");
            socket.emit(
              "connectTransport",
              {
                transportId: recvTransportLocal.id,
                dtlsParameters: dtlsParameters,
              },
              (response: any) => {
                if (response.success) {
                  callback();
                } else {
                  console.error("poop");
                  errback(new Error("Failed to connect recvTransport"));
                }
              }
            );
          }
        );

        // setRecvTransport(recvTransportLocal);
        // syncWithRoom(recvTransportLocal); // then consume

        // allProducers.forEach(({ producerId, kind }) => {
        //   console.log("Consuming producer:", producerId, kind);
        //   consumeProducer(producerId, kind, recvTransportLocal);
        // });
        socket.emit("getProducers", {}, (existingProducers: any[]) => {
          existingProducers.forEach(({ producerId, kind }) => {
            console.log("Consuming producer:", producerId, kind);
            consumeProducer(producerId, kind, recvTransportLocal);
          });
        });

        // Listen for new producers
        socket.on("newProducer", ({ producerId, kind }) => {
          consumeProducer(producerId, kind, recvTransportLocal);
        });
      }
    });
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
          {remoteStreams.map(({ id, kind, stream }) => {
            if (kind === "video") {
              return (
                <video
                  key={id}
                  playsInline
                  className="w-80 h-60 border"
                  ref={(el) => {
                    if (el) {
                      el.srcObject = stream;
                    }
                  }}
                />
              );
            } else {
              return (
                <audio
                  style={{ visibility: "visible" }}
                  key={id}
                  autoPlay
                  controls
                  className="w-80 h-20 border"
                  ref={(el) => {
                    if (el) {
                      el.srcObject = stream;
                    }
                  }}
                />
              );
            }
          })}
        </div>
      </div>
    </div>
  );
}
