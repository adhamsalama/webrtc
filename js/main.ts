"use strict";
type Peer = {
  userId: string;
  pc: RTCPeerConnection;
  dc?: RTCDataChannel;
  streams: Set<MediaStream>;
};
let peers: Peer[] = [];
//let dataChannels: RTCDataChannel[];
let localStream: MediaStream;
let remoteStream: MediaStream;
let localCatpureStream: MediaStream;
let remoteStreams: MediaStream[] = [];
let userIds: Set<string> = new Set();
const displayMediaOptions = {
  video: {
    displaySurface: "browser",
  },
  audio: {
    suppressLocalAudioPlayback: false,
  },
  preferCurrentTab: false,
  selfBrowserSurface: "exclude",
  systemAudio: "include",
  surfaceSwitching: "include",
  monitorTypeSurfaces: "include",
};

let isStarted = false;
let id = Math.random().toString(16).slice(2);
(document.querySelector("#id") as HTMLHeadElement).innerText = id;

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
//const remoteVideo = document.querySelector("#remoteVideo") as HTMLVideoElement;
const remoteVideoContainer = document.querySelector(
  "#remoteVideoContainer"
) as HTMLDivElement;
const roomName = document.getElementById("room") as HTMLHeadingElement;
const localScreenShare = document.querySelector(
  "#localScreen"
) as HTMLVideoElement;
const remoteScreenShare = document.querySelector(
  "#remoteScreen"
) as HTMLVideoElement;
const startButton = document.getElementById("startButton") as HTMLButtonElement;
const callButton = document.getElementById("callButton") as HTMLButtonElement;
const hangupButton = document.getElementById(
  "hangupButton"
) as HTMLButtonElement;
const toggleLocalVideoButton = document.getElementById(
  "toggleLocalVideo"
) as HTMLButtonElement;
const toggleLocalAudioButton = document.getElementById(
  "toggleLocalAudio"
) as HTMLButtonElement;
const toggleLocalScreenButton = document.getElementById(
  "toggleLocalScreen"
) as HTMLButtonElement;
const messages = document.getElementById("messages") as HTMLUListElement;
const newMessage = document.getElementById("newMessage") as HTMLInputElement;
const sendMessageButton = document.getElementById(
  "sendMessage"
) as HTMLButtonElement;
let localScreenCaptureEnabled = false;
toggleLocalScreenButton.onclick = async () => {
  await startCapture(displayMediaOptions);
  localScreenCaptureEnabled = true;
  peers = peers.map((p) => setUpLocalPeer(p.userId)!);
  peers.forEach(async (peer) => {
    const dataChannel = peer.pc.createDataChannel("dataChannel", {});
    peer.dc = dataChannel;
    peer.dc.onmessage = (message: MessageEvent<string>) => {
      displayNewMessage(JSON.parse(message.data) as DataChannelMessage);
    };
    const offerSessionDescription = await peer.pc.createOffer();
    await peer.pc.setLocalDescription(offerSessionDescription);
    console.log("Sending offer to peer");
    sendMessage(offerSessionDescription, peer.userId);
  });
};
type DataChannelMessage = { userId: string; data: string };
type OutboundMessage =
  | RTCSessionDescriptionInit
  | RTCIceCandidateInit
  | CandidateMessage
  | "peerIsReady"
  | "bye";
type InboundMessage = {
  room: string;
  userId: string;
  toUserId?: string;
  message: OutboundMessage;
};

type CandidateMessage = {
  type: "candidate";
  label: number;
  id: string;
  candidate: string;
};
function createPeerConnection(userId: string): Peer | undefined {
  try {
    const localPeerConnection = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    const peer: Peer = { userId, pc: localPeerConnection, streams: new Set() };
    localPeerConnection.onicecandidate = (event) => {
      console.log("icecandidate event: ", event);
      if (event.candidate) {
        sendMessage(
          {
            type: "candidate",
            label: event.candidate.sdpMLineIndex!,
            id: event.candidate.sdpMid!,
            candidate: event.candidate.candidate,
          },
          peer.userId
        );
      } else {
        console.log("End of candidates.");
      }
    };

    localPeerConnection.ontrack = (event) => {
      for (const stream of event.streams) {
        peer.streams.add(stream);
        const userDiv = createOrGetUserDiv(peer.userId);
        const videoId = `${peer.userId}-${stream.id}`;
        let video = document.getElementById(videoId) as HTMLVideoElement | null;
        if (!video) {
          video = document.createElement("video");
          video.autoplay = true;
          video.playsInline = true;
        }
        video.id = videoId;
        video.srcObject = event.streams[0];
        userDiv.appendChild(video);
        remoteVideoContainer.appendChild(userDiv);
      }
    };
    console.log("Created RTCPeerConnnection");
    return peer;
  } catch (e: any) {
    console.log("Failed to create PeerConnection, exception: " + e.message);
    alert("Cannot create RTCPeerConnection object.");
    return;
  }
}

