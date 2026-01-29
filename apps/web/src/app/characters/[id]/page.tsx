'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  ArrowLeft,
  Star,
  MessageSquare,
  Heart,
  Sparkles,
  Share2,
  Play,
} from 'lucide-react';
import { charactersApi, conversationsApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { cn, getInitials } from '@/lib/utils';
import toast from 'react-hot-toast';

interface Character {
  id: string;
  name: string;
  tagline: string;
  description: string;
  avatarUrl: string | null;
  category: string;
  tags: string[];
  rating: number;
  chatCount: number;
  isFeatured: boolean;
  visibility: string;
  personalityData: {
    persona: string;
    scenario: string;
    greeting: string;
    exampleDialogue: string;
  };
  creator: {
    id: string;
    username: string;
    displayName: string | null;
  };
}

export default function CharacterDetailPage() {
  const params = useParams();
  const router = useRouter();
  const characterId = params.id as string;
  const { isAuthenticated, user } = useAuthStore();
  const [isStartingChat, setIsStartingChat] = useState(false);

  const { data: characterData, isLoading } = useQuery({
    queryKey: ['character', characterId],
    queryFn: () => charactersApi.get(characterId),
    enabled: !!characterId,
  });

  const startChatMutation = useMutation({
    mutationFn: () =>
      conversationsApi.create({
        characterId,
        title: `Chat with ${character?.name}`,
      }),
    onSuccess: (response) => {
      if (response.success && response.data) {
        const conversation = response.data as { id: string };
        router.push(`/chat/${conversation.id}`);
      } else {
        toast.error('Failed to start conversation');
      }
    },
    onError: () => {
      toast.error('Failed to start conversation');
    },
  });

  const favoriteMutation = useMutation({
    mutationFn: () => charactersApi.favorite(characterId),
    onSuccess: () => {
      toast.success('Added to favorites');
    },
  });

  const character = characterData?.data as Character | undefined;

  const handleStartChat = async () => {
    if (!isAuthenticated) {
      toast.error('Please sign in to start a chat');
      router.push('/login');
      return;
    }
    setIsStartingChat(true);
    startChatMutation.mutate();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <div className="animate-pulse">
            <div className="h-8 w-32 bg-muted rounded mb-8" />
            <div className="flex flex-col md:flex-row gap-8">
              <div className="w-48 h-48 rounded-full bg-muted" />
              <div className="flex-1 space-y-4">
                <div className="h-10 w-64 bg-muted rounded" />
                <div className="h-6 w-full bg-muted rounded" />
                <div className="h-24 w-full bg-muted rounded" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!character) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Character not found</h1>
          <Link href="/characters" className="text-primary hover:underline">
            Back to characters
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-sm border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link href="/characters" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-5 w-5" />
              <span>Back to characters</span>
            </Link>
            <Link href="/" className="flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-primary" />
              <span className="text-xl font-bold">Bostonia</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Character Header */}
        <div className="flex flex-col md:flex-row gap-8 mb-8">
          {/* Avatar */}
          <div className="flex-shrink-0">
            {character.avatarUrl ? (
              <img
                src={character.avatarUrl}
                alt={character.name}
                className="w-48 h-48 rounded-full object-cover border-4 border-primary/20"
              />
            ) : (
              <div className="w-48 h-48 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center text-white font-bold text-5xl border-4 border-primary/20">
                {getInitials(character.name)}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold">{character.name}</h1>
              {character.isFeatured && (
                <span className="flex items-center gap-1 px-2 py-1 bg-yellow-500/10 text-yellow-600 rounded-full text-sm">
                  <Sparkles className="h-4 w-4" />
                  Featured
                </span>
              )}
            </div>

            <p className="text-xl text-muted-foreground mb-4">{character.tagline}</p>

            {/* Stats */}
            <div className="flex items-center gap-6 mb-6">
              <span className="flex items-center gap-2">
                <Star className="h-5 w-5 text-yellow-500" />
                <span className="font-semibold">{character.rating.toFixed(1)}</span>
              </span>
              <span className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-muted-foreground" />
                <span>{character.chatCount.toLocaleString()} chats</span>
              </span>
              <span className="bg-muted px-3 py-1 rounded-full text-sm">
                {character.category}
              </span>
            </div>

            {/* Tags */}
            <div className="flex flex-wrap gap-2 mb-6">
              {character.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-3 py-1 bg-primary/10 text-primary rounded-full text-sm"
                >
                  {tag}
                </span>
              ))}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-4">
              <button
                onClick={handleStartChat}
                disabled={isStartingChat || startChatMutation.isPending}
                className={cn(
                  'flex items-center gap-2 px-6 py-3 rounded-lg font-semibold transition-all',
                  'bg-primary text-primary-foreground hover:bg-primary/90',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                <Play className="h-5 w-5" />
                {isStartingChat || startChatMutation.isPending ? 'Starting...' : 'Start Chat'}
              </button>
              <button
                onClick={() => favoriteMutation.mutate()}
                disabled={!isAuthenticated}
                className="flex items-center gap-2 px-4 py-3 rounded-lg border border-border hover:bg-muted transition-colors disabled:opacity-50"
              >
                <Heart className="h-5 w-5" />
              </button>
              <button className="flex items-center gap-2 px-4 py-3 rounded-lg border border-border hover:bg-muted transition-colors">
                <Share2 className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Description */}
        <div className="grid md:grid-cols-3 gap-8">
          <div className="md:col-span-2 space-y-6">
            <section className="bg-card border border-border rounded-xl p-6">
              <h2 className="text-xl font-semibold mb-4">About</h2>
              <p className="text-muted-foreground whitespace-pre-wrap">
                {character.description}
              </p>
            </section>

            {character.personalityData?.persona && (
              <section className="bg-card border border-border rounded-xl p-6">
                <h2 className="text-xl font-semibold mb-4">Personality</h2>
                <p className="text-muted-foreground whitespace-pre-wrap">
                  {character.personalityData.persona}
                </p>
              </section>
            )}

            {character.personalityData?.scenario && (
              <section className="bg-card border border-border rounded-xl p-6">
                <h2 className="text-xl font-semibold mb-4">Scenario</h2>
                <p className="text-muted-foreground whitespace-pre-wrap">
                  {character.personalityData.scenario}
                </p>
              </section>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <section className="bg-card border border-border rounded-xl p-6">
              <h2 className="text-lg font-semibold mb-4">Creator</h2>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center text-white font-semibold">
                  {getInitials(character.creator?.displayName || character.creator?.username || 'U')}
                </div>
                <div>
                  <p className="font-medium">
                    {character.creator?.displayName || character.creator?.username || 'Unknown'}
                  </p>
                  <p className="text-sm text-muted-foreground">@{character.creator?.username}</p>
                </div>
              </div>
            </section>

            {character.personalityData?.greeting && (
              <section className="bg-card border border-border rounded-xl p-6">
                <h2 className="text-lg font-semibold mb-4">Greeting Preview</h2>
                <div className="bg-muted/50 rounded-lg p-4">
                  <p className="text-sm italic text-muted-foreground">
                    "{character.personalityData.greeting.slice(0, 200)}
                    {character.personalityData.greeting.length > 200 ? '...' : ''}"
                  </p>
                </div>
              </section>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
