import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: string;
  credits: number;
  subscriptionTier: string;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  setAuth: (user: User, accessToken: string, refreshToken: string) => void;
  clearAuth: () => void;
  updateUser: (updates: Partial<User>) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      setAuth: (user, accessToken, refreshToken) =>
        set({ user, accessToken, refreshToken, isAuthenticated: true }),
      clearAuth: () =>
        set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false }),
      updateUser: (updates) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...updates } : null,
        })),
    }),
    {
      name: 'bostonia-auth',
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

interface UIState {
  theme: 'light' | 'dark' | 'system';
  sidebarOpen: boolean;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      theme: 'system',
      sidebarOpen: true,
      setTheme: (theme) => set({ theme }),
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
    }),
    {
      name: 'bostonia-ui',
    }
  )
);

interface ChatState {
  activeConversationId: string | null;
  typingIndicators: Record<string, boolean>;
  setActiveConversation: (id: string | null) => void;
  setTyping: (conversationId: string, isTyping: boolean) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  activeConversationId: null,
  typingIndicators: {},
  setActiveConversation: (id) => set({ activeConversationId: id }),
  setTyping: (conversationId, isTyping) =>
    set((state) => ({
      typingIndicators: {
        ...state.typingIndicators,
        [conversationId]: isTyping,
      },
    })),
}));
