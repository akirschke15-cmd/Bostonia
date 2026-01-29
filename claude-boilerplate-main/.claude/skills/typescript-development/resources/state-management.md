# Modern State Management Patterns

## Introduction to State Management

State management is crucial for building scalable React applications. This guide covers modern patterns using TypeScript, from built-in React solutions to specialized libraries.

## Context API + useReducer

### Basic Context Pattern

```typescript
// contexts/ThemeContext.tsx
import { createContext, useContext, useState, ReactNode } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light');

  const toggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}

// Usage
function App() {
  return (
    <ThemeProvider>
      <Header />
      <Content />
    </ThemeProvider>
  );
}

function Header() {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className={theme}>
      <button onClick={toggleTheme}>Toggle Theme</button>
    </header>
  );
}
```

### Advanced useReducer Pattern

```typescript
// contexts/AuthContext.tsx
import { createContext, useContext, useReducer, ReactNode, useEffect } from 'react';

// Types
interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  isAuthenticated: boolean;
}

type AuthAction =
  | { type: 'LOGIN_START' }
  | { type: 'LOGIN_SUCCESS'; payload: User }
  | { type: 'LOGIN_FAILURE'; payload: string }
  | { type: 'LOGOUT' }
  | { type: 'UPDATE_USER'; payload: Partial<User> };

interface AuthContextType {
  state: AuthState;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  updateUser: (data: Partial<User>) => void;
}

// Initial state
const initialState: AuthState = {
  user: null,
  isLoading: false,
  error: null,
  isAuthenticated: false
};

// Reducer
function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'LOGIN_START':
      return {
        ...state,
        isLoading: true,
        error: null
      };

    case 'LOGIN_SUCCESS':
      return {
        ...state,
        isLoading: false,
        user: action.payload,
        isAuthenticated: true,
        error: null
      };

    case 'LOGIN_FAILURE':
      return {
        ...state,
        isLoading: false,
        error: action.payload,
        isAuthenticated: false
      };

    case 'LOGOUT':
      return {
        ...initialState
      };

    case 'UPDATE_USER':
      return {
        ...state,
        user: state.user ? { ...state.user, ...action.payload } : null
      };

    default:
      return state;
  }
}

// Context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Provider
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // Load user from localStorage on mount
  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        const user = JSON.parse(storedUser);
        dispatch({ type: 'LOGIN_SUCCESS', payload: user });
      } catch (error) {
        localStorage.removeItem('user');
      }
    }
  }, []);

  // Persist user to localStorage
  useEffect(() => {
    if (state.user) {
      localStorage.setItem('user', JSON.stringify(state.user));
    } else {
      localStorage.removeItem('user');
    }
  }, [state.user]);

  const login = async (email: string, password: string) => {
    dispatch({ type: 'LOGIN_START' });

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      if (!response.ok) {
        throw new Error('Login failed');
      }

      const user = await response.json();
      dispatch({ type: 'LOGIN_SUCCESS', payload: user });
    } catch (error) {
      dispatch({
        type: 'LOGIN_FAILURE',
        payload: error instanceof Error ? error.message : 'Login failed'
      });
      throw error;
    }
  };

  const logout = () => {
    dispatch({ type: 'LOGOUT' });
  };

  const updateUser = (data: Partial<User>) => {
    dispatch({ type: 'UPDATE_USER', payload: data });
  };

  const value: AuthContextType = {
    state,
    login,
    logout,
    updateUser
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Hook
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}

// Usage
function LoginPage() {
  const { state, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login(email, password);
    } catch (error) {
      console.error('Login failed');
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {state.error && <div className="error">{state.error}</div>}
      <input
        type="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
      />
      <input
        type="password"
        value={password}
        onChange={e => setPassword(e.target.value)}
      />
      <button type="submit" disabled={state.isLoading}>
        {state.isLoading ? 'Logging in...' : 'Login'}
      </button>
    </form>
  );
}
```

## Zustand - Lightweight State Management

### Basic Zustand Store

