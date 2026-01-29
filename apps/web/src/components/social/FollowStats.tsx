'use client';

import { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usersApi } from '@/lib/api';

interface FollowStatsProps {
  userId: string;
  initialFollowerCount?: number;
  initialFollowingCount?: number;
  onFollowersClick?: () => void;
  onFollowingClick?: () => void;
  className?: string;
  layout?: 'horizontal' | 'vertical';
  size?: 'sm' | 'md' | 'lg';
}

interface FollowCounts {
  followerCount: number;
  followingCount: number;
}

export function FollowStats({
  userId,
  initialFollowerCount,
  initialFollowingCount,
  onFollowersClick,
  onFollowingClick,
  className,
  layout = 'horizontal',
  size = 'md',
}: FollowStatsProps) {
  const [counts, setCounts] = useState<FollowCounts>({
    followerCount: initialFollowerCount ?? 0,
    followingCount: initialFollowingCount ?? 0,
  });
  const [isLoading, setIsLoading] = useState(
    initialFollowerCount === undefined || initialFollowingCount === undefined
  );

  useEffect(() => {
    // Fetch counts if not provided
    if (initialFollowerCount === undefined || initialFollowingCount === undefined) {
      const fetchCounts = async () => {
        try {
          const response = await usersApi.getFollowStatus(userId);
          if (response.success && response.data) {
            setCounts({
              followerCount: (response.data as FollowCounts).followerCount ?? 0,
              followingCount: (response.data as FollowCounts).followingCount ?? 0,
            });
          }
        } catch (error) {
          console.error('Failed to fetch follow counts:', error);
        } finally {
          setIsLoading(false);
        }
      };
      fetchCounts();
    }
  }, [userId, initialFollowerCount, initialFollowingCount]);

  const formatCount = (count: number): string => {
    if (count >= 1000000) {
      return `${(count / 1000000).toFixed(1)}M`;
    }
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K`;
    }
    return count.toString();
  };

  const sizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  };

  const numberSizeClasses = {
    sm: 'text-sm font-semibold',
    md: 'text-base font-semibold',
    lg: 'text-lg font-bold',
  };

  const StatItem = ({
    label,
    count,
    onClick,
  }: {
    label: string;
    count: number;
    onClick?: () => void;
  }) => (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        'flex items-center gap-1.5 transition-colors',
        onClick
          ? 'hover:text-primary-400 cursor-pointer'
          : 'cursor-default',
        layout === 'vertical' && 'flex-col gap-0.5'
      )}
    >
      <span className={cn(numberSizeClasses[size], 'text-space-50')}>
        {isLoading ? '-' : formatCount(count)}
      </span>
      <span className={cn(sizeClasses[size], 'text-space-400')}>
        {label}
      </span>
    </button>
  );

  return (
    <div
      className={cn(
        'flex items-center',
        layout === 'horizontal' ? 'gap-4 md:gap-6' : 'flex-col gap-2',
        className
      )}
    >
      <StatItem
        label="Followers"
        count={counts.followerCount}
        onClick={onFollowersClick}
      />
      <StatItem
        label="Following"
        count={counts.followingCount}
        onClick={onFollowingClick}
      />
    </div>
  );
}

// Compact version for use in cards/lists
interface CompactFollowStatsProps {
  followerCount: number;
  className?: string;
}

export function CompactFollowStats({ followerCount, className }: CompactFollowStatsProps) {
  const formatCount = (count: number): string => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
  };

  return (
    <div className={cn('flex items-center gap-1 text-xs text-space-400', className)}>
      <Users className="h-3 w-3" />
      <span>{formatCount(followerCount)} followers</span>
    </div>
  );
}
