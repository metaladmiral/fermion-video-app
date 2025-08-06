"use client";
import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import * as mediasoupClient from "mediasoup-client";
import {
  TransportResponse,
  ExistingProducersList,
  SocketCallbackResponse,
  ConsumeSocketCallbackResponse,
  ProduceSocketCallbackResponse,
} from "../types";

export default function StreamPage() {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [device, setDevice] = useState<mediasoupClient.Device | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<
    Map<string, { kind: string; stream: MediaStream }>
  >(new Map());

  const producerMap = useRef<Map<string, mediasoupClient.types.Producer>>(
    new Map()
  );
  const consumerMap = useRef<Map<string, mediasoupClient.types.Consumer>>(
    new Map()
  );

  useEffect(() => {
    const socket = io(
      process.env.NEXT_PUBLIC_BACKEND_SERVER_URL || "http://localhost:3001",
      {
        path: "/ws",
      }
    );
    socket.on("removeProducerInClient", ({ producerId }) => {
      console.log("close Producer in client called: ", producerId);
      producerMap.current.get(producerId)?.close();
      producerMap.current.delete(producerId);
    });
    socket.on("removeConsumerInClient", ({ consumerId }) => {
      console.log("close Consumer in client called: ", consumerId);
      consumerMap.current.get(consumerId)?.close();
      consumerMap.current.delete(consumerId);
      setRemoteStreams((prev) => {
        const newMap = new Map(prev);
        newMap.delete(consumerId);
        return newMap;
      });
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

  useEffect(() => {
    if (!socket) {
      return;
    }

    const loadDevice = async () => {
      socket.emit(
        "getRtpCapabilities",
        async (capabilities: mediasoupClient.types.RtpCapabilities) => {
          const d = new mediasoupClient.Device();
          await d.load({ routerRtpCapabilities: capabilities });
          setDevice(d);
        }
      );
    };

    loadDevice();
  }, [socket]);

  // producer logic
  useEffect(() => {
    if (!socket || !device) return;

    socket.emit("createTransport", {}, (response: TransportResponse) => {
      if (response.param) {
        const sendTransport = device.createSendTransport({
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
              (response: { success: boolean }) => {
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
              (response: ProduceSocketCallbackResponse) => {
                if (response.error) {
                  errback(new Error(response.error));
                } else {
                  if (response.id) {
                    callback({ id: response.id });
                  }
                }
              }
            );
          }
        );

        navigator.mediaDevices
          .getUserMedia({ video: true, audio: true })
          .then(async (stream) => {
            const videoTrack = stream.getVideoTracks()[0];
            const audioTrack = stream.getAudioTracks()[0];

            // Produce video
            if (videoTrack) {
              try {
                const producer = await sendTransport.produce({
                  track: videoTrack,
                });
                producerMap.current.set(producer.id, producer);
                producer.on("transportclose", () => {
                  socket.emit("removeProducerInServer", {
                    producerId: producer.id,
                  });
                });
              } catch (err) {
                console.error(err);
              }
            }
            // Produce audio
            if (audioTrack) {
              try {
                const producer = await sendTransport.produce({
                  track: audioTrack,
                });
                producerMap.current.set(producer.id, producer);
                producer.on("transportclose", () => {
                  socket.emit("removeProducerInServer", {
                    producerId: producer.id,
                  });
                });
              } catch (err) {
                console.error(err);
              }
            }
          });
      } else {
        console.error("Transport error:", response.error);
      }
    });
  }, [socket, device]);

  // consumer logic
  const consumeProducer = async (
    producerId: string,
    kind: string,
    transport: mediasoupClient.types.Transport
  ) => {
    if (!socket || !device) return;

    socket.emit(
      "consume",
      {
        producerId,
        transportId: transport.id,
        rtpCapabilities: device.rtpCapabilities,
      },
      async (params: ConsumeSocketCallbackResponse) => {
        if (
          params.error ||
          !params.kind ||
          !params.rtpParameters ||
          !params.producerId ||
          !params.id
        ) {
          console.log("Consume error: ", params.error);
          return;
        }

        const consumerId = params.id;
        const producerId = params.producerId;
        const kind = params.kind;
        const rtpParameters = params.rtpParameters;

        const consumer = await transport.consume({
          id: consumerId,
          producerId: producerId,
          kind: kind,
          rtpParameters: rtpParameters,
        });

        consumerMap.current.set(consumer.id, consumer);
        consumer.on("transportclose", () => {
          socket.emit("removeConsumerInServer", { consumerId: consumer.id });
        });

        consumer.resume();
        const stream = new MediaStream([consumer.track]);
        setRemoteStreams((prev) => {
          const newMap = new Map(prev);
          newMap.set(consumer.id, {
            kind: kind,
            stream: stream,
          });
          return newMap;
        });
      }
    );
  };

  useEffect(() => {
    if (!socket || !device) return;

    // Create recvTransport
    socket.emit("createTransport", {}, async (response: TransportResponse) => {
      if (response.param) {
        const recvTransportLocal = device.createRecvTransport({
          id: response.param.id,
          iceParameters: response.param.iceParameters,
          iceCandidates: response.param.iceCandidates,
          dtlsParameters: response.param.dtlsParameters,
        });

        recvTransportLocal.on(
          "connect",
          ({ dtlsParameters }, callback, errback) => {
            socket.emit(
              "connectTransport",
              {
                transportId: recvTransportLocal.id,
                dtlsParameters: dtlsParameters,
              },
              (response: SocketCallbackResponse) => {
                if (response.success) {
                  callback();
                } else {
                  errback(new Error(response.error));
                }
              }
            );
          }
        );

        socket.on("newProducer", async ({ producerId, kind }) => {
          consumeProducer(producerId, kind, recvTransportLocal);
        });

        socket.emit(
          "getExistingProducers",
          {},
          async (existingProducers: ExistingProducersList[]) => {
            await new Promise((resolve) => setTimeout(resolve, 3500));
            existingProducers.forEach(({ producerId, kind }) => {
              consumeProducer(producerId, kind, recvTransportLocal);
            });
          }
        );
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
          {Array.from(remoteStreams).map(([consumerId, { kind, stream }]) => {
            if (kind === "video") {
              return (
                <video
                  key={consumerId}
                  playsInline
                  autoPlay
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
                  style={{ visibility: "hidden" }}
                  key={consumerId}
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
