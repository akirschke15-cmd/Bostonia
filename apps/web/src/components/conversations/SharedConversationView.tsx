'use client';

import Link from 'next/link';
import { Eye, MessageSquare, Calendar, User as UserIcon } from 'lucide-react';
import { cn, getInitials, formatDate, formatRelativeTime } from '@/lib/utils';

interface Message {
  id: string;
  role: 'USER' | 'ASSISTANT' | 'SYSTEM';
  content: string;
  createdAt: string;
}

interface Character {
  id: string;
  name: string;
  avatarUrl: string | null;
  tagline?: string;
}

interface User {
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

interface SharedConversation {
  id: string;
  title: string | null;
  character: Character;
  user: User | null;
  messages: Message[];
  messageCount: number;
  sharedAt: string | null;
  viewCount: number;
}

interface SharedConversationViewProps {
  conversation: SharedConversation;
}

export function SharedConversationView({ conversation }: SharedConversationViewProps) {
  const { character, user, messages, title, messageCount, sharedAt, viewCount } = conversation;

  return (
    <div className="min-h-screen bg-space-950">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-space-950/90 backdrop-blur-md border-b border-space-800/50">
        <div className="max-w-[800px] mx-auto px-4 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              {/* Character Avatar */}
              {character.avatarUrl ? (
                <img
                  src={character.avatarUrl}
                  alt={character.name}
                  className="w-12 h-12 rounded-full object-cover ring-2 ring-primary-500/30"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center text-white font-bold shadow-lg shadow-primary-500/30">
                  {getInitials(character.name)}
                </div>
              )}

              <div>
                <h1 className="text-lg font-semibold text-space-100">
                  {title || `Chat with ${character.name}`}
                </h1>
                <div className="flex items-center gap-3 mt-1 text-sm text-space-400">
                  <Link
                    href={`/characters/${character.id}`}
                    className="hover:text-primary-400 transition-colors"
                  >
                    {character.name}
                  </Link>
                  {user && (
                    <>
                      <span className="text-space-600">|</span>
                      <span className="flex items-center gap-1">
                        <UserIcon className="h-3.5 w-3.5" />
                        {user.displayName || user.username}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-4 text-sm text-space-400">
              <span className="flex items-center gap-1.5">
                <MessageSquare className="h-4 w-4" />
                {messageCount}
              </span>
              <span className="flex items-center gap-1.5">
                <Eye className="h-4 w-4" />
                {viewCount}
              </span>
              {sharedAt && (
                <span className="flex items-center gap-1.5 hidden sm:flex">
                  <Calendar className="h-4 w-4" />
                  {formatRelativeTime(sharedAt)}
                </span>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Messages */}
      <main className="max-w-[800px] mx-auto px-4 py-6">
        <div className="space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                'flex gap-3',
                message.role === 'USER' ? 'justify-end' : 'justify-start'
              )}
            >
              {/* Avatar for assistant */}
              {message.role !== 'USER' && (
                <div className="flex-shrink-0 self-end mb-1">
                  {character.avatarUrl ? (
                    <img
                      src={character.avatarUrl}
                      alt={character.name}
                      className="w-8 h-8 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center text-white text-xs font-semibold">
                      {getInitials(character.name)}
                    </div>
                  )}
                </div>
              )}

              {/* Message bubble */}
              <div
                className={cn(
                  'rounded-2xl px-4 py-3 max-w-[80%]',
                  message.role === 'USER'
                    ? 'bg-gradient-to-r from-primary-500 to-accent-500 text-white rounded-br-md'
                    : 'bg-space-800/80 border border-space-700/50 text-space-100 rounded-bl-md'
                )}
              >
                <p className="whitespace-pre-wrap text-[15px] leading-relaxed">
                  {message.content}
                </p>
                <p
                  className={cn(
                    'text-xs mt-2',
                    message.role === 'USER' ? 'text-white/60' : 'text-space-500'
                  )}
                >
                  {formatRelativeTime(message.createdAt)}
                </p>
              </div>

              {/* Avatar for user */}
              {message.role === 'USER' && user && (
                <div className="flex-shrink-0 self-end mb-1">
                  {user.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt={user.displayName || user.username}
                      className="w-8 h-8 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-space-700 flex items-center justify-center text-space-300 text-xs font-semibold">
                      {getInitials(user.displayName || user.username)}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* End of conversation notice */}
        <div className="mt-8 pt-8 border-t border-space-800 text-center">
          <p className="text-space-500 text-sm">End of shared conversation</p>
          <div className="mt-4 flex items-center justify-center gap-4">
            <Link
              href={`/characters/${character.id}`}
              className="px-4 py-2 bg-primary-500/10 text-primary-400 hover:bg-primary-500/20 rounded-lg transition-colors text-sm font-medium"
            >
              View {character.name}
            </Link>
            <Link
              href="/"
              className="px-4 py-2 bg-space-800 text-space-300 hover:bg-space-700 rounded-lg transition-colors text-sm font-medium"
            >
              Explore Bostonia
            </Link>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-space-800 mt-12">
        <div className="max-w-[800px] mx-auto px-4 py-6 text-center">
          <p className="text-space-500 text-sm">
            Shared via{' '}
            <Link href="/" className="text-primary-400 hover:underline">
              Bostonia
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
