"use strict";

let localPeerConnection: RTCPeerConnection;
let localStream: MediaStream;
let remoteStream: MediaStream;

let isChannelReady = false;
let isInitiator = false;
let isStarted = false;

let mySocketId: string | null;
let room = "";

const pcConfig = {
  iceServers: [
    {
      urls: "stun:stun.l.google.com:19302",
    },
  ],
};
const constraints = {
  video: true,
};
const sdpConstraints = {
  offerToReceiveAudio: true,
  offerToReceiveVideo: true,
};
const localVideo = document.querySelector("#localVideo") as HTMLVideoElement;
const remoteVideo = document.querySelector("#remoteVideo") as HTMLVideoElement;
const startButton = document.getElementById("startButton") as HTMLButtonElement;
const callButton = document.getElementById("callButton") as HTMLButtonElement;
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
function createPeerConnection() {
  try {
    localPeerConnection = new RTCPeerConnection();
    localPeerConnection.onicecandidate = handleIceCandidate;
    localPeerConnection.ontrack = (event) => {
      console.log("ontrack", event);
      remoteVideo.srcObject = event.streams[0];
    };
    // @ts-expect-error
    localPeerConnection.onremovestream = (event) => {
      console.log("onremovestream", event);
    };
    console.log("Created RTCPeerConnnection");
  } catch (e: any) {
    console.log("Failed to create PeerConnection, exception: " + e.message);
    alert("Cannot create RTCPeerConnection object.");
    return;
  }
}
function handleIceCandidate(event: RTCPeerConnectionIceEvent) {
  console.log("icecandidate event: ", event);
  if (event.candidate) {
    sendMessage({
      type: "candidate",
      label: event.candidate.sdpMLineIndex!,
      id: event.candidate.sdpMid!,
      candidate: event.candidate.candidate,
    });
  } else {
    console.log("End of candidates.");
  }
}
function setUpLocalPeer() {
  console.log(">>>>>>> maybeStart() ", { isStarted }, { isChannelReady });
  if (!isStarted && typeof localStream !== "undefined" && isChannelReady) {
    console.log(">>>>>> creating peer connection");
    createPeerConnection();
    localStream.getTracks().forEach((track) => {
      localPeerConnection.addTrack(track, localStream);
    });
    isStarted = true;
  }
}

function setLocalDescriptionAndSendItToPeer(
  sessionDescription: RTCSessionDescriptionInit
) {}
// @ts-ignore
const socket = io.connect();
socket.on("connect", () => {
  document.querySelector("#socketId")!.innerHTML = Math.random()
    .toString(36)
    .substring(7);
});

startButton.onclick = async () => {
  room =
    prompt("Enter room name:", "") || Math.random().toString(36).substring(7);
  socket.emit("createRoom", room);
  localStream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: true,
  });
  localVideo.srcObject = localStream;
};
callButton.onclick = async () => {
  room = prompt("Enter room name:") ?? "";
  socket.emit("joinRoom", room);
  localStream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: true,
  });
  localVideo.srcObject = localStream;
  sendMessage("peerIsReady");
};
socket.on("created", function (room: string) {
  console.log("Created room " + room);
  isInitiator = true;
});

socket.on("join", function (room: string) {
  console.log("Another peer made a request to join room " + room);
  console.log("This peer is the initiator of room " + room + "!");
  isChannelReady = true;
});

socket.on("joined", function (room: string) {
  console.log("joined: " + room);
  isChannelReady = true;
});

// This client receives a message
socket.on("message", async function (message: Message) {
  console.log("Client received message:", message);
  if (message === "peerIsReady") {
    console.log("message=got user media, calling maybeStart()");
    setUpLocalPeer();
    if (isInitiator) {
      console.log("Sending offer to peer");
      const sessionDescription = await localPeerConnection.createOffer();
      localPeerConnection.setLocalDescription(sessionDescription);
      sendMessage(sessionDescription);
    }
  } else if ((message as RTCSessionDescription).type === "offer") {
    if (!isInitiator && !isStarted) {
      console.log("message=offer, calling setUpLocalPeer()");
      setUpLocalPeer();
    }
    localPeerConnection.setRemoteDescription(
      new RTCSessionDescription(message as RTCSessionDescriptionInit)
    );
    console.log("Sending answer to peer.");
    const sessionDescription = await localPeerConnection.createAnswer();
    localPeerConnection.setLocalDescription(sessionDescription);
    sendMessage(sessionDescription);
  } else if (
    (message as RTCSessionDescription).type === "answer" &&
    isStarted
  ) {
    console.log("message=answer, calling setRemoteDescription");
    localPeerConnection.setRemoteDescription(
      new RTCSessionDescription(message as RTCSessionDescriptionInit)
    );
  } else if ((message as CandidateMessage).type === "candidate" && isStarted) {
    console.log("message=candidate, calling addIceCandidate");
    let candidate = new RTCIceCandidate({
      sdpMLineIndex: (message as CandidateMessage).label,
      candidate: (message as CandidateMessage).candidate,
    });
    localPeerConnection.addIceCandidate(candidate);
  } else if (message === "bye" && isStarted) {
    handleRemoteHangup();
  }
});

////////////////////////////////////////////////

function sendMessage(message: Message) {
  console.log("Client sending message: ", message);
  socket.emit("message", message);
}
window.onbeforeunload = function () {
  sendMessage("bye");
};
function hangup() {
  console.log("Hanging up.");
  stopRTC();
  sendMessage("bye");
}

function handleRemoteHangup() {
  console.log("Session terminated.");
  stopRTC();
  isInitiator = false;
}

function stopRTC() {
  isStarted = false;
  localPeerConnection.close();
}
