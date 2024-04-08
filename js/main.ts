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
let userIds: string[] = [];
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
  localCatpureStream.getTracks().forEach((track) => {
    console.log(`adding track ${track.label} to peer connection`);
    try {
      peers.forEach((peer) => peer.pc.addTrack(track, localCatpureStream));
    } catch (err) {
      console.error(`Error adding capture track: ${err}`);
    }
  });
  peers.forEach(async (peer) => {
    const dataChannel = peer.pc.createDataChannel("dataChannel", {});
    peer.dc = dataChannel;
    peer.dc.onmessage = (message: MessageEvent<string>) => {
      displayNewMessage(message.data);
    };
    const offerSessionDescription = await peer.pc.createOffer();
    await peer.pc.setLocalDescription(offerSessionDescription);
    console.log("Sending offer to peer");
    sendMessage(offerSessionDescription);
  });
  /*
  peers.forEach(async (peer) => {
    peer.pc.close();
    const dataChannel = peer.pc.createDataChannel("dataChannel", {});
    peer.dc = dataChannel;
    const offerSessionDescription = await peer.pc.createOffer();
    await peer.pc.setLocalDescription(offerSessionDescription);
    console.log("Sending offer to peer");
    sendMessage(offerSessionDescription);
  });
  */
};
type DataChannelMessage =
  | string
  | { type: string; data: { type: string; streamId: string } };
type OutboundMessage =
  | RTCSessionDescriptionInit
  | RTCIceCandidateInit
  | CandidateMessage
  | "peerIsReady"
  | "bye";