```typescript
// stores/useCounterStore.ts
import { create } from 'zustand';

interface CounterState {
  count: number;
  increment: () => void;
  decrement: () => void;
  reset: () => void;
}

export const useCounterStore = create<CounterState>((set) => ({
  count: 0,
  increment: () => set((state) => ({ count: state.count + 1 })),
  decrement: () => set((state) => ({ count: state.count - 1 })),
  reset: () => set({ count: 0 })
}));

// Usage
function Counter() {
  const { count, increment, decrement, reset } = useCounterStore();

  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={increment}>+</button>
      <button onClick={decrement}>-</button>
      <button onClick={reset}>Reset</button>
    </div>
  );
}
```

### Advanced Zustand Patterns

```typescript
// stores/useCartStore.ts
import { create } from 'zustand';
import { persist, devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

interface Product {
  id: string;
  name: string;
  price: number;
  image: string;
}

interface CartItem extends Product {
  quantity: number;
}

interface CartState {
  items: CartItem[];
  total: number;
  addItem: (product: Product) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  getItemCount: () => number;
}

export const useCartStore = create<CartState>()(
  devtools(
    persist(
      immer((set, get) => ({
        items: [],
        total: 0,

        addItem: (product) =>
          set((state) => {
            const existingItem = state.items.find(
              (item) => item.id === product.id
            );

            if (existingItem) {
              existingItem.quantity += 1;
            } else {
              state.items.push({ ...product, quantity: 1 });
            }

            state.total = state.items.reduce(
              (sum, item) => sum + item.price * item.quantity,
              0
            );
          }),

        removeItem: (id) =>
          set((state) => {
            state.items = state.items.filter((item) => item.id !== id);
            state.total = state.items.reduce(
              (sum, item) => sum + item.price * item.quantity,
              0
            );
          }),

        updateQuantity: (id, quantity) =>
          set((state) => {
            const item = state.items.find((item) => item.id === id);
            if (item) {
              item.quantity = quantity;
              if (item.quantity <= 0) {
                state.items = state.items.filter((item) => item.id !== id);
              }
            }

            state.total = state.items.reduce(
              (sum, item) => sum + item.price * item.quantity,
              0
            );
          }),

        clearCart: () =>
          set({
            items: [],
            total: 0
          }),

        getItemCount: () => {
          return get().items.reduce((sum, item) => sum + item.quantity, 0);
        }
      })),
      {
        name: 'cart-storage' // localStorage key
      }
    )
  )
);

// Usage
function ProductCard({ product }: { product: Product }) {
  const addItem = useCartStore((state) => state.addItem);

  return (
    <div>
      <h3>{product.name}</h3>
      <p>${product.price}</p>
      <button onClick={() => addItem(product)}>Add to Cart</button>
    </div>
  );
}

function CartSummary() {
  const items = useCartStore((state) => state.items);
  const total = useCartStore((state) => state.total);
  const clearCart = useCartStore((state) => state.clearCart);

  return (
    <div>
      <h2>Cart ({items.length} items)</h2>
      {items.map((item) => (
        <div key={item.id}>
          {item.name} x {item.quantity} = ${item.price * item.quantity}
        </div>
      ))}
      <div>Total: ${total}</div>
      <button onClick={clearCart}>Clear Cart</button>
    </div>
  );
}
```

### Zustand with Async Actions

```typescript
// stores/useUserStore.ts
import { create } from 'zustand';

interface User {
  id: string;
  name: string;
  email: string;
}

interface UserState {
  user: User | null;
  users: User[];
  isLoading: boolean;
  error: string | null;
  fetchUser: (id: string) => Promise<void>;
  fetchUsers: () => Promise<void>;
  updateUser: (id: string, data: Partial<User>) => Promise<void>;
}

export const useUserStore = create<UserState>((set, get) => ({
  user: null,
  users: [],
  isLoading: false,
  error: null,

  fetchUser: async (id: string) => {
    set({ isLoading: true, error: null });

    try {
      const response = await fetch(`/api/users/${id}`);
      if (!response.ok) throw new Error('Failed to fetch user');

      const user = await response.json();
      set({ user, isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Unknown error',
        isLoading: false
      });
    }
  },

  fetchUsers: async () => {
    set({ isLoading: true, error: null });

    try {
      const response = await fetch('/api/users');
      if (!response.ok) throw new Error('Failed to fetch users');

      const users = await response.json();
      set({ users, isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Unknown error',
        isLoading: false
      });
    }
  },

  updateUser: async (id: string, data: Partial<User>) => {
    set({ isLoading: true, error: null });

    try {
      const response = await fetch(`/api/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      if (!response.ok) throw new Error('Failed to update user');

      const updatedUser = await response.json();

      set((state) => ({
        user: state.user?.id === id ? updatedUser : state.user,
        users: state.users.map((u) => (u.id === id ? updatedUser : u)),
        isLoading: false
      }));
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Unknown error',
        isLoading: false
      });
    }
  }
}));
```

## Redux Toolkit - Modern Redux

### Store Setup

```typescript
// store/store.ts
import { configureStore } from '@reduxjs/toolkit';
import counterReducer from './slices/counterSlice';
import todosReducer from './slices/todosSlice';

