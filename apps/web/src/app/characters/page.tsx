'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Search, Star, MessageSquare, Sparkles, Filter } from 'lucide-react';
import { charactersApi } from '@/lib/api';
import { cn, getInitials } from '@/lib/utils';

interface Character {
  id: string;
  name: string;
  tagline: string;
  avatarUrl: string | null;
  category: string;
  tags: string[];
  rating: number;
  chatCount: number;
  isFeatured: boolean;
}

export default function CharactersPage() {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const { data: charactersData, isLoading } = useQuery({
    queryKey: ['characters', search, selectedCategory],
    queryFn: () =>
      charactersApi.list({
        query: search || undefined,
        category: selectedCategory || undefined,
        limit: 24,
      }),
  });

  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: () => charactersApi.categories(),
  });

  const characters = (charactersData?.data || []) as Character[];
  const categories = (categoriesData?.data || []) as { name: string; count: number }[];

  return (
    <div className="min-h-screen bg-space-950 starfield">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-space-950/90 backdrop-blur-md border-b border-space-800/50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2 group">
              <Sparkles className="h-6 w-6 text-primary-400 group-hover:text-accent-400 transition-colors" />
              <span className="text-xl font-bold bg-gradient-to-r from-primary-400 to-accent-400 bg-clip-text text-transparent">Bostonia</span>
            </Link>
            <div className="flex items-center gap-4">
              <Link
                href="/login"
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-primary-500 to-accent-500 text-white hover:from-primary-400 hover:to-accent-400 transition-all shadow-lg shadow-primary-500/25"
              >
                Sign In
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Search and Filters */}
        <div className="mb-8">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-space-400" />
              <input
                type="text"
                placeholder="Search characters..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-lg border border-space-700 bg-space-900/50 text-space-100 placeholder:text-space-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0">
              <button
                onClick={() => setSelectedCategory(null)}
                className={cn(
                  'px-4 py-2 rounded-lg whitespace-nowrap transition-all',
                  !selectedCategory
                    ? 'bg-gradient-to-r from-primary-500 to-accent-500 text-white shadow-lg shadow-primary-500/25'
                    : 'bg-space-800 text-space-300 hover:bg-space-700 border border-space-700'
                )}
              >
                All
              </button>
              {categories.slice(0, 6).map((cat) => (
                <button
                  key={cat.name}
                  onClick={() => setSelectedCategory(cat.name)}
                  className={cn(
                    'px-4 py-2 rounded-lg whitespace-nowrap transition-all',
                    selectedCategory === cat.name
                      ? 'bg-gradient-to-r from-primary-500 to-accent-500 text-white shadow-lg shadow-primary-500/25'
                      : 'bg-space-800 text-space-300 hover:bg-space-700 border border-space-700'
                  )}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Character Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="cosmic-card rounded-xl p-4 animate-pulse"
              >
                <div className="flex items-start gap-4">
                  <div className="w-16 h-16 rounded-full bg-space-700" />
                  <div className="flex-1 space-y-2">
                    <div className="h-5 bg-space-700 rounded w-3/4" />
                    <div className="h-4 bg-space-700 rounded w-full" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : characters.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-space-400 text-lg">No characters found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {characters.map((character) => (
              <Link
                key={character.id}
                href={`/characters/${character.id}`}
                className="group cosmic-card rounded-xl p-4 hover:shadow-lg hover:shadow-primary-500/20 transition-all"
              >
                <div className="flex items-start gap-4">
                  {character.avatarUrl ? (
                    <img
                      src={character.avatarUrl}
                      alt={character.name}
                      className="w-16 h-16 rounded-full object-cover ring-2 ring-space-600 group-hover:ring-primary-500/50"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-primary-500/30">
                      {getInitials(character.name)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold truncate text-space-100 group-hover:text-primary-400 transition-colors">
                        {character.name}
                      </h3>
                      {character.isFeatured && (
                        <Sparkles className="h-4 w-4 text-nova-400 flex-shrink-0 animate-twinkle" />
                      )}
                    </div>
                    <p className="text-sm text-space-400 line-clamp-2 mt-1">
                      {character.tagline}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4 mt-4 text-sm text-space-400">
                  <span className="flex items-center gap-1">
                    <Star className="h-4 w-4 text-nova-400" />
                    {character.rating.toFixed(1)}
                  </span>
                  <span className="flex items-center gap-1">
                    <MessageSquare className="h-4 w-4" />
                    {character.chatCount.toLocaleString()}
                  </span>
                  <span className="bg-space-800 border border-space-700 px-2 py-0.5 rounded text-xs text-space-300">
                    {character.category}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