function setUpLocalPeer(userId: string): Peer | undefined {
  console.log(">>>>>>> setting up local peer", { isStarted });
  console.log(">>>>>> creating peer connection");
  const peer = createPeerConnection(userId);
  if (!peer) {
    alert(`Failed to create PeerConnection in setUpLocalPeer`);
    return;
  }
  localStream.getTracks().forEach((track) => {
    peer.pc.addTrack(track, localStream);
  });
  if (localCatpureStream) {
    localCatpureStream.getTracks().forEach((track) => {
      peer.pc.addTrack(track, localCatpureStream);
    });
  }
  isStarted = true;
  return peer;
}
navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
  localVideo.srcObject = stream;
  localStream = stream;
});

async function startCapture(displayMediaOptions: any) {
  let captureStream: MediaStream | null = null;

  try {
    captureStream = await navigator.mediaDevices.getDisplayMedia(
      displayMediaOptions
    );
    localScreenShare.srcObject = captureStream;
    localCatpureStream = captureStream;
  } catch (err) {
    console.error(`Error: ${err}`);
  }

  return captureStream;
}

// @ts-ignore
const socket = io.connect();

startButton.onclick = async () => {
  const promptedRoom = prompt("Enter room name:");
  if (!promptedRoom) {
    return;
  }
  // await startCapture(displayMediaOptions);

  room = promptedRoom;
  roomName.innerText = room;
  socket.emit("createRoom", room);
};
callButton.onclick = async () => {
  room = prompt("Enter room name:") ?? "";
  roomName.innerText = room;
  // await startCapture(displayMediaOptions);
  socket.emit("joinRoom", room);
  sendMessage("peerIsReady");
};

hangupButton.onclick = () => {
  hangup();
};

toggleLocalVideoButton.onclick = () => {
  const localTracks = localStream.getTracks();
  const videoTrack = localTracks.find((track) => track.kind === "video");
  if (!videoTrack) {
    return;
  }
  if (videoTrack.enabled) {
    videoTrack.enabled = false;
    toggleLocalVideoButton.innerText = "Resume Video";
  } else {
    videoTrack.enabled = true;
    toggleLocalVideoButton.innerText = "Puase Video";
  }
};

