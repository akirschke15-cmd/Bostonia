'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Loader2, AlertCircle, Lock } from 'lucide-react';
import { SharedConversationView } from '@/components/conversations/SharedConversationView';
import { api } from '@/lib/api';

interface SharedConversationData {
  id: string;
  title: string | null;
  character: {
    id: string;
    name: string;
    avatarUrl: string | null;
    tagline?: string;
  };
  user: {
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  } | null;
  messages: {
    id: string;
    role: 'USER' | 'ASSISTANT' | 'SYSTEM';
    content: string;
    createdAt: string;
  }[];
  messageCount: number;
  sharedAt: string | null;
  shareSettings: {
    allowComments?: boolean;
    showUsername?: boolean;
  };
  viewCount: number;
}

export default function SharedConversationPage() {
  const params = useParams();
  const token = params.token as string;

  const { data, isLoading, error } = useQuery({
    queryKey: ['shared-conversation', token],
    queryFn: async () => {
      const response = await api.get<SharedConversationData>(`/api/shared/${token}`);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to load conversation');
      }
      return response.data;
    },
    enabled: !!token,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-space-950 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary-400 mx-auto mb-4" />
          <p className="text-space-400">Loading shared conversation...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-space-950 flex items-center justify-center">
        <div className="text-center max-w-md mx-4">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-space-800 flex items-center justify-center">
            {error?.message?.includes('not found') ? (
              <Lock className="h-10 w-10 text-space-500" />
            ) : (
              <AlertCircle className="h-10 w-10 text-red-400" />
            )}
          </div>
          <h1 className="text-2xl font-bold text-space-100 mb-2">
            {error?.message?.includes('not found')
              ? 'Conversation Not Found'
              : 'Something went wrong'}
          </h1>
          <p className="text-space-400 mb-6">
            {error?.message?.includes('not found')
              ? 'This conversation may have been unshared or the link is invalid.'
              : 'We couldn\'t load this conversation. Please try again later.'}
          </p>
          <Link
            href="/"
            className="inline-flex items-center justify-center px-6 py-3 bg-gradient-to-r from-primary-500 to-accent-500 hover:from-primary-400 hover:to-accent-400 text-white font-medium rounded-lg transition-all shadow-lg shadow-primary-500/25"
          >
            Go to Homepage
          </Link>
        </div>
      </div>
    );
  }

  return <SharedConversationView conversation={data} />;
}
