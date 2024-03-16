import http from "node:http";
import fs from "node:fs/promises";
import { Server } from "socket.io";

const app = http
  .createServer(async (req, res) => {
    if (req.url?.endsWith("/index.html")) {
      const file = await fs.readFile("./index.html");
      return res.end(file);
    }
    if (req.url?.endsWith("/js/main.js")) {
      const file = await fs.readFile("./js/main.js");
      return res.end(file);
    }
    if (req.url?.endsWith("/css/main.css")) {
      const file = await fs.readFile("./css/main.css");
      return res.setHeader("Content-Type", "text/css").end(file);
    }
    const file = await fs.readFile("./index.html");
    return res.end(file);
  })
  .listen(8080);
console.log("Listening on http://localhost:8080");
type Message =
  | RTCSessionDescriptionInit
  | RTCIceCandidateInit
  | CandidateMessage
  | "peerIsReady"
  | "bye";
type CandidateMessage = {
  type: "candidate";
  label: number;
  id: string;
  candidate: string;
};
const io = new Server(app);
io.sockets.on("connection", function (socket) {
  socket.on("message", function (message: Message) {
    console.log("Client said: ", message);
    socket.rooms.forEach((room) => {
      socket.to(room).emit("message", message);
    });
  });

  socket.on("createRoom", (room: string) => {
    socket.join(room);
    console.log("Client ID " + socket.id + " created room " + room);
    socket.emit("created", room, socket.id);
  });

  socket.on("joinRoom", (room: string) => {
    console.log("Client ID " + socket.id + " joined room " + room);
    io.sockets.in(room).emit("join", room);
    socket.join(room);
    socket.emit("joined", room, socket.id);
    io.sockets.in(room).emit("ready");
  });

  socket.on("bye", function () {
    console.log("received bye");
  });
});
