import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(process.env.NEXT_PUBLIC_CHAT_WS_URL || 'http://localhost:3004', {
      autoConnect: false,
      withCredentials: true,
    });
  }
  return socket;
}

export function connectSocket(accessToken: string): Socket {
  const s = getSocket();

  if (s.connected) {
    return s;
  }

  s.auth = { token: accessToken };
  s.connect();

  return s;
}

export function disconnectSocket(): void {
  if (socket?.connected) {
    socket.disconnect();
  }
}

export function joinConversation(conversationId: string): void {
  const s = getSocket();
  if (s.connected) {
    s.emit('join:conversation', conversationId);
  }
}

export function leaveConversation(conversationId: string): void {
  const s = getSocket();
  if (s.connected) {
    s.emit('leave:conversation', conversationId);
  }
}

export function sendMessage(
  conversationId: string,
  content: string,
  userId: string
): void {
  const s = getSocket();
  if (s.connected) {
    s.emit('chat:message', { conversationId, content, userId });
  }
}
