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
let localPeerConnection;
let localStream;
let remoteStream;
let isChannelReady = false;
let isInitiator = false;
let isStarted = false;
let mySocketId;
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
const localVideo = document.querySelector("#localVideo");
const remoteVideo = document.querySelector("#remoteVideo");
const startButton = document.getElementById("startButton");
const callButton = document.getElementById("callButton");
const hangupButton = document.getElementById("hangupButton");
function createPeerConnection() {
    try {
        localPeerConnection = new RTCPeerConnection();
        localPeerConnection.onicecandidate = (event) => {
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
    }
    catch (e) {
        console.log("Failed to create PeerConnection, exception: " + e.message);
        alert("Cannot create RTCPeerConnection object.");
        return;
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
function setLocalDescriptionAndSendItToPeer(sessionDescription) { }
// @ts-ignore
const socket = io.connect();
socket.on("connect", () => {
    document.querySelector("#socketId").innerHTML = Math.random()
        .toString(36)
        .substring(7);
});
startButton.onclick = () => __awaiter(void 0, void 0, void 0, function* () {
    room =
        prompt("Enter room name:", "") || Math.random().toString(36).substring(7);
    socket.emit("createRoom", room);
    localStream = yield navigator.mediaDevices.getUserMedia({
        audio: false,
        video: true,
    });
    localVideo.srcObject = localStream;
});
callButton.onclick = () => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    room = (_a = prompt("Enter room name:")) !== null && _a !== void 0 ? _a : "";
    socket.emit("joinRoom", room);
    localStream = yield navigator.mediaDevices.getUserMedia({
        audio: false,
        video: true,
    });
    localVideo.srcObject = localStream;
    sendMessage("peerIsReady");
});
hangupButton.onclick = () => {
    hangup();
};
socket.on("created", function (room) {
    console.log("Created room " + room);
    isInitiator = true;
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
// This client receives a message
socket.on("message", function (message) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log("Client received message:", message);
        // ? sent by peer after clickign call and getting user media
        if (message === "peerIsReady") {
            console.log("message=got user media, calling maybeStart()");
            setUpLocalPeer();
            if (isInitiator) {
                const offerSessionDescription = yield localPeerConnection.createOffer();
                localPeerConnection.setLocalDescription(offerSessionDescription);
                console.log("Sending offer to peer");
                sendMessage(offerSessionDescription);
            }
        }
        else if (message.type === "offer") {
            if (!isInitiator && !isStarted) {
                console.log("Got offer");
                setUpLocalPeer();
            }
            localPeerConnection.setRemoteDescription(new RTCSessionDescription(message));
            console.log("Sending answer to peer.");
            const answerSessionDescription = yield localPeerConnection.createAnswer();
            localPeerConnection.setLocalDescription(answerSessionDescription);
            sendMessage(answerSessionDescription);
        }
        else if (message.type === "answer" &&
            isStarted) {
            console.log("Got answer from peer, setting it as remote description");
            localPeerConnection.setRemoteDescription(new RTCSessionDescription(message));
        }
        else if (message.type === "candidate" && isStarted) {
            console.log("Got ICE candidate from peer, adding it to local peer");
            const candidate = new RTCIceCandidate({
                sdpMLineIndex: message.label,
                candidate: message.candidate,
            });
            localPeerConnection.addIceCandidate(candidate);
        }
        else if (message === "bye" && isStarted) {
            handleRemoteHangup();
        }
    });
});
////////////////////////////////////////////////
function sendMessage(message) {
    console.log("Client sending message: ", message);
    socket.emit("message", message);
}
window.onbeforeunload = function () {
    sendMessage("bye");
};
function hangup() {
    console.log("Hanging up.");
    stopRTC();
    localStream.removeTrack(localStream.getTracks()[0]);
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
