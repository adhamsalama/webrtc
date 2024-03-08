const http = require("http");
const fs = require("fs/promises");
const socketIO = require("socket.io");
const os = require("os");
const app = http
  .createServer(async (req, res) => {
    if (req.url?.endsWith(".html")) {
      const file = await fs.readFile("./index.html");
      return res.end(file);
    }
    if (req.url?.endsWith(".js")) {
      const file = await fs.readFile("./js/main.js");
      return res.end(file);
    }
    if (req.url?.endsWith(".mp4")) {
      const file = await fs.readFile("./sample-5s.mp4");
      return res.setHeader("Content-Type", "video/mp4").end(file);
    }
    return res.end();
  })
  .listen(8080);

const io = socketIO.listen(app);

io.sockets.on("connection", function (socket) {
  // convenience function to console.log server messages on the client
  socket.on("message", function (message) {
    console.log("Client said: ", message);
    // for a real app, would be room-only (not broadcast)
    socket.broadcast.emit("message", message);
  });

  socket.on("create or join", function (room) {
    console.log("Received request to create or join room " + room);
    const clientsInRoom = io.sockets.adapter.rooms[room];
    const numClients = clientsInRoom
      ? Object.keys(clientsInRoom.sockets).length
      : 0;
    console.log("Room " + room + " now has " + numClients + " client(s)");

    if (numClients === 0) {
      socket.join(room);
      console.log("Client ID " + socket.id + " created room " + room);
      socket.emit("created", room, socket.id);
    } else if (numClients === 1) {
      console.log("Client ID " + socket.id + " joined room " + room);
      io.sockets.in(room).emit("join", room);
      socket.join(room);
      socket.emit("joined", room, socket.id);
      io.sockets.in(room).emit("ready");
    } else {
      // max two clients
      socket.emit("full", room);
    }
  });

  socket.on("ipaddr", function () {
    const ifaces = os.networkInterfaces();
    for (const dev in ifaces) {
      ifaces[dev]?.forEach(function (details) {
        if (details.family === "IPv4" && details.address !== "127.0.0.1") {
          socket.emit("ipaddr", details.address);
        }
      });
    }
  });

  socket.on("bye", function () {
    console.log("received bye");
  });
});
