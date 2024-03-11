"use strict";

let localPeerConnection: RTCPeerConnection;
let localStream: MediaStream;
let remoteStream: MediaStream;

let isStarted = false;

let room = "";

const constraints: MediaStreamConstraints = {
  video: true,
  audio: true,
};
const sdpConstraints = {
  offerToReceiveAudio: true,
  offerToReceiveVideo: true,
};
const localVideo = document.querySelector("#localVideo") as HTMLVideoElement;
const remoteVideo = document.querySelector("#remoteVideo") as HTMLVideoElement;
const startButton = document.getElementById("startButton") as HTMLButtonElement;
const callButton = document.getElementById("callButton") as HTMLButtonElement;
const hangupButton = document.getElementById(
  "hangupButton"
) as HTMLButtonElement;

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
    localPeerConnection.onicecandidate = (event) => {
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
    };
    localPeerConnection.ontrack = (event) => {
      console.log("ontrack", event);
      remoteVideo.srcObject = event.streams[0];
      event.streams.forEach((stream) => {
        stream.onremovetrack = () => {
          alert("onremovetrack");
          console.log("onremovetrack", event);
        };
      });
    };
    console.log("Created RTCPeerConnnection");
  } catch (e: any) {
    console.log("Failed to create PeerConnection, exception: " + e.message);
    alert("Cannot create RTCPeerConnection object.");
    return;
  }
}
function setUpLocalPeer() {
  console.log(">>>>>>> setting up local peer", { isStarted });
  if (!isStarted) {
    console.log(">>>>>> creating peer connection");
    createPeerConnection();
    localStream.getTracks().forEach((track) => {
      console.log({ track });

      localPeerConnection.addTrack(track, localStream);
    });
    isStarted = true;
  }
}

// @ts-ignore
const socket = io.connect();

startButton.onclick = async () => {
  const promptedRoom = prompt("Enter room name:");
  if (!promptedRoom) {
    return;
  }
  room = promptedRoom;
  socket.emit("createRoom", room);
  localStream = await navigator.mediaDevices.getUserMedia(constraints);
  localVideo.srcObject = localStream;
};
callButton.onclick = async () => {
  room = prompt("Enter room name:") ?? "";
  socket.emit("joinRoom", room);
  localStream = await navigator.mediaDevices.getUserMedia(constraints);
  localVideo.srcObject = localStream;
  sendMessage("peerIsReady");
};

hangupButton.onclick = () => {
  hangup();
};
socket.on("created", function (room: string) {
  console.log("Created room " + room);
});

socket.on("join", function (room: string) {
  console.log("Another peer made a request to join room " + room);
  console.log("This peer is the initiator of room " + room + "!");
});

socket.on("joined", function (room: string) {
  console.log("joined: " + room);
});

// This client receives a message
socket.on("message", async function (message: Message) {
  console.log("Client received message:", message);
  // ? sent by peer after clickign call and getting user media
  if (message === "peerIsReady") {
    console.log("message=got user media, calling maybeStart()");
    setUpLocalPeer();
    const offerSessionDescription = await localPeerConnection.createOffer();
    localPeerConnection.setLocalDescription(offerSessionDescription);
    console.log("Sending offer to peer");
    sendMessage(offerSessionDescription);
  } else if ((message as RTCSessionDescription).type === "offer") {
    if (!isStarted) {
      console.log("Got offer");
      setUpLocalPeer();
    }
    localPeerConnection.setRemoteDescription(
      new RTCSessionDescription(message as RTCSessionDescriptionInit)
    );
    console.log("Sending answer to peer.");
    const answerSessionDescription = await localPeerConnection.createAnswer();
    localPeerConnection.setLocalDescription(answerSessionDescription);
    sendMessage(answerSessionDescription);
  } else if (
    (message as RTCSessionDescription).type === "answer" &&
    isStarted
  ) {
    console.log("Got answer from peer, setting it as remote description");
    localPeerConnection.setRemoteDescription(
      new RTCSessionDescription(message as RTCSessionDescriptionInit)
    );
  } else if ((message as CandidateMessage).type === "candidate" && isStarted) {
    console.log("Got ICE candidate from peer, adding it to local peer");
    const candidate = new RTCIceCandidate({
      sdpMLineIndex: (message as CandidateMessage).label,
      candidate: (message as CandidateMessage).candidate,
    });
    localPeerConnection.addIceCandidate(candidate);
  } else if (message === "bye" && isStarted) {
    handleRemoteHangup();
  }
});

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
}

function stopRTC() {
  isStarted = false;
  localPeerConnection.close();
}
