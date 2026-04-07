'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

export interface WebSocketMessage {
  type: 'message' | 'system' | 'history' | 'typing';
  [key: string]: any;
}

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001';

export function useWebSocket() {
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<WebSocketMessage[]>([]);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(() => {
    console.log(`Attempting WebSocket connection to ${WS_URL}...`);
    const websocket = new WebSocket(WS_URL);

    websocket.onopen = () => {
      console.log('Connected to chat server');
      setConnected(true);
      setWs(websocket);
    };

    websocket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log('Received from server:', data);
      setMessages((prev) => [...prev, data]);
    };

    websocket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    websocket.onclose = () => {
      console.log('Disconnected from chat server, will retry...');
      setConnected(false);
      setWs(null);
      
      // Auto-reconnect after 2 seconds
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, 2000);
    };

    return websocket;
  }, []);

  useEffect(() => {
    const websocket = connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      websocket.close();
    };
  }, [connect]);

  const sendMessage = useCallback((data: object) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      console.log('Sending:', data);
      ws.send(JSON.stringify(data));
    } else {
      console.warn('WebSocket not connected, cannot send:', data);
    }
  }, [ws]);

  const joinGroup = useCallback((groupId: number, userId: number, username: string) => {
    console.log('Joining group:', { groupId, userId, username });
    sendMessage({ type: 'join', groupId, userId, username });
  }, [sendMessage]);

  const sendChatMessage = useCallback((groupId: number, userId: number, content: string) => {
    sendMessage({ type: 'message', groupId, userId, content });
  }, [sendMessage]);

  const leaveGroup = useCallback((groupId: number) => {
    sendMessage({ type: 'leave', groupId });
  }, [sendMessage]);

  const sendTyping = useCallback((groupId: number, userId: number, username: string, isTyping: boolean) => {
    sendMessage({ type: 'typing', groupId, userId, username, isTyping });
  }, [sendMessage]);

  return {
    connected,
    messages,
    joinGroup,
    sendChatMessage,
    leaveGroup,
    sendTyping,
    clearMessages: () => setMessages([]),
  };
}
