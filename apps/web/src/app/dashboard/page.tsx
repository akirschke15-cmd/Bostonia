'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Sparkles,
  MessageSquare,
  Heart,
  CreditCard,
  Settings,
  LogOut,
  Clock,
  Coins,
  Crown,
} from 'lucide-react';
import { conversationsApi, usersApi, charactersApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { cn, getInitials, formatRelativeTime } from '@/lib/utils';

interface Conversation {
  id: string;
  title: string;
  updatedAt: string;
  character: {
    id: string;
    name: string;
    avatarUrl: string | null;
  };
}

interface Favorite {
  id: string;
  character: {
    id: string;
    name: string;
    tagline: string;
    avatarUrl: string | null;
    category: string;
  };
}

export default function DashboardPage() {
  const router = useRouter();
  const { isAuthenticated, user, clearAuth } = useAuthStore();

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, router]);

  // Fetch recent conversations
  const { data: conversationsData, isLoading: isLoadingConversations } = useQuery({
    queryKey: ['conversations', user?.id],
    queryFn: () => conversationsApi.list({ limit: 5 }),
    enabled: !!user?.id,
  });

  // Fetch favorites
  const { data: favoritesData, isLoading: isLoadingFavorites } = useQuery({
    queryKey: ['favorites', user?.id],
    queryFn: () => usersApi.favorites(user!.id, { limit: 6 }),
    enabled: !!user?.id,
  });

  // Fetch credits
  const { data: creditsData } = useQuery({
    queryKey: ['credits', user?.id],
    queryFn: () => usersApi.credits(user!.id),
    enabled: !!user?.id,
  });

  const conversations = (conversationsData?.data || []) as Conversation[];
  const favorites = (favoritesData?.data || []) as Favorite[];
  const credits = (creditsData?.data as { balance: number })?.balance || user?.credits || 0;

  const handleLogout = () => {
    clearAuth();
    router.push('/');
  };

  if (!isAuthenticated || !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-sm border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-primary" />
              <span className="text-xl font-bold">Bostonia</span>
            </Link>
            <div className="flex items-center gap-4">
              <Link
                href="/characters"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                Browse Characters
              </Link>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <div className="flex items-center gap-4">
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.displayName || user.username}
                className="w-16 h-16 rounded-full object-cover"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center text-white font-bold text-xl">
                {getInitials(user.displayName || user.username)}
              </div>
            )}
            <div>
              <h1 className="text-2xl font-bold">
                Welcome back, {user.displayName || user.username}!
              </h1>
              <p className="text-muted-foreground">{user.email}</p>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Credits */}
          <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <Coins className="h-8 w-8 text-yellow-500" />
              <span className="text-xs px-2 py-1 bg-muted rounded-full">Credits</span>
            </div>
            <p className="text-3xl font-bold">{credits.toLocaleString()}</p>
            <p className="text-sm text-muted-foreground mt-1">Available balance</p>
            <Link
              href="/pricing"
              className="mt-4 inline-block text-sm text-primary hover:underline"
            >
              Buy more credits
            </Link>
          </div>

          {/* Subscription */}
          <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <Crown className="h-8 w-8 text-primary" />
              <span className="text-xs px-2 py-1 bg-muted rounded-full">Plan</span>
            </div>
            <p className="text-3xl font-bold capitalize">{user.subscriptionTier || 'Free'}</p>
            <p className="text-sm text-muted-foreground mt-1">Current plan</p>
            {user.subscriptionTier === 'FREE' && (
              <Link
                href="/pricing"
                className="mt-4 inline-block text-sm text-primary hover:underline"
              >
                Upgrade plan
              </Link>
            )}
          </div>

          {/* Conversations */}
          <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <MessageSquare className="h-8 w-8 text-green-500" />
              <span className="text-xs px-2 py-1 bg-muted rounded-full">Chats</span>
            </div>
            <p className="text-3xl font-bold">{conversations.length}</p>
            <p className="text-sm text-muted-foreground mt-1">Active conversations</p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Recent Conversations */}
          <section className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Recent Chats
              </h2>
              <Link href="/conversations" className="text-sm text-primary hover:underline">
                View all
              </Link>
            </div>

            {isLoadingConversations ? (
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="animate-pulse flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-muted" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-muted rounded w-3/4" />
                      <div className="h-3 bg-muted rounded w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : conversations.length === 0 ? (
              <div className="text-center py-8">
                <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No conversations yet</p>
                <Link
                  href="/characters"
                  className="mt-4 inline-block text-primary hover:underline"
                >
                  Start your first chat
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {conversations.map((conv) => (
                  <Link
                    key={conv.id}
                    href={`/chat/${conv.id}`}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors"
                  >
                    {conv.character.avatarUrl ? (
                      <img
                        src={conv.character.avatarUrl}
                        alt={conv.character.name}
                        className="w-10 h-10 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center text-white font-semibold text-sm">
                        {getInitials(conv.character.name)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{conv.character.name}</p>
                      <p className="text-sm text-muted-foreground truncate">{conv.title}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatRelativeTime(conv.updatedAt)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Favorites */}
          <section className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <Heart className="h-5 w-5" />
                Favorites
              </h2>
              <Link href="/favorites" className="text-sm text-primary hover:underline">
                View all
              </Link>
            </div>

            {isLoadingFavorites ? (
              <div className="grid grid-cols-2 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="animate-pulse">
                    <div className="w-full aspect-square rounded-lg bg-muted" />
                  </div>
                ))}
              </div>
            ) : favorites.length === 0 ? (
              <div className="text-center py-8">
                <Heart className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No favorites yet</p>
                <Link
                  href="/characters"
                  className="mt-4 inline-block text-primary hover:underline"
                >
                  Browse characters
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {favorites.map((fav) => (
                  <Link
                    key={fav.id}
                    href={`/characters/${fav.character.id}`}
                    className="group"
                  >
                    <div className="aspect-square rounded-lg overflow-hidden bg-muted relative">
                      {fav.character.avatarUrl ? (
                        <img
                          src={fav.character.avatarUrl}
                          alt={fav.character.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center text-white font-bold text-2xl">
                          {getInitials(fav.character.name)}
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                      <div className="absolute bottom-2 left-2 right-2">
                        <p className="text-white font-medium text-sm truncate">
                          {fav.character.name}
                        </p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Quick Actions */}
        <section className="mt-8">
          <h2 className="text-xl font-semibold mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Link
              href="/characters"
              className="flex flex-col items-center gap-2 p-6 bg-card border border-border rounded-xl hover:border-primary/50 transition-colors"
            >
              <Sparkles className="h-8 w-8 text-primary" />
              <span className="font-medium">Browse Characters</span>
            </Link>
            <Link
              href="/pricing"
              className="flex flex-col items-center gap-2 p-6 bg-card border border-border rounded-xl hover:border-primary/50 transition-colors"
            >
              <CreditCard className="h-8 w-8 text-green-500" />
              <span className="font-medium">Buy Credits</span>
            </Link>
            <Link
              href="/settings"
              className="flex flex-col items-center gap-2 p-6 bg-card border border-border rounded-xl hover:border-primary/50 transition-colors"
            >
              <Settings className="h-8 w-8 text-muted-foreground" />
              <span className="font-medium">Settings</span>
            </Link>
            <Link
              href="/help"
              className="flex flex-col items-center gap-2 p-6 bg-card border border-border rounded-xl hover:border-primary/50 transition-colors"
            >
              <MessageSquare className="h-8 w-8 text-blue-500" />
              <span className="font-medium">Help & Support</span>
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