toggleLocalAudioButton.onclick = () => {
  const localTracks = localStream.getTracks();
  const audioTrack = localTracks.find((track) => track.kind === "audio");
  if (!audioTrack) {
    return;
  }
  if (audioTrack.enabled) {
    audioTrack.enabled = false;
    toggleLocalAudioButton.innerText = "Resume Audio";
  } else {
    audioTrack.enabled = true;
    toggleLocalAudioButton.innerText = "Pause Audio";
  }
};
sendMessageButton.onclick = () => {
  const message = newMessage.value;
  peers.forEach((peer) =>
    peer.dc?.send(
      JSON.stringify({ userId: id, data: message } as DataChannelMessage)
    )
  );
  newMessage.value = "";
  displayNewMessage({ userId: id, data: message }, "right");
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
function displayNewMessage(
  message: { userId: string; data: string },
  alignment: "left" | "right" = "left"
) {
  const newMessageElement = document.createElement("li");
  newMessageElement.style.textAlign = alignment;
  newMessageElement.innerHTML = `${message.userId} ${
    message.userId == id ? "(Me)" : ""
  }: ${message.data}`;
  messages.appendChild(newMessageElement);
  const hr = document.createElement("hr");
  messages.appendChild(hr);
}
function addPeer(peer: Peer): Peer {
  const existingPeerIndex = peers.findIndex((p) => p.userId == peer.userId);
  if (existingPeerIndex > -1) {
    peers[existingPeerIndex].pc.close();
    console.log(`^^^Replacing peer`, peers[existingPeerIndex], "with", peer);
    peers[existingPeerIndex] = peer;
  } else {
    peers.push(peer);
  }
  return peer;
}
let globalDC: RTCDataChannel;
// This client receives a message
socket.on("message", async function (message: InboundMessage) {
  console.log("Client received message:", message);
  // ? sent by peer after clicking call and getting user media
  if (message.message === "peerIsReady") {
    console.log(`***Peer ${message.userId} is ready`);
    let peer = setUpLocalPeer(message.userId);
    if (!peer) {
      return;
    }
    const dataChannel = peer.pc.createDataChannel("dataChannel", {});
    peer.dc = dataChannel;
    peer = addPeer(peer);
    const offerSessionDescription = await peer.pc.createOffer();
    await peer.pc.setLocalDescription(offerSessionDescription);
    console.log(`***Sending offer to peer ${message.userId}`);
    sendMessage(offerSessionDescription, peer.userId);
    dataChannel.onopen = (event) => {
      console.log("dataChannel onopen", { event });
    };
    dataChannel.onmessage = (event) => {
      console.log("dataChannel onmessage", event);
      displayNewMessage(JSON.parse(event.data) as DataChannelMessage);
    };
    dataChannel.onerror = (event) => {
      console.log("dataChannel onerror", event);
    };
  } else if (
    (message.message as RTCSessionDescription & { toUserId: string }).type ===
    "offer"
  ) {
    if (message.toUserId !== id) {
      console.log(`*** Offer not mean for me`);
      return;
    }
    console.log(`***Got offer from peer ${message.userId}`);
    let peer = setUpLocalPeer(message.userId);
    if (!peer) {
      alert("No peer for incoming offer");
      return;
    }
    peer = addPeer(peer);
    peer.pc.ondatachannel = (event) => {
      const dc = event.channel;
      dc.onopen = (event) => {
        console.log("^^^dataChannel onopen", { event });
      };
      dc.onmessage = (event: MessageEvent<string>) => {
        console.log("dataChannel onmessage", event);
        displayNewMessage(JSON.parse(event.data) as DataChannelMessage);
      };
      dc.onerror = (event) => {
        console.log("dataChannel onerror", event);
      };
      peers.find((p) => p.userId == message.userId)!.dc = dc;
      //peer.dc = dc;
    };

    await peer.pc.setRemoteDescription(
      new RTCSessionDescription(message.message as RTCSessionDescriptionInit)
    );
    console.log(`***Sending answer to peer ${message.userId}`);

    const answerSessionDescription = await peer.pc.createAnswer();
    await peer.pc.setLocalDescription(answerSessionDescription);
    sendMessage(answerSessionDescription, peer.userId);
  } else if (
    (message.message as RTCSessionDescription & { toUserId: string }).type ===
      "answer" &&
    isStarted
  ) {
    if (message.toUserId !== id) {
      console.log(`*** Answer not meant for me`);
      return;
    }
    console.log(`***Got answer from peer ${message.userId}`);
    const peer = peers.find((peer) => peer.userId === message.userId);
    if (!peer) {
      alert("couldn't find peer");
      return;
    }
    await peer.pc.setRemoteDescription(
      new RTCSessionDescription(message.message as RTCSessionDescriptionInit)
    );
  } else if (
    (message.message as CandidateMessage).type === "candidate" &&
    isStarted
  ) {
    const candidate = new RTCIceCandidate({
      sdpMLineIndex: (message.message as CandidateMessage).label,
      candidate: (message.message as CandidateMessage).candidate,
    });
    if (message.toUserId !== id) {
      return;
    }
    const peer = peers.find((peer) => peer.userId === message.userId);
    if (!peer) {
      alert("Peer not found");
      return;
    }
    console.log("Adding candidate");
    peer.pc.addIceCandidate(candidate);
  } else if (message.message === "bye" && isStarted) {
    handleRemoteHangup(message.userId);
  }
});

function sendMessage(message: OutboundMessage, toUserId?: string) {
  console.log("Client sending message: ", message);
  const msg: InboundMessage = {
    room,
    userId: id,
    message,
    toUserId,
  };
  socket.emit("message", msg);
}
window.onbeforeunload = function () {
  sendMessage("bye");
};
function hangup() {
  console.log("Hanging up.");
  peers.forEach((p) => p.pc.close());
  peers = [];
  remoteVideoContainer.innerHTML = "<h2>Remote Videos</h2>";
  sendMessage("bye");
}

function handleRemoteHangup(userId: string) {
  document.getElementById(userId)?.remove();
  stopRemoteRTC(userId);
}

function stopRemoteRTC(userId: string) {
  isStarted = false;
  const peerIndex = peers.findIndex((p) => (p.userId = userId));
  if (peerIndex == -1) {
    return;
  }
  peers[peerIndex].pc.close();
  peers.splice(peerIndex, 1);
}

function createOrGetUserDiv(id: string): HTMLDivElement {
  const existingDiv = document.getElementById(id) as HTMLDivElement | null;
  if (existingDiv) {
    return existingDiv;
  }
  const div = document.createElement("div");
  div.id = id;
  const header = document.createElement("h2");
  header.innerText = `User ${id}`;
  div.appendChild(header);
  return div;
}
