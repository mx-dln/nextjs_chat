'use client';

import { useState, useEffect, useRef } from 'react';
import { useWebSocket, type WebSocketMessage } from '@/hooks/useWebSocket';
import { Menu, ArrowLeft } from 'lucide-react';

interface User {
  id: number;
  username: string;
}

interface Group {
  id: number;
  name: string;
  created_by_name: string;
  member_count: number;
}

export default function ChatPage() {
  const [user, setUser] = useState<User | null>(null);
  const [username, setUsername] = useState('');
  const [groups, setGroups] = useState<Group[]>([]);
  const [currentGroup, setCurrentGroup] = useState<Group | null>(null);
  const [messageInput, setMessageInput] = useState('');
  const [chatHistory, setChatHistory] = useState<WebSocketMessage[]>([]);
  const [newGroupName, setNewGroupName] = useState('');
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const chatContainerRef = useRef<HTMLDivElement | null>(null);

  const [reactionMenu, setReactionMenu] = useState<{msgId: number, x: number, y: number} | null>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '👏'];

  const handleTouchStart = (msgId: number) => (e: React.TouchEvent | React.MouseEvent) => {
    const touch = 'touches' in e ? e.touches[0] : e;
    longPressTimerRef.current = setTimeout(() => {
      setReactionMenu({
        msgId,
        x: touch.clientX,
        y: touch.clientY - 60,
      });
    }, 500);
  };

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }
  };

  const addReaction = (reaction: string) => {
    if (reactionMenu && currentGroup && user) {
      sendReaction(currentGroup.id, reactionMenu.msgId, user.id, user.username, reaction);
      setReactionMenu(null);
    }
  };

  // Close reaction menu on click outside
  useEffect(() => {
    const handleClick = () => setReactionMenu(null);
    if (reactionMenu) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [reactionMenu]);

  const { connected, messages, joinGroup, sendChatMessage, leaveGroup, sendTyping, sendReaction, clearMessages } = useWebSocket();
  const [messageReactions, setMessageReactions] = useState<Record<number, {reaction: string, count: number}[]>>({});

  // Load groups when user is set
  useEffect(() => {
    if (user) {
      fetchGroups();
    }
  }, [user]);

  // Handle incoming messages
  useEffect(() => {
    messages.forEach((msg) => {
      if (msg.type === 'history') {
        setChatHistory(msg.messages || []);
      } else if (msg.type === 'message' || msg.type === 'system') {
        setChatHistory((prev) => [...prev, msg]);
      } else if (msg.type === 'typing') {
        setTypingUsers((prev) => {
          const newSet = new Set(prev);
          if (msg.isTyping && msg.username !== user?.username) {
            newSet.add(msg.username);
          } else {
            newSet.delete(msg.username);
          }
          return newSet;
        });
      } else if (msg.type === 'reaction') {
        // Update reactions for the message
        setMessageReactions((prev) => ({
          ...prev,
          [msg.messageId]: msg.reactions || [],
        }));
      }
    });
  }, [messages, user]);

  const fetchGroups = async () => {
    const res = await fetch('/api/groups');
    const data = await res.json();
    setGroups(data);
  };

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username }),
    });

    if (res.ok) {
      const data = await res.json();
      setUser(data);
      localStorage.setItem('chatUser', JSON.stringify(data));
    } else {
      const error = await res.json();
      alert(error.error);
    }
  };

  const createGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const res = await fetch('/api/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newGroupName, createdBy: user.id }),
    });

    if (res.ok) {
      setNewGroupName('');
      fetchGroups();
    }
  };

  const selectGroup = (group: Group) => {
    // Don't rejoin if already in this group
    if (currentGroup?.id === group.id) return;
    
    if (currentGroup) {
      leaveGroup(currentGroup.id);
    }
    setCurrentGroup(group);
    setSidebarOpen(false); // Close sidebar on mobile when selecting group
    clearMessages();
    setChatHistory([]);
    setMessageReactions({}); // Clear reactions when switching
    setTypingUsers(new Set()); // Clear typing users when switching
    if (user) {
      joinGroup(group.id, user.id, user.username);
    }
  };

  const handleTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setMessageInput(value);

    if (!currentGroup || !user) return;

    // Send typing indicator
    sendTyping(currentGroup.id, user.id, user.username, value.length > 0);

    // Clear previous timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Stop typing after 2 seconds of inactivity
    typingTimeoutRef.current = setTimeout(() => {
      sendTyping(currentGroup.id, user.id, user.username, false);
    }, 2000);
  };

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentGroup || !user || !messageInput.trim()) return;

    // Stop typing indicator when sending
    sendTyping(currentGroup.id, user.id, user.username, false);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    sendChatMessage(currentGroup.id, user.id, messageInput.trim());
    setMessageInput('');
  };

  // Scroll to bottom when new messages or typing indicator changes
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatHistory, typingUsers]);

  // Check for saved user on mount
  useEffect(() => {
    const saved = localStorage.getItem('chatUser');
    if (saved) {
      setUser(JSON.parse(saved));
    }
  }, []);

  // Login screen
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
        <form onSubmit={createUser} className="bg-white p-6 sm:p-8 rounded-lg shadow-md w-full max-w-sm">
          <h1 className="text-2xl font-bold mb-6 text-center">Join Chat</h1>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter username"
            className="w-full px-4 py-2 border rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-black"
            required
          />
          <button
            type="submit"
            className="w-full bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600"
          >
            Join
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex relative">
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar - Groups */}
      <div className={`${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 fixed lg:static inset-y-0 left-0 w-64 bg-white border-r flex flex-col z-50 transition-transform duration-200 ease-in-out`}>
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-black truncate">{user.username}</span>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
              <button 
                onClick={() => setSidebarOpen(false)}
                className="lg:hidden p-1 hover:bg-gray-100 rounded"
              >
                <ArrowLeft size={20} />
              </button>
            </div>
          </div>
          <form onSubmit={createGroup} className="flex gap-2">
            <input
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="New group..."
              className="flex-1 px-2 py-1 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white text-black"
            />
            <button
              type="submit"
              className="bg-blue-500 text-white px-3 py-1 text-sm rounded hover:bg-blue-600"
            >
              +
            </button>
          </form>
        </div>

        <div className="flex-1 overflow-y-auto">
          {groups.map((group) => (
            <button
              key={group.id}
              onClick={() => selectGroup(group)}
              className={`w-full p-4 text-left border-b hover:bg-gray-50 ${
                currentGroup?.id === group.id ? 'bg-blue-50 border-blue-200' : ''
              }`}
            >
              <div className="font-medium text-black">{group.name}</div>
              <div className="text-sm text-gray-500">
                {group.member_count} members
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden w-full">
        {currentGroup ? (
          <>
            <div className="bg-white border-b p-3 sm:p-4 flex-shrink-0 flex items-center gap-3">
              <button 
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-2 hover:bg-gray-100 rounded-lg"
              >
                <Menu size={20} />
              </button>
              <h2 className="font-semibold text-lg text-black">{currentGroup.name}</h2>
            </div>

            {/* Reaction Menu Popup */}
            {reactionMenu && (
              <div 
                className="fixed z-50 bg-white rounded-full shadow-lg px-2 py-2 flex gap-1 items-center animate-in fade-in slide-in-from-bottom-2"
                style={{ 
                  left: Math.max(10, Math.min(window.innerWidth - 280, reactionMenu.x - 130)), 
                  top: Math.max(10, reactionMenu.y),
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {REACTIONS.map((reaction) => (
                  <button
                    key={reaction}
                    onClick={() => addReaction(reaction)}
                    className="w-10 h-10 flex items-center justify-center text-2xl hover:bg-gray-100 rounded-full transition-transform hover:scale-125"
                  >
                    {reaction}
                  </button>
                ))}
              </div>
            )}

            <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-1 min-h-0">
              {chatHistory.map((msg, idx) => {
                const isMyMessage = Number(msg.userId) === Number(user.id);
                return (
                <div key={idx}>
                  {msg.type === 'system' ? (
                    <div className="text-center text-gray-500 text-xs sm:text-sm py-2">
                      {msg.message}
                    </div>
                  ) : (
                    <div
                      className={`flex ${
                        isMyMessage ? 'justify-end' : 'justify-start'
                      }`}
                      onMouseDown={handleTouchStart(msg.id || idx)}
                      onMouseUp={handleTouchEnd}
                      onMouseLeave={handleTouchEnd}
                      onTouchStart={handleTouchStart(msg.id || idx)}
                      onTouchEnd={handleTouchEnd}
                    >
                      <div className={`flex flex-col ${isMyMessage ? 'items-end' : 'items-start'}`}>
                        <div
                          className={`max-w-[75%] sm:max-w-xs lg:max-w-md px-3 sm:px-4 py-2 rounded-2xl shadow-sm cursor-pointer select-none [touch-action:manipulation] [-webkit-touch-callout:none] [-webkit-user-select:none] ${
                            isMyMessage
                              ? 'bg-blue-500 text-white rounded-br-md'
                              : 'bg-gray-100 text-black rounded-bl-md'
                          }`}
                        >
                          {!isMyMessage && (
                            <div className="text-xs font-semibold mb-1 text-gray-600">
                              {msg.username}
                            </div>
                          )}
                          <div className="text-sm break-words">{msg.content}</div>
                          <div
                            className={`text-xs mt-1 ${
                              isMyMessage ? 'text-blue-200' : 'text-gray-400'
                            }`}
                          >
                            {msg.createdAt
                              ? new Date(msg.createdAt).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : ''}
                          </div>
                        </div>
                        {/* Reactions display */}
                        {messageReactions[msg.id || idx] && messageReactions[msg.id || idx].length > 0 && (
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {messageReactions[msg.id || idx].map((r) => (
                              <span
                                key={r.reaction}
                                className="bg-white border rounded-full px-2 py-0.5 text-sm shadow-sm flex items-center gap-1"
                              >
                                {r.reaction} <span className="text-gray-500 text-xs">{r.count}</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )})}
            </div>

            {/* Typing indicator - Messenger style bubble with dots */}
            {typingUsers.size > 0 && (
              <div className="flex flex-col items-start px-3 sm:px-4 pb-2 flex-shrink-0">
                <span className="text-xs text-gray-500 mb-1 ml-2">
                  {Array.from(typingUsers).join(', ')}
                </span>
                <div className="bg-gray-100 rounded-2xl rounded-bl-md px-3 sm:px-4 py-2 sm:py-3 shadow-sm flex items-center gap-1">
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}

            <form onSubmit={sendMessage} className="bg-white border-t p-3 sm:p-4 flex gap-2 flex-shrink-0">
              <input
                type="text"
                value={messageInput}
                onChange={handleTyping}
                placeholder="Type a message..."
                className="flex-1 px-3 sm:px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-black text-sm sm:text-base"
              />
              <button
                type="submit"
                className="bg-blue-500 text-white px-4 sm:px-6 py-2 rounded-lg hover:bg-blue-600 text-sm sm:text-base"
              >
                Send
              </button>
            </form>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500 p-4">
            <button 
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden mb-4 p-3 bg-white rounded-lg shadow-md hover:bg-gray-50"
            >
              <Menu size={24} />
            </button>
            <p className="text-center">Select a group to start chatting</p>
          </div>
        )}
      </div>
    </div>
  );
}
