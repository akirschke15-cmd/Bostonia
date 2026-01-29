'use client';

import Link from 'next/link';
import { MessageCircle, MessageSquare, Search, Archive } from 'lucide-react';

interface EmptyStateProps {
  type: 'no-conversations' | 'no-results' | 'no-archived';
  searchQuery?: string;
}

export function EmptyState({ type, searchQuery }: EmptyStateProps) {
  if (type === 'no-results') {
    return (
      <div className="text-center py-16 px-4">
        <div className="w-16 h-16 bg-space-800/50 rounded-full flex items-center justify-center mx-auto mb-6">
          <Search className="h-8 w-8 text-space-500" />
        </div>
        <h2 className="text-xl font-semibold text-space-200 mb-2">No matches found</h2>
        <p className="text-space-400 max-w-md mx-auto">
          No conversations match &quot;{searchQuery}&quot;. Try a different search term or clear your filters.
        </p>
      </div>
    );
  }

  if (type === 'no-archived') {
    return (
      <div className="text-center py-16 px-4">
        <div className="w-16 h-16 bg-space-800/50 rounded-full flex items-center justify-center mx-auto mb-6">
          <Archive className="h-8 w-8 text-space-500" />
        </div>
        <h2 className="text-xl font-semibold text-space-200 mb-2">No archived conversations</h2>
        <p className="text-space-400 max-w-md mx-auto">
          Conversations you archive will appear here. Archive conversations you want to keep but don&apos;t need right now.
        </p>
      </div>
    );
  }

  return (
    <div className="text-center py-16 px-4">
      <div className="relative w-20 h-20 mx-auto mb-6">
        <div className="absolute inset-0 bg-gradient-to-br from-primary-500/20 to-accent-500/20 rounded-full animate-pulse" />
        <div className="relative w-20 h-20 bg-space-800/80 rounded-full flex items-center justify-center border border-space-700">
          <MessageCircle className="h-10 w-10 text-space-400" />
        </div>
      </div>
      <h2 className="text-2xl font-semibold text-space-100 mb-3">Start your first conversation</h2>
      <p className="text-space-400 max-w-md mx-auto mb-8">
        Browse our collection of AI characters and begin an engaging conversation. Each character has their own unique personality and expertise.
      </p>
      <Link
        href="/characters"
        className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-primary-500 to-accent-500 text-white rounded-lg hover:from-primary-400 hover:to-accent-400 transition-all shadow-lg shadow-primary-500/25 hover:shadow-primary-500/40"
      >
        <MessageSquare className="h-5 w-5" />
        Browse Characters
      </Link>
    </div>
  );
}
