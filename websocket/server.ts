import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import pool from '../src/lib/db';
import type { ResultSetHeader } from 'mysql2/promise';

const PORT = process.env.PORT || (process.env.WS_PORT ? parseInt(process.env.WS_PORT) : 3001);

// Store connected clients: groupId -> Set of WebSockets
const groupClients = new Map<number, Set<WebSocket>>();
// Store user info: WebSocket -> { userId, username }
const clientUsers = new Map<WebSocket, { userId: number; username: string }>();

const server = createServer();
const wss = new WebSocketServer({ server });

wss.on('connection', (ws: WebSocket) => {
  console.log('Client connected');

  ws.on('message', async (message: Buffer) => {
    try {
      const data = JSON.parse(message.toString());
      console.log('Received:', data);

      switch (data.type) {
        case 'join':
          // User joins a group
          if (data.groupId && data.userId && data.username) {
            const groupId = parseInt(data.groupId);
            
            if (!groupClients.has(groupId)) {
              groupClients.set(groupId, new Set());
            }
            groupClients.get(groupId)!.add(ws);
            clientUsers.set(ws, { userId: data.userId, username: data.username });

            // Notify group members
            broadcastToGroup(groupId, {
              type: 'system',
              message: `${data.username} joined the group`,
            }, ws);

            // Send previous messages (transform snake_case to camelCase)
            const [messages] = await pool.query(
              `SELECT m.*, u.username 
               FROM messages m 
               JOIN users u ON m.user_id = u.id 
               WHERE m.group_id = ? 
               ORDER BY m.created_at ASC 
               LIMIT 50`,
              [groupId]
            );

            const transformedMessages = (messages as any[]).map(m => {
              console.log('Raw message from DB:', m);
              return {
                id: m.id,
                content: m.content,
                username: m.username,
                userId: m.user_id,
                createdAt: m.created_at,
              };
            });

            console.log('Transformed messages:', transformedMessages.slice(0, 2));

            ws.send(JSON.stringify({ type: 'history', messages: transformedMessages }));
          }
          break;

        case 'message':
          // User sends a message
          if (data.groupId && data.content && data.userId) {
            const groupId = parseInt(data.groupId);
            const userInfo = clientUsers.get(ws);

            if (userInfo) {
              // Save to database
              const [result] = await pool.query<ResultSetHeader>(
                'INSERT INTO messages (group_id, user_id, content) VALUES (?, ?, ?)',
                [groupId, data.userId, data.content]
              );

              // Broadcast to all group members
              broadcastToGroup(groupId, {
                type: 'message',
                id: result.insertId,
                content: data.content,
                username: userInfo.username,
                userId: data.userId,
                createdAt: new Date().toISOString(),
              });
            }
          }
          break;

        case 'typing':
          // User is typing
          if (data.groupId && data.userId && data.username) {
            const groupId = parseInt(data.groupId);
            const isTyping = data.isTyping;
            console.log(`User ${data.username} typing in group ${groupId}: ${isTyping}`);

            broadcastToGroup(groupId, {
              type: 'typing',
              userId: data.userId,
              username: data.username,
              isTyping,
            }, ws);
          }
          break;

        case 'reaction':
          // User adds reaction to message
          if (data.groupId && data.messageId && data.userId && data.reaction && data.username) {
            const groupId = parseInt(data.groupId);
            const messageId = parseInt(data.messageId);
            const userId = parseInt(data.userId);
            const reaction = data.reaction;

            try {
              // Save reaction to database
              await pool.query(
                'INSERT INTO reactions (message_id, user_id, reaction) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE reaction = ?',
                [messageId, userId, reaction, reaction]
              );

              // Get all reactions for this message
              const [reactions] = await pool.query(
                'SELECT reaction, COUNT(*) as count FROM reactions WHERE message_id = ? GROUP BY reaction',
                [messageId]
              );

              // Broadcast to group
              broadcastToGroup(groupId, {
                type: 'reaction',
                messageId,
                userId,
                username: data.username,
                reaction,
                reactions: reactions as any[],
              });
            } catch (err) {
              console.error('Error saving reaction:', err);
            }
          }
          break;

        case 'remove_reaction':
          // User removes reaction from message
          if (data.groupId && data.messageId && data.userId && data.reaction) {
            const groupId = parseInt(data.groupId);
            const messageId = parseInt(data.messageId);
            const userId = parseInt(data.userId);
            const reaction = data.reaction;

            try {
              // Remove reaction from database
              await pool.query(
                'DELETE FROM reactions WHERE message_id = ? AND user_id = ? AND reaction = ?',
                [messageId, userId, reaction]
              );

              // Get remaining reactions for this message
              const [reactions] = await pool.query(
                'SELECT reaction, COUNT(*) as count FROM reactions WHERE message_id = ? GROUP BY reaction',
                [messageId]
              );

              // Broadcast to group
              broadcastToGroup(groupId, {
                type: 'reaction',
                messageId,
                userId,
                reaction,
                reactions: reactions as any[],
                removed: true,
              });
            } catch (err) {
              console.error('Error removing reaction:', err);
            }
          }
          break;
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });

  ws.on('close', () => {
    const userInfo = clientUsers.get(ws);
    
    // Remove from all groups and notify
    groupClients.forEach((clients, groupId) => {
      if (clients.has(ws)) {
        clients.delete(ws);
        if (userInfo) {
          broadcastToGroup(groupId, {
            type: 'system',
            message: `${userInfo.username} disconnected`,
          });
        }
      }
    });
    
    clientUsers.delete(ws);
    console.log('Client disconnected');
  });
});

function broadcastToGroup(groupId: number, data: any, exclude?: WebSocket) {
  const clients = groupClients.get(groupId);
  if (clients) {
    const message = JSON.stringify(data);
    let sentCount = 0;
    clients.forEach((client) => {
      if (client !== exclude && client.readyState === WebSocket.OPEN) {
        client.send(message);
        sentCount++;
      }
    });
    console.log(`Broadcast to group ${groupId}: sent to ${sentCount} clients (total: ${clients.size})`);
  } else {
    console.log(`No clients in group ${groupId}`);
  }
}

server.listen(PORT, () => {
  console.log(`WebSocket server running on port ${PORT}`);
});
