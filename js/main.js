"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
let isChannelReady = false;
let isInitiator = false;
let isStarted = false;
let localStream;
let localPeerConnection;
let remoteStream;
let turnReady;
let pcConfig = {
    iceServers: [
        {
            urls: "stun:stun.l.google.com:19302",
        },
    ],
};
// Set up audio and video regardless of what devices are present.
let sdpConstraints = {
    offerToReceiveAudio: true,
    offerToReceiveVideo: true,
};
let mySocketId;
/////////////////////////////////////////////
let room = "";
// Could prompt for room name:
// @ts-ignore
const socket = io.connect();
socket.on("connect", () => {
    document.querySelector("#socketId").innerHTML = Math.random()
        .toString(36)
        .substring(7);
});
const startButton = document.getElementById("startButton");
startButton.onclick = () => __awaiter(void 0, void 0, void 0, function* () {
    room =
        prompt("Enter room name:", "") || Math.random().toString(36).substring(7);
    socket.emit("createRoom", room);
    const localStream = yield navigator.mediaDevices.getUserMedia({
        audio: false,
        video: true,
    });
    gotStream(localStream);
    console.log("creatingRoom, calling maybeStart()");
    // maybeStart();
});
const callButton = document.getElementById("callButton");
callButton.onclick = () => {
    var _a;
    room = (_a = prompt("Enter room name:")) !== null && _a !== void 0 ? _a : "";
    socket.emit("joinRoom", room);
    navigator.mediaDevices
        .getUserMedia({
        audio: false,
        video: true,
    })
        .then(gotStream)
        .catch(function (e) {
        alert("getUserMedia() error: " + e.name);
    });
};
socket.on("created", function (room) {
    console.log("Created room " + room);
    isInitiator = true;
});
socket.on("full", function (room) {
    console.log("Room " + room + " is full");
});
socket.on("join", function (room) {
    console.log("Another peer made a request to join room " + room);
    console.log("This peer is the initiator of room " + room + "!");
    isChannelReady = true;
});
socket.on("joined", function (room) {
    console.log("joined: " + room);
    isChannelReady = true;
});
socket.on("log", function (array) {
    console.log.apply(console, array);
});
////////////////////////////////////////////////
function sendMessage(message) {
    console.log("Client sending message: ", message);
    socket.emit("message", message);
}
// This client receives a message
socket.on("message", function (message) {
    console.log("Client received message:", message);
    if (message === "got user media") {
        console.log("message=got user media, calling maybeStart()");
        maybeStart();
    }
    else if (message.type === "offer") {
        if (!isInitiator && !isStarted) {
            console.log("message=offer, calling maybeStart()");
            maybeStart();
        }
        localPeerConnection.setRemoteDescription(new RTCSessionDescription(message));
        console.log("calling doAnswer");
        doAnswer();
    }
    else if (message.type === "answer" &&
        isStarted) {
        console.log("message=answer, calling setRemoteDescription");
        localPeerConnection.setRemoteDescription(new RTCSessionDescription(message));
    }
    else if (message.type === "candidate" && isStarted) {
        console.log("message=candidate, calling addIceCandidate");
        let candidate = new RTCIceCandidate({
            sdpMLineIndex: message.label,
            candidate: message.candidate,
        });
        localPeerConnection.addIceCandidate(candidate);
    }
    else if (message === "bye" && isStarted) {
        handleRemoteHangup();
    }
});
////////////////////////////////////////////////////
const localVideo = document.querySelector("#localVideo");
const remoteVideo = document.querySelector("#remoteVideo");
function gotStream(stream) {
    console.log("Adding local stream.");
    localStream = stream;
    localVideo.srcObject = stream;
    sendMessage("got user media");
    /*if (isInitiator) {
      maybeStart();
    }*/
}
const constraints = {
    video: true,
};
console.log("Getting user media with constraints", constraints);
if (location.hostname !== "localhost") {
    requestTurn("https://computeengineondemand.appspot.com/turn?username=41784574&key=4080218913");
}
function maybeStart() {
    console.log(">>>>>>> maybeStart() ", { isStarted }, { isChannelReady });
    if (!isStarted && typeof localStream !== "undefined" && isChannelReady) {
        console.log(">>>>>> creating peer connection");
        createPeerConnection();
        localStream.getTracks().forEach((track) => {
            localPeerConnection.addTrack(track, localStream);
        });
        isStarted = true;
        console.log("isInitiator", isInitiator);
        if (isInitiator) {
            doCall();
        }
    }
    else {
        console.log(">>>>>>> not creating peer conenction");
    }
}
window.onbeforeunload = function () {
    sendMessage("bye");
};
/////////////////////////////////////////////////////////
function createPeerConnection() {
    try {
        localPeerConnection = new RTCPeerConnection();
        localPeerConnection.onicecandidate = handleIceCandidate;
        localPeerConnection.ontrack = (event) => {
            console.log("ontrack", event);
            remoteVideo.srcObject = event.streams[0];
        };
        // @ts-expect-error
        localPeerConnection.onremovestream = handleRemoteStreamRemoved;
        console.log("Created RTCPeerConnnection");
    }
    catch (e) {
        console.log("Failed to create PeerConnection, exception: " + e.message);
        alert("Cannot create RTCPeerConnection object.");
        return;
    }
}
function handleIceCandidate(event) {
    console.log("icecandidate event: ", event);
    if (event.candidate) {
        sendMessage({
            type: "candidate",
            label: event.candidate.sdpMLineIndex,
            id: event.candidate.sdpMid,
            candidate: event.candidate.candidate,
        });
    }
    else {
        console.log("End of candidates.");
    }
}
function handleCreateOfferError(event) {
    console.log("createOffer() error: ", event);
}
function doCall() {
    console.log("Sending offer to peer");
    localPeerConnection.createOffer(setLocalAndSendMessage, handleCreateOfferError);
}
function doAnswer() {
    console.log("Sending answer to peer.");
    localPeerConnection
        .createAnswer()
        .then(setLocalAndSendMessage, onCreateSessionDescriptionError);
}
function setLocalAndSendMessage(sessionDescription) {
    localPeerConnection.setLocalDescription(sessionDescription);
    console.log("setLocalAndSendMessage sending message", sessionDescription);
    sendMessage(sessionDescription);
}
function onCreateSessionDescriptionError(error) {
    console.error("Failed to create session description: " + error.toString());
}
function requestTurn(turnURL) {
    let turnExists = false;
    for (let i in pcConfig.iceServers) {
        if (pcConfig.iceServers[i].urls.substr(0, 5) === "turn:") {
            turnExists = true;
            turnReady = true;
            break;
        }
    }
    if (!turnExists) {
        console.log("Getting TURN server from ", turnURL);
        // No TURN server. Get one from computeengineondemand.appspot.com:
        let xhr = new XMLHttpRequest();
        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4 && xhr.status === 200) {
                let turnServer = JSON.parse(xhr.responseText);
                console.log("Got TURN server: ", turnServer);
                pcConfig.iceServers.push({
                    urls: "turn:" + turnServer.username + "@" + turnServer.turn,
                    // @ts-expect-error
                    credential: turnServer.password,
                });
                turnReady = true;
            }
        };
        xhr.open("GET", turnURL, true);
        xhr.send();
    }
}
function handleRemoteStreamAdded(event) {
    console.log("Remote stream added.");
    remoteStream = event.stream;
    remoteVideo.srcObject = remoteStream;
}
function handleRemoteStreamRemoved(event) {
    console.log("Remote stream removed. Event: ", event);
}
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