export const store = configureStore({
  reducer: {
    counter: counterReducer,
    todos: todosReducer
  }
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// Typed hooks
import { TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux';

export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
```

### Creating Slices

```typescript
// store/slices/todosSlice.ts
import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';

interface Todo {
  id: string;
  title: string;
  completed: boolean;
  createdAt: string;
}

interface TodosState {
  items: Todo[];
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

const initialState: TodosState = {
  items: [],
  status: 'idle',
  error: null
};

// Async thunks
export const fetchTodos = createAsyncThunk('todos/fetchTodos', async () => {
  const response = await fetch('/api/todos');
  if (!response.ok) throw new Error('Failed to fetch todos');
  return response.json();
});

export const addTodo = createAsyncThunk(
  'todos/addTodo',
  async (title: string) => {
    const response = await fetch('/api/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title })
    });
    if (!response.ok) throw new Error('Failed to add todo');
    return response.json();
  }
);

export const toggleTodo = createAsyncThunk(
  'todos/toggleTodo',
  async (id: string) => {
    const response = await fetch(`/api/todos/${id}/toggle`, {
      method: 'PATCH'
    });
    if (!response.ok) throw new Error('Failed to toggle todo');
    return response.json();
  }
);

export const deleteTodo = createAsyncThunk(
  'todos/deleteTodo',
  async (id: string) => {
    const response = await fetch(`/api/todos/${id}`, {
      method: 'DELETE'
    });
    if (!response.ok) throw new Error('Failed to delete todo');
    return id;
  }
);

// Slice
const todosSlice = createSlice({
  name: 'todos',
  initialState,
  reducers: {
    // Synchronous actions
    todosCleared: (state) => {
      state.items = [];
    }
  },
  extraReducers: (builder) => {
    builder
      // Fetch todos
      .addCase(fetchTodos.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(fetchTodos.fulfilled, (state, action: PayloadAction<Todo[]>) => {
        state.status = 'succeeded';
        state.items = action.payload;
      })
      .addCase(fetchTodos.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message || 'Failed to fetch todos';
      })
      // Add todo
      .addCase(addTodo.fulfilled, (state, action: PayloadAction<Todo>) => {
        state.items.push(action.payload);
      })
      // Toggle todo
      .addCase(toggleTodo.fulfilled, (state, action: PayloadAction<Todo>) => {
        const index = state.items.findIndex((t) => t.id === action.payload.id);
        if (index !== -1) {
          state.items[index] = action.payload;
        }
      })
      // Delete todo
      .addCase(deleteTodo.fulfilled, (state, action: PayloadAction<string>) => {
        state.items = state.items.filter((t) => t.id !== action.payload);
      });
  }
});

export const { todosCleared } = todosSlice.actions;
export default todosSlice.reducer;

// Selectors
export const selectAllTodos = (state: { todos: TodosState }) => state.todos.items;
export const selectTodosStatus = (state: { todos: TodosState }) => state.todos.status;
export const selectTodosError = (state: { todos: TodosState }) => state.todos.error;
export const selectCompletedTodos = (state: { todos: TodosState }) =>
  state.todos.items.filter((todo) => todo.completed);
export const selectActiveTodos = (state: { todos: TodosState }) =>
  state.todos.items.filter((todo) => !todo.completed);
```

### Using Redux Toolkit

```typescript
// App.tsx
import { Provider } from 'react-redux';
import { store } from './store/store';
import TodoList from './components/TodoList';

function App() {
  return (
    <Provider store={store}>
      <TodoList />
    </Provider>
  );
}

// components/TodoList.tsx
import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../store/store';
import {
  fetchTodos,
  addTodo,
  toggleTodo,
  deleteTodo,
  selectAllTodos,
  selectTodosStatus
} from '../store/slices/todosSlice';

export default function TodoList() {
  const dispatch = useAppDispatch();
  const todos = useAppSelector(selectAllTodos);
  const status = useAppSelector(selectTodosStatus);

  useEffect(() => {
    if (status === 'idle') {
      dispatch(fetchTodos());
    }
  }, [status, dispatch]);

  const handleAddTodo = (title: string) => {
    dispatch(addTodo(title));
  };

  const handleToggleTodo = (id: string) => {
    dispatch(toggleTodo(id));
  };

  const handleDeleteTodo = (id: string) => {
    dispatch(deleteTodo(id));
  };

  if (status === 'loading') {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <h1>Todos</h1>
      {todos.map((todo) => (
        <div key={todo.id}>
          <input
            type="checkbox"
            checked={todo.completed}
            onChange={() => handleToggleTodo(todo.id)}
          />
          <span>{todo.title}</span>
          <button onClick={() => handleDeleteTodo(todo.id)}>Delete</button>
        </div>
      ))}
    </div>
  );
}
```

## TanStack Query (React Query)

### Setup and Configuration

```typescript
// App.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      cacheTime: 1000 * 60 * 30, // 30 minutes
      retry: 1,
      refetchOnWindowFocus: false
    }
  }
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <UserList />
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
```

### Queries

```typescript
// hooks/useUsers.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface User {
  id: string;
  name: string;
  email: string;
}

