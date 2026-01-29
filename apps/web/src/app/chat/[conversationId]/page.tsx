'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Send,
  Sparkles,
  MoreVertical,
  RefreshCw,
  Download,
  Trash2,
} from 'lucide-react';
import { conversationsApi } from '@/lib/api';
import { useAuthStore, useChatStore } from '@/lib/store';
import {
  getSocket,
  connectSocket,
  joinConversation,
  leaveConversation,
  sendMessage as socketSendMessage,
} from '@/lib/socket';
import { cn, getInitials, formatRelativeTime } from '@/lib/utils';
import toast from 'react-hot-toast';

interface Message {
  id: string;
  role: 'USER' | 'ASSISTANT' | 'SYSTEM';
  content: string;
  createdAt: string;
  tokenCount?: number;
}

interface Character {
  id: string;
  name: string;
  avatarUrl: string | null;
}

interface Conversation {
  id: string;
  title: string;
  status: string;
  character: Character;
  createdAt: string;
  updatedAt: string;
}

export default function ChatPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const conversationId = params.conversationId as string;

  const { isAuthenticated, accessToken, user } = useAuthStore();
  const { setActiveConversation, typingIndicators, setTyping } = useChatStore();

  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [showMenu, setShowMenu] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Fetch conversation details
  const { data: conversationData, isLoading: isLoadingConversation } = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: () => conversationsApi.get(conversationId),
    enabled: !!conversationId && isAuthenticated,
  });

  // Fetch messages
  const { data: messagesData, isLoading: isLoadingMessages } = useQuery({
    queryKey: ['messages', conversationId],
    queryFn: () => conversationsApi.messages(conversationId, { limit: 50 }),
    enabled: !!conversationId && isAuthenticated,
  });

  const conversation = conversationData?.data as Conversation | undefined;
  const character = conversation?.character;
  const isTyping = typingIndicators[conversationId] || false;

  // Initialize messages from API
  useEffect(() => {
    if (messagesData?.data) {
      const fetchedMessages = messagesData.data as Message[];
      setMessages(fetchedMessages.reverse());
    }
  }, [messagesData]);

  // Set active conversation
  useEffect(() => {
    setActiveConversation(conversationId);
    return () => setActiveConversation(null);
  }, [conversationId, setActiveConversation]);

  // Connect to WebSocket
  useEffect(() => {
    if (!isAuthenticated || !accessToken) return;

    const socket = connectSocket(accessToken);

    socket.on('connect', () => {
      setIsConnected(true);
      joinConversation(conversationId);
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    // Handle new messages
    socket.on('chat:message', (message: Message) => {
      setMessages((prev) => [...prev, message]);
      setIsSending(false);
      setStreamingContent('');
    });

    // Handle streaming chunks
    socket.on('chat:stream_chunk', (data: { content: string }) => {
      setStreamingContent((prev) => prev + data.content);
      setTyping(conversationId, true);
    });

    // Handle stream end
    socket.on('chat:stream_end', (data: { message: Message }) => {
      setMessages((prev) => [...prev, data.message]);
      setStreamingContent('');
      setTyping(conversationId, false);
      setIsSending(false);
    });

    // Handle typing indicator
    socket.on('chat:typing', (data: { isTyping: boolean }) => {
      setTyping(conversationId, data.isTyping);
    });

    // Handle errors
    socket.on('chat:error', (error: { message: string }) => {
      toast.error(error.message || 'An error occurred');
      setIsSending(false);
      setStreamingContent('');
      setTyping(conversationId, false);
    });

    return () => {
      leaveConversation(conversationId);
      socket.off('connect');
      socket.off('disconnect');
      socket.off('chat:message');
      socket.off('chat:stream_chunk');
      socket.off('chat:stream_end');
      socket.off('chat:typing');
      socket.off('chat:error');
    };
  }, [isAuthenticated, accessToken, conversationId, setTyping]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  // Handle send message
  const handleSend = useCallback(async () => {
    if (!input.trim() || isSending || !user) return;

    const content = input.trim();
    setInput('');
    setIsSending(true);

    // Optimistic update - add user message immediately
    const tempMessage: Message = {
      id: `temp-${Date.now()}`,
      role: 'USER',
      content,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempMessage]);

    // Send via WebSocket
    if (isConnected) {
      socketSendMessage(conversationId, content, user.id);
    } else {
      // Fallback to REST API
      try {
        const response = await conversationsApi.sendMessage(conversationId, content);
        if (!response.success) {
          toast.error('Failed to send message');
          setIsSending(false);
        }
      } catch (error) {
        toast.error('Failed to send message');
        setIsSending(false);
      }
    }
  }, [input, isSending, isConnected, conversationId, user]);

  // Handle key press
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Handle export
  const handleExport = async (format: 'json' | 'txt') => {
    try {
      const response = await conversationsApi.export(conversationId, format);
      if (response.success) {
        toast.success(`Exported as ${format.toUpperCase()}`);
      }
    } catch {
      toast.error('Failed to export conversation');
    }
    setShowMenu(false);
  };

  // Redirect if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Please sign in</h1>
          <Link href="/login" className="text-primary hover:underline">
            Go to login
          </Link>
        </div>
      </div>
    );
  }

  if (isLoadingConversation || isLoadingMessages) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Conversation not found</h1>
          <Link href="/characters" className="text-primary hover:underline">
            Browse characters
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-space-950">
      {/* Header */}
      <header className="flex-shrink-0 bg-space-950/90 backdrop-blur-md border-b border-space-800/50">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-4">
            <Link
              href="/characters"
              className="p-2 hover:bg-space-800 rounded-lg transition-colors text-space-300 hover:text-space-100"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>

            <div className="flex items-center gap-3">
              {character?.avatarUrl ? (
                <img
                  src={character.avatarUrl}
                  alt={character.name}
                  className="w-10 h-10 rounded-full object-cover ring-2 ring-primary-500/30"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center text-white font-semibold shadow-lg shadow-primary-500/30">
                  {getInitials(character?.name || 'AI')}
                </div>
              )}
              <div>
                <h1 className="font-semibold text-space-100">{character?.name}</h1>
                <p className="text-xs text-space-400">
                  {isConnected ? (
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                      Connected
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 bg-nova-400 rounded-full animate-pulse"></span>
                      Connecting...
                    </span>
                  )}
                </p>
              </div>
            </div>
          </div>

          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-2 hover:bg-space-800 rounded-lg transition-colors text-space-300 hover:text-space-100"
            >
              <MoreVertical className="h-5 w-5" />
            </button>

            {showMenu && (
              <div className="absolute right-0 mt-2 w-48 bg-space-900/95 backdrop-blur-md border border-space-700/50 rounded-lg shadow-lg shadow-primary-500/10 py-1 z-50">
                <button
                  onClick={() => handleExport('txt')}
                  className="w-full flex items-center gap-2 px-4 py-2 text-space-200 hover:bg-space-800 transition-colors"
                >
                  <Download className="h-4 w-4" />
                  Export as TXT
                </button>
                <button
                  onClick={() => handleExport('json')}
                  className="w-full flex items-center gap-2 px-4 py-2 text-space-200 hover:bg-space-800 transition-colors"
                >
                  <Download className="h-4 w-4" />
                  Export as JSON
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6 starfield">
        {messages.length === 0 && !streamingContent && (
          <div className="text-center text-space-400 py-12">
            <Sparkles className="h-12 w-12 mx-auto mb-4 text-primary-500/50 animate-twinkle" />
            <p>Start your conversation with {character?.name}</p>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              'flex gap-3 max-w-3xl',
              message.role === 'USER' ? 'ml-auto flex-row-reverse' : ''
            )}
          >
            {message.role !== 'USER' && (
              <div className="flex-shrink-0">
                {character?.avatarUrl ? (
                  <img
                    src={character.avatarUrl}
                    alt={character.name}
                    className="w-8 h-8 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center text-white text-sm font-semibold">
                    {getInitials(character?.name || 'AI')}
                  </div>
                )}
              </div>
            )}

            <div
              className={cn(
                'rounded-2xl px-4 py-3 max-w-[80%]',
                message.role === 'USER'
                  ? 'bg-gradient-to-r from-primary-500 to-accent-500 text-white shadow-lg shadow-primary-500/20'
                  : 'bg-space-800/80 border border-space-700/50 text-space-100'
              )}
            >
              <p className="whitespace-pre-wrap">{message.content}</p>
              <p
                className={cn(
                  'text-xs mt-1',
                  message.role === 'USER'
                    ? 'text-white/70'
                    : 'text-space-400'
                )}
              >
                {formatRelativeTime(message.createdAt)}
              </p>
            </div>
          </div>
        ))}

        {/* Streaming response */}
        {streamingContent && (
          <div className="flex gap-3 max-w-3xl">
            <div className="flex-shrink-0">
              {character?.avatarUrl ? (
                <img
                  src={character.avatarUrl}
                  alt={character.name}
                  className="w-8 h-8 rounded-full object-cover"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center text-white text-sm font-semibold">
                  {getInitials(character?.name || 'AI')}
                </div>
              )}
            </div>
            <div className="bg-space-800/80 border border-space-700/50 rounded-2xl px-4 py-3 max-w-[80%] text-space-100">
              <p className="whitespace-pre-wrap">{streamingContent}</p>
              <span className="inline-block w-2 h-4 bg-primary-400 animate-pulse ml-1"></span>
            </div>
          </div>
        )}

        {/* Typing indicator */}
        {isTyping && !streamingContent && (
          <div className="flex gap-3 max-w-3xl">
            <div className="flex-shrink-0">
              {character?.avatarUrl ? (
                <img
                  src={character.avatarUrl}
                  alt={character.name}
                  className="w-8 h-8 rounded-full object-cover"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center text-white text-sm font-semibold">
                  {getInitials(character?.name || 'AI')}
                </div>
              )}
            </div>
            <div className="bg-space-800/80 border border-space-700/50 rounded-2xl px-4 py-3">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-primary-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                <span className="w-2 h-2 bg-accent-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                <span className="w-2 h-2 bg-stardust-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 border-t border-space-800/50 bg-space-950/90 backdrop-blur-md p-4">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-end gap-3">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Message ${character?.name}...`}
                rows={1}
                className="w-full resize-none rounded-xl border border-space-700 bg-space-900/50 text-space-100 placeholder:text-space-500 px-4 py-3 pr-12 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 max-h-32"
                style={{ minHeight: '48px' }}
              />
            </div>
            <button
              onClick={handleSend}
              disabled={!input.trim() || isSending}
              className={cn(
                'p-3 rounded-xl transition-all',
                input.trim() && !isSending
                  ? 'bg-gradient-to-r from-primary-500 to-accent-500 text-white hover:from-primary-400 hover:to-accent-400 shadow-lg shadow-primary-500/25'
                  : 'bg-space-800 text-space-500 cursor-not-allowed'
              )}
            >
              {isSending ? (
                <RefreshCw className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </button>
          </div>
          <p className="text-xs text-space-500 mt-2 text-center">
            Press Enter to send, Shift+Enter for new line
          </p>
        </div>
      </div>
    </div>
  );
}
