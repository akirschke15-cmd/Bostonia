'use client';

import { useState, useCallback } from 'react';
import { UserPlus, UserMinus, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usersApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import toast from 'react-hot-toast';

interface FollowButtonProps {
  userId: string;
  initialIsFollowing?: boolean;
  onFollowChange?: (isFollowing: boolean) => void;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'primary' | 'outline' | 'ghost';
  className?: string;
  showIcon?: boolean;
  showText?: boolean;
}

export function FollowButton({
  userId,
  initialIsFollowing = false,
  onFollowChange,
  size = 'md',
  variant = 'primary',
  className,
  showIcon = true,
  showText = true,
}: FollowButtonProps) {
  const [isFollowing, setIsFollowing] = useState(initialIsFollowing);
  const [isLoading, setIsLoading] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const currentUser = useAuthStore((state) => state.user);

  // Don't show button if viewing own profile
  if (currentUser?.id === userId) {
    return null;
  }

  const handleToggleFollow = useCallback(async () => {
    if (!currentUser) {
      toast.error('Please sign in to follow users');
      return;
    }

    // Optimistic UI update
    const wasFollowing = isFollowing;
    setIsFollowing(!wasFollowing);
    setIsLoading(true);

    try {
      if (wasFollowing) {
        const response = await usersApi.unfollow(userId);
        if (!response.success) {
          throw new Error(response.error?.message || 'Failed to unfollow');
        }
        toast.success('Unfollowed successfully');
      } else {
        const response = await usersApi.follow(userId);
        if (!response.success) {
          throw new Error(response.error?.message || 'Failed to follow');
        }
        toast.success('Following!');
      }
      onFollowChange?.(!wasFollowing);
    } catch (error) {
      // Revert optimistic update on error
      setIsFollowing(wasFollowing);
      toast.error(error instanceof Error ? error.message : 'Action failed');
    } finally {
      setIsLoading(false);
    }
  }, [currentUser, isFollowing, userId, onFollowChange]);

  const sizeClasses = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-2.5 text-base',
  };

  const iconSizes = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5',
  };

  const variantClasses = {
    primary: isFollowing
      ? 'bg-space-700 text-space-200 border border-space-600 hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/50'
      : 'bg-primary-500 text-white hover:bg-primary-600 border border-primary-500',
    outline: isFollowing
      ? 'bg-transparent text-space-200 border border-space-600 hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/50'
      : 'bg-transparent text-primary-400 border border-primary-500 hover:bg-primary-500/10',
    ghost: isFollowing
      ? 'bg-transparent text-space-300 hover:bg-red-500/20 hover:text-red-400'
      : 'bg-transparent text-primary-400 hover:bg-primary-500/10',
  };

  const getButtonText = () => {
    if (isFollowing && isHovered) return 'Unfollow';
    if (isFollowing) return 'Following';
    return 'Follow';
  };

  const getIcon = () => {
    if (isLoading) return <Loader2 className={cn(iconSizes[size], 'animate-spin')} />;
    if (isFollowing && isHovered) return <UserMinus className={iconSizes[size]} />;
    if (isFollowing) return <UserMinus className={iconSizes[size]} />;
    return <UserPlus className={iconSizes[size]} />;
  };

  return (
    <button
      onClick={handleToggleFollow}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      disabled={isLoading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed',
        sizeClasses[size],
        variantClasses[variant],
        className
      )}
    >
      {showIcon && getIcon()}
      {showText && <span>{getButtonText()}</span>}
    </button>
  );
}