// Fetch all users
export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const response = await fetch('/api/users');
      if (!response.ok) throw new Error('Failed to fetch users');
      return response.json() as Promise<User[]>;
    }
  });
}

// Fetch single user
export function useUser(userId: string) {
  return useQuery({
    queryKey: ['users', userId],
    queryFn: async () => {
      const response = await fetch(`/api/users/${userId}`);
      if (!response.ok) throw new Error('Failed to fetch user');
      return response.json() as Promise<User>;
    },
    enabled: !!userId // Only run if userId is provided
  });
}

// Create user
export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (newUser: Omit<User, 'id'>) => {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser)
      });
      if (!response.ok) throw new Error('Failed to create user');
      return response.json() as Promise<User>;
    },
    onSuccess: () => {
      // Invalidate and refetch
      queryClient.invalidateQueries({ queryKey: ['users'] });
    }
  });
}

// Update user
export function useUpdateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data
    }: {
      id: string;
      data: Partial<User>;
    }) => {
      const response = await fetch(`/api/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error('Failed to update user');
      return response.json() as Promise<User>;
    },
    onSuccess: (data) => {
      // Update cache
      queryClient.setQueryData(['users', data.id], data);
      queryClient.invalidateQueries({ queryKey: ['users'] });
    }
  });
}

// Delete user
export function useDeleteUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/users/${id}`, {
        method: 'DELETE'
      });
      if (!response.ok) throw new Error('Failed to delete user');
      return id;
    },
    onSuccess: (id) => {
      // Remove from cache
      queryClient.setQueryData<User[]>(['users'], (old) =>
        old ? old.filter((user) => user.id !== id) : []
      );
    }
  });
}

// Usage
function UserList() {
  const { data: users, isLoading, error } = useUsers();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      {users?.map((user) => (
        <div key={user.id}>
          <span>{user.name}</span>
          <button
            onClick={() =>
              updateUser.mutate({ id: user.id, data: { name: 'New Name' } })
            }
          >
            Update
          </button>
          <button onClick={() => deleteUser.mutate(user.id)}>Delete</button>
        </div>
      ))}
      <button
        onClick={() =>
          createUser.mutate({ name: 'New User', email: 'new@example.com' })
        }
      >
        Add User
      </button>
    </div>
  );
}
```

### Optimistic Updates

```typescript
// hooks/useTodos.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';

