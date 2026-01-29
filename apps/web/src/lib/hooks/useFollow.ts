'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usersApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import toast from 'react-hot-toast';

// Types
interface FollowStatus {
  isFollowing: boolean;
  followedAt: string | null;
  followerCount: number;
  followingCount: number;
}

interface FollowUser {
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

interface UseFollowOptions {
  enabled?: boolean;
}

/**
 * Hook to manage follow state for a specific user
 */
export function useFollow(userId: string, options: UseFollowOptions = {}) {
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((state) => state.user);
  const { enabled = true } = options;

  // Query for follow status
  const followStatusQuery = useQuery({
    queryKey: ['followStatus', userId],
    queryFn: async () => {
      const response = await usersApi.getFollowStatus(userId);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to fetch follow status');
      }
      return response.data as FollowStatus;
    },
    enabled: enabled && !!userId,
    staleTime: 30000, // 30 seconds
  });

  // Follow mutation
  const followMutation = useMutation({
    mutationFn: async () => {
      const response = await usersApi.follow(userId);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to follow user');
      }
      return response.data;
    },
    onMutate: async () => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['followStatus', userId] });

      // Snapshot previous value
      const previousStatus = queryClient.getQueryData<FollowStatus>(['followStatus', userId]);

      // Optimistically update
      queryClient.setQueryData<FollowStatus>(['followStatus', userId], (old) => ({
        isFollowing: true,
        followedAt: new Date().toISOString(),
        followerCount: (old?.followerCount ?? 0) + 1,
        followingCount: old?.followingCount ?? 0,
      }));

      return { previousStatus };
    },
    onError: (err, _variables, context) => {
      // Rollback on error
      if (context?.previousStatus) {
        queryClient.setQueryData(['followStatus', userId], context.previousStatus);
      }
      toast.error(err instanceof Error ? err.message : 'Failed to follow user');
    },
    onSuccess: () => {
      toast.success('Following!');
    },
    onSettled: () => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['followStatus', userId] });
      queryClient.invalidateQueries({ queryKey: ['followers', userId] });
      if (currentUser?.id) {
        queryClient.invalidateQueries({ queryKey: ['following', currentUser.id] });
      }
    },
  });

  // Unfollow mutation
  const unfollowMutation = useMutation({
    mutationFn: async () => {
      const response = await usersApi.unfollow(userId);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to unfollow user');
      }
      return response.data;
    },
    onMutate: async () => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['followStatus', userId] });

      // Snapshot previous value
      const previousStatus = queryClient.getQueryData<FollowStatus>(['followStatus', userId]);

      // Optimistically update
      queryClient.setQueryData<FollowStatus>(['followStatus', userId], (old) => ({
        isFollowing: false,
        followedAt: null,
        followerCount: Math.max(0, (old?.followerCount ?? 1) - 1),
        followingCount: old?.followingCount ?? 0,
      }));

      return { previousStatus };
    },
    onError: (err, _variables, context) => {
      // Rollback on error
      if (context?.previousStatus) {
        queryClient.setQueryData(['followStatus', userId], context.previousStatus);
      }
      toast.error(err instanceof Error ? err.message : 'Failed to unfollow user');
    },
    onSuccess: () => {
      toast.success('Unfollowed');
    },
    onSettled: () => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['followStatus', userId] });
      queryClient.invalidateQueries({ queryKey: ['followers', userId] });
      if (currentUser?.id) {
        queryClient.invalidateQueries({ queryKey: ['following', currentUser.id] });
      }
    },
  });

  // Toggle follow
  const toggleFollow = () => {
    if (!currentUser) {
      toast.error('Please sign in to follow users');
      return;
    }

    if (currentUser.id === userId) {
      toast.error('Cannot follow yourself');
      return;
    }

    if (followStatusQuery.data?.isFollowing) {
      unfollowMutation.mutate();
    } else {
      followMutation.mutate();
    }
  };

  return {
    isFollowing: followStatusQuery.data?.isFollowing ?? false,
    followedAt: followStatusQuery.data?.followedAt ?? null,
    followerCount: followStatusQuery.data?.followerCount ?? 0,
    followingCount: followStatusQuery.data?.followingCount ?? 0,
    isLoading: followStatusQuery.isLoading,
    isMutating: followMutation.isPending || unfollowMutation.isPending,
    toggleFollow,
    follow: () => followMutation.mutate(),
    unfollow: () => unfollowMutation.mutate(),
  };
}

/**
 * Hook to fetch a user's followers list
 */
export function useFollowers(userId: string, options: { page?: number; limit?: number; enabled?: boolean } = {}) {
  const { page = 1, limit = 20, enabled = true } = options;

  return useQuery({
    queryKey: ['followers', userId, { page, limit }],
    queryFn: async () => {
      const response = await usersApi.getFollowers(userId, { page, limit });
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to fetch followers');
      }
      return {
        followers: response.data as FollowUser[],
        meta: response.meta,
      };
    },
    enabled: enabled && !!userId,
  });
}

/**
 * Hook to fetch users that a user is following
 */
export function useFollowing(userId: string, options: { page?: number; limit?: number; enabled?: boolean } = {}) {
  const { page = 1, limit = 20, enabled = true } = options;

  return useQuery({
    queryKey: ['following', userId, { page, limit }],
    queryFn: async () => {
      const response = await usersApi.getFollowing(userId, { page, limit });
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to fetch following');
      }
      return {
        following: response.data as FollowUser[],
        meta: response.meta,
      };
    },
    enabled: enabled && !!userId,
  });
}
