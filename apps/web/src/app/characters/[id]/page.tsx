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
  GitFork,
} from 'lucide-react';
import { charactersApi, conversationsApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { cn, getInitials } from '@/lib/utils';
import { RemixButton, RemixBadge, RemixTree, RemixList } from '@/components/characters';
import toast from 'react-hot-toast';

interface ParentCharacter {
  id: string;
  name: string;
  avatarUrl: string | null;
  creator: {
    id: string;
    username: string;
    displayName: string | null;
  };
}

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
  isRemix: boolean;
  remixCount: number;
  allowRemix: boolean;
  parentCharacter?: ParentCharacter;
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
        {/* Remix Attribution Banner (if this is a remix) */}
        {character.isRemix && character.parentCharacter && (
          <div className="mb-6">
            <RemixBadge parentCharacter={character.parentCharacter} variant="full" />
          </div>
        )}

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
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <h1 className="text-3xl font-bold">{character.name}</h1>
              {character.isFeatured && (
                <span className="flex items-center gap-1 px-2 py-1 bg-yellow-500/10 text-yellow-600 rounded-full text-sm">
                  <Sparkles className="h-4 w-4" />
                  Featured
                </span>
              )}
              {character.isRemix && (
                <span className="flex items-center gap-1 px-2 py-1 bg-purple-500/10 text-purple-400 rounded-full text-sm">
                  <GitFork className="h-4 w-4" />
                  Remix
                </span>
              )}
            </div>

            <p className="text-xl text-muted-foreground mb-4">{character.tagline}</p>

            {/* Stats */}
            <div className="flex items-center gap-6 mb-6 flex-wrap">
              <span className="flex items-center gap-2">
                <Star className="h-5 w-5 text-yellow-500" />
                <span className="font-semibold">{character.rating.toFixed(1)}</span>
              </span>
              <span className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-muted-foreground" />
                <span>{character.chatCount.toLocaleString()} chats</span>
              </span>
              {character.remixCount > 0 && (
                <span className="flex items-center gap-2 text-purple-400">
                  <GitFork className="h-5 w-5" />
                  <span>{character.remixCount.toLocaleString()} remixes</span>
                </span>
              )}
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
            <div className="flex items-center gap-4 flex-wrap">
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

              {/* Remix Button */}
              <RemixButton
                characterId={characterId}
                characterName={character.name}
                allowRemix={character.allowRemix}
              />

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

            {/* Remix Ancestry Tree (if this is a remix) */}
            {character.isRemix && (
              <section className="bg-card border border-border rounded-xl p-6">
                <RemixTree characterId={characterId} />
              </section>
            )}

            {/* Community Remixes (if this character has been remixed) */}
            {character.remixCount > 0 && (
              <section className="bg-card border border-border rounded-xl p-6">
                <RemixList characterId={characterId} />
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

            {/* Remix Stats Section */}
            <section className="bg-card border border-border rounded-xl p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <GitFork className="h-5 w-5 text-purple-400" />
                Remix Info
              </h2>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Times Remixed</span>
                  <span className="font-semibold">{character.remixCount}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Allow Remixing</span>
                  <span className={cn(
                    'px-2 py-1 rounded text-xs font-medium',
                    character.allowRemix
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-red-500/20 text-red-400'
                  )}>
                    {character.allowRemix ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
                {character.isRemix && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Type</span>
                    <span className="px-2 py-1 rounded text-xs font-medium bg-purple-500/20 text-purple-400">
                      Remix
                    </span>
                  </div>
                )}
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
