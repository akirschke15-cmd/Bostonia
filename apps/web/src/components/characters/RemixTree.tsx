'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { GitFork, ChevronRight, User, Loader2 } from 'lucide-react';
import { charactersApi } from '@/lib/api';
import { cn, getInitials } from '@/lib/utils';

interface RemixChainCharacter {
  id: string;
  name: string;
  avatarUrl: string | null;
  isRemix: boolean;
  creator: {
    id: string;
    username: string;
    displayName: string | null;
  };
}

interface RemixChainResponse {
  character: RemixChainCharacter;
  ancestors: RemixChainCharacter[];
  totalDepth: number;
}

interface RemixTreeProps {
  characterId: string;
  className?: string;
}

export function RemixTree({ characterId, className }: RemixTreeProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['remixChain', characterId],
    queryFn: async () => {
      const response = await charactersApi.getRemixChain(characterId);
      if (!response.success) {
        throw new Error('Failed to fetch remix chain');
      }
      return response.data as RemixChainResponse;
    },
  });

  if (isLoading) {
    return (
      <div className={cn('flex items-center justify-center py-8', className)}>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return null;
  }

  // If there are no ancestors, this is an original character
  if (data.ancestors.length === 0) {
    return null;
  }

  // Build the tree from root (oldest ancestor) to current character
  const ancestryPath = [...data.ancestors].reverse();

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
        <GitFork className="h-4 w-4" />
        <span>Remix Ancestry ({data.totalDepth} generations)</span>
      </div>

      <div className="relative">
        {/* Vertical line connecting nodes */}
        <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-gradient-to-b from-purple-500/50 to-pink-500/50" />

        <div className="space-y-2">
          {/* Root/Original character */}
          {ancestryPath.map((ancestor, index) => (
            <RemixTreeNode
              key={ancestor.id}
              character={ancestor}
              isRoot={index === 0}
              isCurrent={false}
            />
          ))}

          {/* Current character */}
          <RemixTreeNode
            character={data.character}
            isRoot={false}
            isCurrent={true}
          />
        </div>
      </div>
    </div>
  );
}

interface RemixTreeNodeProps {
  character: RemixChainCharacter;
  isRoot: boolean;
  isCurrent: boolean;
}

function RemixTreeNode({ character, isRoot, isCurrent }: RemixTreeNodeProps) {
  return (
    <div className="relative flex items-center gap-3 pl-2">
      {/* Node indicator */}
      <div
        className={cn(
          'relative z-10 w-6 h-6 rounded-full flex items-center justify-center',
          isRoot
            ? 'bg-gradient-to-br from-yellow-400 to-orange-500'
            : isCurrent
            ? 'bg-gradient-to-br from-purple-500 to-pink-500'
            : 'bg-space-700 border border-purple-500/50'
        )}
      >
        {isRoot ? (
          <User className="h-3 w-3 text-white" />
        ) : (
          <GitFork className="h-3 w-3 text-white" />
        )}
      </div>

      {/* Character card */}
      <Link
        href={`/characters/${character.id}`}
        className={cn(
          'flex-1 flex items-center gap-3 p-3 rounded-lg transition-all',
          isCurrent
            ? 'bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30'
            : 'bg-space-800/50 hover:bg-space-700/50 border border-space-700'
        )}
      >
        {character.avatarUrl ? (
          <img
            src={character.avatarUrl}
            alt={character.name}
            className="w-10 h-10 rounded-full object-cover"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center text-white font-bold text-sm">
            {getInitials(character.name)}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium truncate">{character.name}</p>
            {isRoot && (
              <span className="px-1.5 py-0.5 text-xs bg-yellow-500/20 text-yellow-400 rounded">
                Original
              </span>
            )}
            {isCurrent && (
              <span className="px-1.5 py-0.5 text-xs bg-purple-500/20 text-purple-400 rounded">
                Current
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">
            by @{character.creator.username}
          </p>
        </div>

        <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      </Link>
    </div>
  );
}

// Component to show list of remixes
interface RemixListProps {
  characterId: string;
  className?: string;
}

export function RemixList({ characterId, className }: RemixListProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['characterRemixes', characterId],
    queryFn: async () => {
      const response = await charactersApi.getRemixes(characterId);
      if (!response.success) {
        throw new Error('Failed to fetch remixes');
      }
      return response.data as Array<{
        id: string;
        name: string;
        tagline: string;
        avatarUrl: string | null;
        category: string;
        rating: number;
        chatCount: number;
        remixCount: number;
        createdAt: string;
        creator: {
          id: string;
          username: string;
          displayName: string | null;
        };
      }>;
    },
  });

  if (isLoading) {
    return (
      <div className={cn('flex items-center justify-center py-8', className)}>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data || data.length === 0) {
    return null;
  }

  return (
    <div className={className}>
      <h3 className="flex items-center gap-2 text-lg font-semibold mb-4">
        <GitFork className="h-5 w-5 text-purple-400" />
        Community Remixes ({data.length})
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {data.map((remix) => (
          <Link
            key={remix.id}
            href={`/characters/${remix.id}`}
            className="flex items-start gap-3 p-4 rounded-lg bg-space-800/50 border border-space-700 hover:border-purple-500/50 transition-all group"
          >
            {remix.avatarUrl ? (
              <img
                src={remix.avatarUrl}
                alt={remix.name}
                className="w-12 h-12 rounded-full object-cover"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold">
                {getInitials(remix.name)}
              </div>
            )}

            <div className="flex-1 min-w-0">
              <p className="font-medium truncate group-hover:text-purple-400 transition-colors">
                {remix.name}
              </p>
              <p className="text-sm text-muted-foreground truncate">
                {remix.tagline}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                by @{remix.creator.username}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
