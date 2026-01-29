'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import {
  MessageSquare,
  Search,
  Trash2,
  MoreVertical,
  Clock,
  Loader2,
  MessageCircle
} from 'lucide-react';
import { Header } from '@/components/header';
import { conversationsApi } from '@/lib/api';
import { getInitials } from '@/lib/utils';
import toast from 'react-hot-toast';

interface Character {
  id: string;
  name: string;
  avatarUrl: string | null;
}

interface Conversation {
  id: string;
  title: string | null;
  character: Character;
  lastMessageAt: string;
  messageCount: number;
  createdAt: string;
}

export default function ConversationsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => conversationsApi.list(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => conversationsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast.success('Conversation deleted');
    },
    onError: () => {
      toast.error('Failed to delete conversation');
    },
  });

  const conversations = (data?.data || []) as Conversation[];

  const filteredConversations = conversations.filter((conv) => {
    const searchLower = searchQuery.toLowerCase();
    return (
      conv.character.name.toLowerCase().includes(searchLower) ||
      (conv.title && conv.title.toLowerCase().includes(searchLower))
    );
  });

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this conversation?')) {
      deleteMutation.mutate(id);
    }
    setMenuOpen(null);
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
            <div>
              <h1 className="text-3xl font-bold">Conversations</h1>
              <p className="text-muted-foreground mt-1">
                Continue your chats with AI characters
              </p>
            </div>
            <Link
              href="/characters"
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            >
              <MessageSquare className="h-4 w-4" />
              New Chat
            </Link>
          </div>

          {/* Search */}
          <div className="relative mb-6">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Conversations List */}
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : error ? (
            <div className="text-center py-16">
              <p className="text-destructive">Failed to load conversations</p>
              <button
                onClick={() => queryClient.invalidateQueries({ queryKey: ['conversations'] })}
                className="mt-4 text-primary hover:underline"
              >
                Try again
              </button>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="text-center py-16">
              <MessageCircle className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              {searchQuery ? (
                <>
                  <h2 className="text-xl font-semibold mb-2">No matches found</h2>
                  <p className="text-muted-foreground">
                    Try a different search term
                  </p>
                </>
              ) : (
                <>
                  <h2 className="text-xl font-semibold mb-2">No conversations yet</h2>
                  <p className="text-muted-foreground mb-6">
                    Start chatting with a character to begin your first conversation
                  </p>
                  <Link
                    href="/characters"
                    className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                  >
                    <MessageSquare className="h-5 w-5" />
                    Browse Characters
                  </Link>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredConversations.map((conversation) => (
                <Link
                  key={conversation.id}
                  href={`/chat/${conversation.id}`}
                  className="block bg-card border border-border rounded-xl p-4 hover:border-primary/50 hover:shadow-md transition-all group"
                >
                  <div className="flex items-start gap-4">
                    {/* Character Avatar */}
                    {conversation.character.avatarUrl ? (
                      <img
                        src={conversation.character.avatarUrl}
                        alt={conversation.character.name}
                        className="w-12 h-12 rounded-full object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center text-white font-bold flex-shrink-0">
                        {getInitials(conversation.character.name)}
                      </div>
                    )}

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-semibold group-hover:text-primary transition-colors">
                            {conversation.character.name}
                          </h3>
                          {conversation.title && (
                            <p className="text-sm text-muted-foreground truncate">
                              {conversation.title}
                            </p>
                          )}
                        </div>

                        {/* Menu */}
                        <div className="relative">
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setMenuOpen(menuOpen === conversation.id ? null : conversation.id);
                            }}
                            className="p-1.5 rounded-lg hover:bg-muted transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </button>

                          {menuOpen === conversation.id && (
                            <div className="absolute right-0 top-full mt-1 bg-popover border border-border rounded-lg shadow-lg py-1 z-10 min-w-[140px]">
                              <button
                                onClick={(e) => handleDelete(conversation.id, e)}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-muted transition-colors"
                              >
                                <Trash2 className="h-4 w-4" />
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Meta */}
                      <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <MessageSquare className="h-3.5 w-3.5" />
                          {conversation.messageCount} messages
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {formatDistanceToNow(new Date(conversation.lastMessageAt), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
