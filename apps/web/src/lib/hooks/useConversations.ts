'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { conversationsApi } from '@/lib/api';
import toast from 'react-hot-toast';
import type { ConversationData } from '@/components/conversations';
import type { SortOption, FilterOption } from '@/components/conversations';

interface Message {
  id: string;
  content: string;
  role: 'USER' | 'ASSISTANT';
  createdAt: string;
}

interface ConversationWithMessages extends ConversationData {
  messages?: Message[];
}

interface UseConversationsOptions {
  enabled?: boolean;
}

export function useConversations(options: UseConversationsOptions = {}) {
  const queryClient = useQueryClient();
  const { enabled = true } = options;

  // Fetch conversations
  const conversationsQuery = useQuery({
    queryKey: ['conversations'],
    queryFn: async () => {
      const response = await conversationsApi.list({ limit: 100 });
      return response;
    },
    enabled,
  });

  // Archive conversation mutation
  const archiveMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await conversationsApi.update(id, { status: 'archived' });
      return { id, response };
    },
    onMutate: async (id: string) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['conversations'] });

      // Snapshot previous value
      const previousConversations = queryClient.getQueryData(['conversations']);

      // Optimistically update
      queryClient.setQueryData(['conversations'], (old: any) => {
        if (!old?.data) return old;
        return {
          ...old,
          data: old.data.map((conv: ConversationData) =>
            conv.id === id ? { ...conv, status: 'ARCHIVED' } : conv
          ),
        };
      });

      return { previousConversations };
    },
    onError: (err, id, context) => {
      // Rollback on error
      queryClient.setQueryData(['conversations'], context?.previousConversations);
      toast.error('Failed to archive conversation');
    },
    onSuccess: () => {
      toast.success('Conversation archived');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  // Delete conversation mutation (soft delete by setting status to DELETED)
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await conversationsApi.update(id, { status: 'deleted' });
      return { id, response };
    },
    onMutate: async (id: string) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['conversations'] });

      // Snapshot previous value
      const previousConversations = queryClient.getQueryData(['conversations']);

      // Optimistically remove from list
      queryClient.setQueryData(['conversations'], (old: any) => {
        if (!old?.data) return old;
        return {
          ...old,
          data: old.data.filter((conv: ConversationData) => conv.id !== id),
        };
      });

      return { previousConversations };
    },
    onError: (err, id, context) => {
      // Rollback on error
      queryClient.setQueryData(['conversations'], context?.previousConversations);
      toast.error('Failed to delete conversation');
    },
    onSuccess: () => {
      toast.success('Conversation deleted');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  // Unarchive conversation mutation
  const unarchiveMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await conversationsApi.update(id, { status: 'active' });
      return { id, response };
    },
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: ['conversations'] });
      const previousConversations = queryClient.getQueryData(['conversations']);

      queryClient.setQueryData(['conversations'], (old: any) => {
        if (!old?.data) return old;
        return {
          ...old,
          data: old.data.map((conv: ConversationData) =>
            conv.id === id ? { ...conv, status: 'ACTIVE' } : conv
          ),
        };
      });

      return { previousConversations };
    },
    onError: (err, id, context) => {
      queryClient.setQueryData(['conversations'], context?.previousConversations);
      toast.error('Failed to unarchive conversation');
    },
    onSuccess: () => {
      toast.success('Conversation unarchived');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  return {
    conversations: (conversationsQuery.data?.data || []) as ConversationData[],
    isLoading: conversationsQuery.isLoading,
    isError: conversationsQuery.isError,
    error: conversationsQuery.error,
    refetch: conversationsQuery.refetch,
    archiveMutation,
    deleteMutation,
    unarchiveMutation,
  };
}

// Helper function to sort conversations
export function sortConversations(
  conversations: ConversationData[],
  sortBy: SortOption
): ConversationData[] {
  const sorted = [...conversations];

  switch (sortBy) {
    case 'recent':
      return sorted.sort(
        (a, b) =>
          new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
      );
    case 'oldest':
      return sorted.sort(
        (a, b) =>
          new Date(a.lastMessageAt).getTime() - new Date(b.lastMessageAt).getTime()
      );
    case 'alphabetical':
      return sorted.sort((a, b) =>
        a.character.name.localeCompare(b.character.name)
      );
    default:
      return sorted;
  }
}

// Helper function to filter conversations
export function filterConversations(
  conversations: ConversationData[],
  filterBy: FilterOption,
  searchQuery: string
): ConversationData[] {
  let filtered = [...conversations];

  // Apply status filter
  switch (filterBy) {
    case 'active':
      filtered = filtered.filter((c) => c.status !== 'ARCHIVED');
      break;
    case 'archived':
      filtered = filtered.filter((c) => c.status === 'ARCHIVED');
      break;
    // 'all' shows everything
  }

  // Apply search filter
  if (searchQuery.trim()) {
    const query = searchQuery.toLowerCase();
    filtered = filtered.filter(
      (c) =>
        c.character.name.toLowerCase().includes(query) ||
        (c.title && c.title.toLowerCase().includes(query)) ||
        (c.lastMessage && c.lastMessage.content.toLowerCase().includes(query))
    );
  }

  return filtered;
}