type InboundMessage = {
  room: string;
  userId: string;
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
      for (const stream of event.streams) {
        peer.streams.add(stream);
      }
      console.log("ontrack", event);
      if (!remoteStream) {
        remoteStream = event.streams[0];
        const video = createRemoteVideoElement(userId);
        video!.srcObject = event.streams[0];
        // remoteVideo.srcObject = event.streams[0];
        console.log("track label", event.track.label);
        event.streams.forEach((stream) => {
          stream.onremovetrack = () => {
            console.log("onremovetrack", event);
          };
        });
      }
      event.streams.forEach((stream) => {
        const streamExists = remoteStreams.some(
          (remoteStream) => remoteStream.id === stream.id
        );
        if (!streamExists) {
          remoteStreams.push(stream);
        }
      });
      // ! Needs update
      if (remoteStreams.length > 1) {
        remoteScreenShare.srcObject = remoteStreams[1];
      }
      /* localPeerConnection.ondatachannel = (event) => {
        console.log("^^^qqqqqqqqqqqq before", { peer, peers });
        event.channel.send("oi mate");
        peer.dc = event.channel;
        console.log("^^^qqqqqqqqq after", { peer, peers });
        peer.dc.onmessage = (message: MessageEvent<string>) => {
          displayNewMessage(message.data);
        };
      };
      */
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
  if (true) {
    console.log(">>>>>> creating peer connection");
    const peer = createPeerConnection(userId);
    if (!peer) {
      alert(`Failed to create PeerConnection in setUpLocalPeer`);
      return;
    }
    localStream.getTracks().forEach((track) => {
      peer.pc.addTrack(track, localStream);
      // localPeerConnections.forEach((pc) => pc.addTrack(track, localStream));
    });
    isStarted = true;
    return peer;
  }
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
  peers.forEach((peer) => peer.dc?.send(message));
  newMessage.value = "";
  displayNewMessage(`Me: ${message}`, "right");
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
  message: string,
  alignment: "left" | "right" = "left"
) {
  const newMessageElement = document.createElement("li");
  newMessageElement.style.textAlign = alignment;
  newMessageElement.innerHTML = message;
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
    let peer = setUpLocalPeer(message.userId);
    if (!peer) {
      return;
    }
    const dataChannel = peer.pc.createDataChannel("dataChannel", {});
    peer.dc = dataChannel;
    peer = addPeer(peer);
    const offerSessionDescription = await peer.pc.createOffer();
    await peer.pc.setLocalDescription(offerSessionDescription);
    console.log("Sending offer to peer");
    sendMessage(offerSessionDescription);
    dataChannel.onopen = (event) => {
      console.log("dataChannel onopen", { event });
    };
    dataChannel.onmessage = (event) => {
      console.log("dataChannel onmessage", event);
      const msg: DataChannelMessage = event.data;
      if (typeof msg === "string") {
        displayNewMessage(msg);
      }
    };
    dataChannel.onerror = (event) => {
      console.log("dataChannel onerror", event);
    };
  } else if ((message.message as RTCSessionDescription).type === "offer") {
    console.log("Got offer");
    let peer = setUpLocalPeer(message.userId);
    if (!peer) {
      alert("No peer for incoming offer");
      return;
    }
    console.log("^^^before adding peer");
    peer = addPeer(peer);
    console.log("^^^after adding peer");
    peer.pc.ondatachannel = (event) => {
      console.log("^^^ondatachannel");
      const dc = event.channel;
      dc.onopen = (event) => {
        console.log("^^^dataChannel onopen", { event });
      };
      dc.onmessage = (event: MessageEvent<string>) => {
        console.log("dataChannel onmessage", event);
        displayNewMessage(event.data);
      };
      dc.onerror = (event) => {
        console.log("dataChannel onerror", event);
      };
      peers.find((p) => p.userId == message.userId)!.dc = dc;
      console.log("^^^", { peerAtEnd: peer });
    };
    console.log("^^^after ondatachannel");

    await peer.pc.setRemoteDescription(
      new RTCSessionDescription(message.message as RTCSessionDescriptionInit)
    );
    console.log("Sending answer to peer.");
    const answerSessionDescription = await peer.pc.createAnswer();
    await peer.pc.setLocalDescription(answerSessionDescription);
    sendMessage(answerSessionDescription);
    // const video = createRemoteVideoElement(message.userId);
  } else if (
    (message.message as RTCSessionDescription).type === "answer" &&
    isStarted
  ) {
    addUserToList(message.userId);
    const peer = peers.find((peer) => peer.userId === message.userId);
    if (!peer) {
      alert("couldn't find peer");
      return;
    }
    console.log("Got answer from peer, setting it as remote description");
    await peer.pc.setRemoteDescription(
      new RTCSessionDescription(message.message as RTCSessionDescriptionInit)
    );
    peer.pc.ondatachannel = (event) => {
      console.log("^^^ondatachannel");
      const dc = event.channel;
      dc.onopen = (event) => {
        console.log("^^^dataChannel onopen", { event });
      };
      dc.onmessage = (event: MessageEvent<string>) => {
        console.log("dataChannel onmessage", event);
        displayNewMessage(event.data);
      };
      dc.onerror = (event) => {
        console.log("dataChannel onerror", event);
      };
      peers.find((p) => p.userId == message.userId)!.dc = dc;
      console.log("^^^", { peerAtEnd: peer });
    };
  } else if (
    (message.message as CandidateMessage).type === "candidate" &&
    isStarted
  ) {
    console.log("Got ICE candidate from peer, adding it to local peer");
    const candidate = new RTCIceCandidate({
      sdpMLineIndex: (message.message as CandidateMessage).label,
      candidate: (message.message as CandidateMessage).candidate,
    });
    const peer = peers.find((peer) => peer.userId === message.userId);
    if (!peer) {
      return;
    }
    console.log("Adding candidate to local peer");
    peer.pc.addIceCandidate(candidate);
  } else if (message.message === "bye" && isStarted) {
    handleRemoteHangup();
  }
});

function sendMessage(message: OutboundMessage) {
  console.log("Client sending message: ", message);
  const msg: InboundMessage = {
    room,
    userId: id,
    message,
  };
  socket.emit("message", msg);
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
  peers.forEach((peer) => peer.pc.close());
}

function addUserToList(userId: string) {
  if (!userIds.includes(userId)) {
    userIds.push(userId);
  }
}

function createRemoteVideoElement(userId: string) {
  const video = document.createElement("video");
  video.autoplay = true;
  video.playsInline = true;
  video.controls = true;
  video.id = `remote-video-${userId}`;
  const remoteStream = remoteStreams.find((stream) => stream.id === userId);
  if (!remoteStream) {
    return;
  }
  video.srcObject = remoteStream;
  video.autoplay = true;
  video.muted = true;
  video.id = userId;
  remoteVideoContainer.appendChild(video);
  return video;
}
