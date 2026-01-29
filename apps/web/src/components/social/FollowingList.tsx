'use client';

import { useState, useEffect, useCallback } from 'react';
import { UserCheck, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn, getInitials, formatRelativeTime } from '@/lib/utils';
import { usersApi } from '@/lib/api';
import { FollowButton } from './FollowButton';
import { CompactFollowStats } from './FollowStats';

interface FollowingUser {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  role: string;
  _count: {
    characters: number;
    followers: number;
  };
  followedAt: string;
}

interface FollowingListProps {
  userId: string;
  className?: string;
  emptyMessage?: string;
  showFollowButton?: boolean;
  pageSize?: number;
  onUserClick?: (userId: string) => void;
}

export function FollowingList({
  userId,
  className,
  emptyMessage = 'Not following anyone yet',
  showFollowButton = true,
  pageSize = 10,
  onUserClick,
}: FollowingListProps) {
  const [following, setFollowing] = useState<FollowingUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchFollowing = useCallback(async (pageNum: number) => {
    setIsLoading(true);
    try {
      const response = await usersApi.getFollowing(userId, { page: pageNum, limit: pageSize });
      if (response.success && response.data) {
        setFollowing(response.data as FollowingUser[]);
        if (response.meta) {
          setTotalPages(response.meta.totalPages ?? 1);
          setTotal(response.meta.total ?? 0);
        }
      }
    } catch (error) {
      console.error('Failed to fetch following:', error);
    } finally {
      setIsLoading(false);
    }
  }, [userId, pageSize]);

  useEffect(() => {
    fetchFollowing(page);
  }, [fetchFollowing, page]);

  const handlePrevPage = () => {
    if (page > 1) setPage(page - 1);
  };

  const handleNextPage = () => {
    if (page < totalPages) setPage(page + 1);
  };

  // Handle unfollow - remove user from list
  const handleFollowChange = useCallback((unfollowedUserId: string, isFollowing: boolean) => {
    if (!isFollowing) {
      setFollowing((prev) => prev.filter((user) => user.id !== unfollowedUserId));
      setTotal((prev) => Math.max(0, prev - 1));
    }
  }, []);

  if (isLoading && following.length === 0) {
    return (
      <div className={cn('flex items-center justify-center py-12', className)}>
        <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
      </div>
    );
  }

  if (following.length === 0) {
    return (
      <div className={cn('flex flex-col items-center justify-center py-12 text-center', className)}>
        <UserCheck className="h-12 w-12 text-space-600 mb-4" />
        <p className="text-space-400">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Following count header */}
      <div className="flex items-center justify-between text-sm text-space-400">
        <span>Following {total} {total === 1 ? 'user' : 'users'}</span>
        {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
      </div>

      {/* Following list */}
      <div className="space-y-2">
        {following.map((user) => (
          <FollowingCard
            key={user.id}
            user={user}
            showFollowButton={showFollowButton}
            onUserClick={onUserClick}
            onFollowChange={(isFollowing) => handleFollowChange(user.id, isFollowing)}
          />
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 pt-4">
          <button
            onClick={handlePrevPage}
            disabled={page === 1}
            className="p-2 rounded-lg bg-space-800 border border-space-700 text-space-300 hover:bg-space-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm text-space-400">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={handleNextPage}
            disabled={page === totalPages}
            className="p-2 rounded-lg bg-space-800 border border-space-700 text-space-300 hover:bg-space-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

interface FollowingCardProps {
  user: FollowingUser;
  showFollowButton: boolean;
  onUserClick?: (userId: string) => void;
  onFollowChange?: (isFollowing: boolean) => void;
}

function FollowingCard({ user, showFollowButton, onUserClick, onFollowChange }: FollowingCardProps) {
  const handleClick = () => {
    if (onUserClick) {
      onUserClick(user.id);
    }
  };

  return (
    <div className="flex items-center gap-4 p-4 rounded-xl bg-space-900/50 border border-space-800 hover:border-space-700 transition-colors">
      {/* Avatar */}
      <button
        onClick={handleClick}
        className="flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-primary-500 rounded-full"
      >
        {user.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt={user.displayName || user.username}
            className="w-12 h-12 rounded-full object-cover border-2 border-space-700"
          />
        ) : (
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center text-white font-bold text-sm border-2 border-space-700">
            {getInitials(user.displayName || user.username)}
          </div>
        )}
      </button>

      {/* User info */}
      <div className="flex-1 min-w-0">
        <button
          onClick={handleClick}
          className="text-left focus:outline-none"
        >
          <div className="flex items-center gap-2">
            <h4 className="font-medium text-space-100 truncate hover:text-primary-400 transition-colors">
              {user.displayName || user.username}
            </h4>
            {user.role !== 'USER' && (
              <span className={cn(
                'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize',
                user.role === 'CREATOR' && 'bg-accent-500/20 text-accent-300 border border-accent-500/30',
                user.role === 'MODERATOR' && 'bg-stardust-500/20 text-stardust-300 border border-stardust-500/30',
                user.role === 'ADMIN' && 'bg-nova-500/20 text-nova-300 border border-nova-500/30'
              )}>
                {user.role.toLowerCase()}
              </span>
            )}
          </div>
          <p className="text-sm text-space-400 truncate">@{user.username}</p>
        </button>
        <div className="flex items-center gap-3 mt-1">
          <CompactFollowStats followerCount={user._count.followers} />
          {user._count.characters > 0 && (
            <span className="text-xs text-space-500">
              {user._count.characters} character{user._count.characters !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Follow button - shows "Following" since we're viewing who the user follows */}
      {showFollowButton && (
        <FollowButton
          userId={user.id}
          initialIsFollowing={true}
          size="sm"
          variant="outline"
          onFollowChange={onFollowChange}
        />
      )}
    </div>
  );
}
