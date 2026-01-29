'use client';

import Link from 'next/link';
import {
  MessageSquare,
  Clock,
  MoreVertical,
  Trash2,
  Archive,
  ExternalLink,
} from 'lucide-react';
import { cn, getInitials, formatRelativeTime, truncate } from '@/lib/utils';

interface Character {
  id: string;
  name: string;
  avatarUrl: string | null;
}

interface Message {
  id: string;
  content: string;
  role: 'USER' | 'ASSISTANT';
  createdAt: string;
}

export interface ConversationData {
  id: string;
  title: string | null;
  character: Character;
  lastMessageAt: string;
  messageCount: number;
  createdAt: string;
  status: string;
  lastMessage?: Message | null;
  hasUnread?: boolean;
}

interface ConversationCardProps {
  conversation: ConversationData;
  isMenuOpen: boolean;
  onMenuToggle: () => void;
  onDelete: (e: React.MouseEvent) => void;
  onArchive: (e: React.MouseEvent) => void;
  isDeleting?: boolean;
  isArchiving?: boolean;
}

export function ConversationCard({
  conversation,
  isMenuOpen,
  onMenuToggle,
  onDelete,
  onArchive,
  isDeleting,
  isArchiving,
}: ConversationCardProps) {
  const lastMessagePreview = conversation.lastMessage
    ? truncate(conversation.lastMessage.content, 80)
    : null;

  return (
    <div
      className={cn(
        'relative bg-card border rounded-xl transition-all group',
        conversation.hasUnread
          ? 'border-primary/50 shadow-md shadow-primary/10'
          : 'border-border hover:border-primary/30',
        (isDeleting || isArchiving) && 'opacity-50 pointer-events-none'
      )}
    >
      <Link
        href={`/chat/${conversation.id}`}
        className="block p-4"
      >
        <div className="flex items-start gap-4">
          {/* Character Avatar */}
          <div className="relative flex-shrink-0">
            {conversation.character.avatarUrl ? (
              <img
                src={conversation.character.avatarUrl}
                alt={conversation.character.name}
                className="w-12 h-12 rounded-full object-cover ring-2 ring-space-600 group-hover:ring-primary-500/50 transition-all"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center text-white font-bold shadow-lg shadow-primary-500/30">
                {getInitials(conversation.character.name)}
              </div>
            )}
            {conversation.hasUnread && (
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-primary rounded-full ring-2 ring-card animate-pulse" />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className={cn(
                    'font-semibold truncate transition-colors',
                    conversation.hasUnread ? 'text-primary' : 'text-space-100 group-hover:text-primary'
                  )}>
                    {conversation.character.name}
                  </h3>
                  {conversation.status === 'ARCHIVED' && (
                    <span className="px-2 py-0.5 text-xs bg-space-700 text-space-400 rounded-full">
                      Archived
                    </span>
                  )}
                </div>
                {conversation.title && (
                  <p className="text-sm text-muted-foreground truncate">
                    {conversation.title}
                  </p>
                )}
              </div>
            </div>

            {/* Last message preview */}
            {lastMessagePreview && (
              <p className={cn(
                'text-sm mt-2 line-clamp-2',
                conversation.hasUnread ? 'text-space-200' : 'text-space-400'
              )}>
                {conversation.lastMessage?.role === 'USER' && (
                  <span className="text-space-500">You: </span>
                )}
                {lastMessagePreview}
              </p>
            )}

            {/* Meta */}
            <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <MessageSquare className="h-3.5 w-3.5" />
                {conversation.messageCount} messages
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {formatRelativeTime(conversation.lastMessageAt)}
              </span>
            </div>
          </div>
        </div>
      </Link>

      {/* Menu Button */}
      <div className="absolute top-4 right-4">
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onMenuToggle();
          }}
          className="p-1.5 rounded-lg hover:bg-muted transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
          aria-label="Open menu"
        >
          <MoreVertical className="h-4 w-4 text-space-400" />
        </button>

        {/* Dropdown Menu */}
        {isMenuOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onMenuToggle();
              }}
            />
            <div className="absolute right-0 top-full mt-1 bg-space-900/95 backdrop-blur-md border border-space-700/50 rounded-lg shadow-lg shadow-primary-500/10 py-1 z-50 min-w-[160px]">
              <Link
                href={`/chat/${conversation.id}`}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-space-200 hover:bg-space-800 transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="h-4 w-4" />
                Continue Chat
              </Link>
              {conversation.status !== 'ARCHIVED' && (
                <button
                  onClick={onArchive}
                  disabled={isArchiving}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-space-200 hover:bg-space-800 transition-colors disabled:opacity-50"
                >
                  <Archive className="h-4 w-4" />
                  {isArchiving ? 'Archiving...' : 'Archive'}
                </button>
              )}
              <button
                onClick={onDelete}
                disabled={isDeleting}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-space-800 transition-colors disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