interface Todo {
  id: string;
  title: string;
  completed: boolean;
}

export function useToggleTodo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/todos/${id}/toggle`, {
        method: 'PATCH'
      });
      if (!response.ok) throw new Error('Failed to toggle todo');
      return response.json() as Promise<Todo>;
    },
    // Optimistic update
    onMutate: async (id) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['todos'] });

      // Snapshot previous value
      const previousTodos = queryClient.getQueryData<Todo[]>(['todos']);

      // Optimistically update
      queryClient.setQueryData<Todo[]>(['todos'], (old) =>
        old
          ? old.map((todo) =>
              todo.id === id ? { ...todo, completed: !todo.completed } : todo
            )
          : []
      );

      // Return context with snapshot
      return { previousTodos };
    },
    // Rollback on error
    onError: (err, id, context) => {
      queryClient.setQueryData(['todos'], context?.previousTodos);
    },
    // Always refetch after error or success
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] });
    }
  });
}
```

## React Hook Form

### Basic Form

```typescript
// components/UserForm.tsx
import { useForm, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

// Validation schema
const userSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  age: z.number().min(18, 'Must be at least 18 years old'),
  acceptTerms: z.boolean().refine((val) => val === true, {
    message: 'You must accept the terms'
  })
});

type UserFormData = z.infer<typeof userSchema>;

export default function UserForm() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset
  } = useForm<UserFormData>({
    resolver: zodResolver(userSchema),
    defaultValues: {
      name: '',
      email: '',
      age: 18,
      acceptTerms: false
    }
  });

  const onSubmit: SubmitHandler<UserFormData> = async (data) => {
    try {
      await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      reset();
      alert('User created successfully');
    } catch (error) {
      alert('Failed to create user');
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div>
        <label>Name</label>
        <input {...register('name')} />
        {errors.name && <span>{errors.name.message}</span>}
      </div>

      <div>
        <label>Email</label>
        <input type="email" {...register('email')} />
        {errors.email && <span>{errors.email.message}</span>}
      </div>

      <div>
        <label>Age</label>
        <input
          type="number"
          {...register('age', { valueAsNumber: true })}
        />
        {errors.age && <span>{errors.age.message}</span>}
      </div>

      <div>
        <label>
          <input type="checkbox" {...register('acceptTerms')} />
          Accept Terms
        </label>
        {errors.acceptTerms && <span>{errors.acceptTerms.message}</span>}
      </div>

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Submitting...' : 'Submit'}
      </button>
    </form>
  );
}
```

### Advanced Form Patterns

```typescript
// components/DynamicForm.tsx
import { useForm, useFieldArray, Controller } from 'react-hook-form';

interface FormData {
  users: {
    name: string;
    email: string;
    roles: string[];
  }[];
}

export default function DynamicForm() {
  const {
    control,
    register,
    handleSubmit,
    watch
  } = useForm<FormData>({
    defaultValues: {
      users: [{ name: '', email: '', roles: [] }]
    }
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'users'
  });

  const onSubmit = (data: FormData) => {
    console.log(data);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      {fields.map((field, index) => (
        <div key={field.id}>
          <input {...register(`users.${index}.name` as const)} />
          <input {...register(`users.${index}.email` as const)} />

          <Controller
            control={control}
            name={`users.${index}.roles`}
            render={({ field }) => (
              <select
                multiple
                value={field.value}
                onChange={(e) => {
                  const values = Array.from(
                    e.target.selectedOptions,
                    (option) => option.value
                  );
                  field.onChange(values);
                }}
              >
                <option value="admin">Admin</option>
                <option value="user">User</option>
                <option value="moderator">Moderator</option>
              </select>
            )}
          />

          <button type="button" onClick={() => remove(index)}>
            Remove
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={() => append({ name: '', email: '', roles: [] })}
      >
        Add User
      </button>

      <button type="submit">Submit</button>
    </form>
  );
}
```

## URL State Management

