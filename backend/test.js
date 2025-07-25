// test-socket.js
const { io } = require("socket.io-client");

const socket = io("ws://localhost:3001", { path: "/ws" });

socket.on("connect", () => {
  console.log("Connected:", socket.id);
});

socket.on("disconnect", () => {
  console.log("Disconnected");
});
