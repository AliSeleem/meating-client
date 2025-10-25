import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { environment } from '../environments/environment';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [FormsModule, CommonModule, RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  roomName: string = '';
  ws!: WebSocket;
  localStream!: MediaStream;
  peerConnections: Map<string, RTCPeerConnection> = new Map();
  localVideo!: HTMLVideoElement;

  ngOnInit() {
    this.localVideo = document.querySelector('#localVideo') as HTMLVideoElement;
    this.setupWebRTC();
    console.log(environment.SERVER)
  }

  ngOnDestroy() {
    this.ws?.close();
    this.localStream?.getTracks().forEach(track => track.stop());
    this.peerConnections.forEach(pc => pc.close());
  }

  async setupWebRTC() {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      this.localVideo.srcObject = this.localStream;
    } catch (err) {
      console.error('Media error:', err);
      alert(err);
    }
  }

  joinRoom() {
    if (!this.roomName) return;
    this.ws = new WebSocket(environment.SERVER);
    this.ws.onopen = () => {
      this.ws.send(JSON.stringify({ type: 'join', room: this.roomName }));
    };
    this.ws.onmessage = async (event) => {
      const msg = JSON.parse(event.data);
      switch (msg.type) {
        case 'user-joined':
          this.createPeerConnection(msg.room);
          break;
        case 'offer':
          await this.handleOffer(msg.payload, msg.room);
          break;
        case 'answer':
          await this.handleAnswer(msg.payload);
          break;
        case 'ice-candidate':
          await this.handleIceCandidate(msg.payload);
          break;
        case 'user-left':
          this.removePeerConnection(msg.room);
          break;
      }
    };
  }

  async createPeerConnection(peerId: string) {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });
    this.peerConnections.set(peerId, pc);

    this.localStream.getTracks().forEach(track => pc.addTrack(track, this.localStream));

    pc.ontrack = (event) => {
      const video = document.createElement('video');
      video.autoplay = true;
      video.playsInline = true;
      video.srcObject = event.streams[0];
      document.getElementById('remoteVideos')?.appendChild(video);
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.ws.send(JSON.stringify({
          type: 'ice-candidate',
          payload: event.candidate,
          room: this.roomName,
        }));
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.ws.send(JSON.stringify({
      type: 'offer',
      payload: offer,
      room: this.roomName,
    }));
  }

  async handleOffer(offer: RTCSessionDescriptionInit, peerId: string) {
    if (!this.peerConnections.has(peerId)) {
      await this.createPeerConnection(peerId);
    }
    const pc = this.peerConnections.get(peerId)!;
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    this.ws.send(JSON.stringify({
      type: 'answer',
      payload: answer,
      room: this.roomName,
    }));
  }

  async handleAnswer(answer: RTCSessionDescriptionInit) {
    const pc = this.peerConnections.get(this.roomName);
    if (pc) {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
    }
  }

  async handleIceCandidate(candidate: RTCIceCandidateInit) {
    const pc = this.peerConnections.get(this.roomName);
    if (pc) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
  }

  removePeerConnection(peerId: string) {
    const pc = this.peerConnections.get(peerId);
    if (pc) {
      pc.close();
      this.peerConnections.delete(peerId);
    }
  }
}
