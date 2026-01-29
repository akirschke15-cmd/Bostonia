'use client';

import { useState, useEffect, useCallback } from 'react';
import { Users, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn, getInitials, formatRelativeTime } from '@/lib/utils';
import { usersApi } from '@/lib/api';
import { FollowButton } from './FollowButton';
import { CompactFollowStats } from './FollowStats';

interface FollowerUser {
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

interface FollowersListProps {
  userId: string;
  className?: string;
  emptyMessage?: string;
  showFollowButton?: boolean;
  pageSize?: number;
  onUserClick?: (userId: string) => void;
}

export function FollowersList({
  userId,
  className,
  emptyMessage = 'No followers yet',
  showFollowButton = true,
  pageSize = 10,
  onUserClick,
}: FollowersListProps) {
  const [followers, setFollowers] = useState<FollowerUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchFollowers = useCallback(async (pageNum: number) => {
    setIsLoading(true);
    try {
      const response = await usersApi.getFollowers(userId, { page: pageNum, limit: pageSize });
      if (response.success && response.data) {
        setFollowers(response.data as FollowerUser[]);
        if (response.meta) {
          setTotalPages(response.meta.totalPages ?? 1);
          setTotal(response.meta.total ?? 0);
        }
      }
    } catch (error) {
      console.error('Failed to fetch followers:', error);
    } finally {
      setIsLoading(false);
    }
  }, [userId, pageSize]);

  useEffect(() => {
    fetchFollowers(page);
  }, [fetchFollowers, page]);

  const handlePrevPage = () => {
    if (page > 1) setPage(page - 1);
  };

  const handleNextPage = () => {
    if (page < totalPages) setPage(page + 1);
  };

  if (isLoading && followers.length === 0) {
    return (
      <div className={cn('flex items-center justify-center py-12', className)}>
        <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
      </div>
    );
  }

  if (followers.length === 0) {
    return (
      <div className={cn('flex flex-col items-center justify-center py-12 text-center', className)}>
        <Users className="h-12 w-12 text-space-600 mb-4" />
        <p className="text-space-400">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Follower count header */}
      <div className="flex items-center justify-between text-sm text-space-400">
        <span>{total} {total === 1 ? 'follower' : 'followers'}</span>
        {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
      </div>

      {/* Followers list */}
      <div className="space-y-2">
        {followers.map((follower) => (
          <FollowerCard
            key={follower.id}
            user={follower}
            showFollowButton={showFollowButton}
            onUserClick={onUserClick}
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

interface FollowerCardProps {
  user: FollowerUser;
  showFollowButton: boolean;
  onUserClick?: (userId: string) => void;
}

function FollowerCard({ user, showFollowButton, onUserClick }: FollowerCardProps) {
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
          <h4 className="font-medium text-space-100 truncate hover:text-primary-400 transition-colors">
            {user.displayName || user.username}
          </h4>
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

      {/* Follow button */}
      {showFollowButton && (
        <FollowButton
          userId={user.id}
          size="sm"
          variant="outline"
        />
      )}
    </div>
  );
}
