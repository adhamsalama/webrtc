"use strict";

let localPeerConnection: RTCPeerConnection;
let dataChannel: RTCDataChannel;
let localStream: MediaStream;
let remoteStream: MediaStream;
let localCatpureStream: MediaStream;
let remoteStreams: MediaStream[] = [];
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
  console.log(
    "adding capture stream to peer connection",
    // @ts-ignore
    `local stream length: ${localPeerConnection.getLocalStreams().length}`
  );
  localCatpureStream.getTracks().forEach((track) => {
    console.log(`adding track ${track.label} to peer connection`);
    try {
      localPeerConnection.addTrack(track, localCatpureStream);
    } catch (err) {
      console.error(`Error adding capture track: ${err}`);
    }
  });
  console.log(
    "added capture stream to peer connection",
    // @ts-ignore
    `local stream length: ${localPeerConnection.getLocalStreams().length}`
  );
  const offerSessionDescription = await localPeerConnection.createOffer();
  await localPeerConnection.setLocalDescription(offerSessionDescription);
  console.log("Sending offer to peer");
  sendMessage(offerSessionDescription);
};
type DataChannelMessage =
  | string
  | { type: string; data: { type: string; streamId: string } };
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
    localPeerConnection = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
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
      if (!remoteStream) {
        remoteStream = event.streams[0];
        remoteVideo.srcObject = event.streams[0];
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
      if (remoteStreams.length > 1) {
        remoteScreenShare.srcObject = remoteStreams[1];
      }
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
      localPeerConnection.addTrack(track, localStream);
    });
    isStarted = true;
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
  socket.emit("createRoom", room);
};
callButton.onclick = async () => {
  room = prompt("Enter room name:") ?? "";
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
  dataChannel.send(message);
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

// This client receives a message
socket.on("message", async function (message: Message) {
  console.log("Client received message:", message);
  // ? sent by peer after clicking call and getting user media
  if (message === "peerIsReady") {
    console.log("message=got user media");
    setUpLocalPeer();
    dataChannel = localPeerConnection.createDataChannel("dataChannel", {});
    const offerSessionDescription = await localPeerConnection.createOffer();
    await localPeerConnection.setLocalDescription(offerSessionDescription);
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
  } else if ((message as RTCSessionDescription).type === "offer") {
    console.log("Got offer");
    if (!isStarted) {
      setUpLocalPeer();
    }
    console.log(
      `Local peer connection streams length: ${
        // @ts-ignore
        localPeerConnection.getLocalStreams().length
      }`
    );
    await localPeerConnection.setRemoteDescription(
      new RTCSessionDescription(message as RTCSessionDescriptionInit)
    );
    console.log("Sending answer to peer.");
    const answerSessionDescription = await localPeerConnection.createAnswer();
    await localPeerConnection.setLocalDescription(answerSessionDescription);
    sendMessage(answerSessionDescription);
    localPeerConnection.ondatachannel = (event) => {
      dataChannel = event.channel;
      dataChannel.onopen = (event) => {
        console.log("dataChannel onopen", { event });
      };
      dataChannel.onmessage = (event: MessageEvent<string>) => {
        console.log("dataChannel onmessage", event);
        displayNewMessage(event.data);
      };
      dataChannel.onerror = (event) => {
        console.log("dataChannel onerror", event);
      };
    };
  } else if (
    (message as RTCSessionDescription).type === "answer" &&
    isStarted
  ) {
    console.log("Got answer from peer, setting it as remote description");
    await localPeerConnection.setRemoteDescription(
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