```typescript
// hooks/useUrlState.ts
import { useSearchParams } from 'react-router-dom';
import { useCallback } from 'react';

export function useUrlState<T>(key: string, defaultValue: T) {
  const [searchParams, setSearchParams] = useSearchParams();

  const value = (() => {
    const param = searchParams.get(key);
    if (!param) return defaultValue;

    try {
      return JSON.parse(param) as T;
    } catch {
      return param as unknown as T;
    }
  })();

  const setValue = useCallback(
    (newValue: T | ((prev: T) => T)) => {
      const valueToSet =
        typeof newValue === 'function'
          ? (newValue as (prev: T) => T)(value)
          : newValue;

      setSearchParams((prev) => {
        const newParams = new URLSearchParams(prev);

        if (valueToSet === defaultValue) {
          newParams.delete(key);
        } else {
          newParams.set(
            key,
            typeof valueToSet === 'string'
              ? valueToSet
              : JSON.stringify(valueToSet)
          );
        }

        return newParams;
      });
    },
    [key, value, defaultValue, setSearchParams]
  );

  return [value, setValue] as const;
}

// Usage
function ProductList() {
  const [search, setSearch] = useUrlState('search', '');
  const [page, setPage] = useUrlState('page', 1);
  const [sortBy, setSortBy] = useUrlState<'name' | 'price'>('sortBy', 'name');

  return (
    <div>
      <input value={search} onChange={(e) => setSearch(e.target.value)} />
      <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}>
        <option value="name">Name</option>
        <option value="price">Price</option>
      </select>
      <button onClick={() => setPage((p) => p + 1)}>Next Page</button>
    </div>
  );
}
```

## Local Storage Sync

```typescript
// hooks/useLocalStorage.ts
import { useState, useEffect } from 'react';

export function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === 'undefined') {
      return initialValue;
    }

    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(error);
      return initialValue;
    }
  });

  const setValue = (value: T | ((val: T) => T)) => {
    try {
      const valueToStore =
        value instanceof Function ? value(storedValue) : value;

      setStoredValue(valueToStore);

      if (typeof window !== 'undefined') {
        window.localStorage.setItem(key, JSON.stringify(valueToStore));
      }
    } catch (error) {
      console.error(error);
    }
  };

  return [storedValue, setValue] as const;
}

// Usage
function Settings() {
  const [theme, setTheme] = useLocalStorage<'light' | 'dark'>('theme', 'light');
  const [preferences, setPreferences] = useLocalStorage('preferences', {
    notifications: true,
    language: 'en'
  });

  return (
    <div>
      <button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
        Toggle Theme
      </button>
    </div>
  );
}
```

## Best Practices

### 1. Choose the Right Tool

```typescript
// Good: Use Context for simple, infrequent updates
const ThemeContext = createContext<'light' | 'dark'>('light');

// Good: Use Zustand for client state
const useCartStore = create((set) => ({
  items: [],
  addItem: (item) => set((state) => ({ items: [...state.items, item] }))
}));

// Good: Use React Query for server state
const { data, isLoading } = useQuery({
  queryKey: ['users'],
  queryFn: fetchUsers
});

// Bad: Using Context for frequently changing state
// (causes unnecessary re-renders)
```

### 2. Optimize Selectors

```typescript
// Good: Select only what you need
const itemCount = useCartStore((state) => state.items.length);
const addItem = useCartStore((state) => state.addItem);

// Bad: Selecting entire state
const cart = useCartStore();
```

### 3. Handle Loading and Error States

```typescript
// Good: Comprehensive state handling
function UserList() {
  const { data, isLoading, error, isError } = useUsers();

  if (isLoading) return <Spinner />;
  if (isError) return <ErrorMessage error={error} />;
  if (!data) return <EmptyState />;

  return <div>{/* Render users */}</div>;
}

// Bad: No error handling
function UserList() {
  const { data } = useUsers();
  return <div>{data?.map(/* ... */)}</div>;
}
```

### 4. Type Your State Properly

```typescript
// Good: Strict typing
interface UserState {
  user: User | null;
  status: 'idle' | 'loading' | 'success' | 'error';
  error: Error | null;
}

// Bad: Loose typing
interface UserState {
  user: any;
  status: string;
  error: any;
}
```

This guide covers modern state management patterns for building scalable TypeScript applications.
