# Comprehensive TypeScript Testing Guide

## Introduction

Testing is essential for building reliable applications. This guide covers modern testing practices using Vitest, Testing Library, and Playwright with TypeScript.

## Vitest Setup and Configuration

### Installation

```bash
npm install -D vitest @vitest/ui @vitest/coverage-v8
npm install -D @testing-library/react @testing-library/jest-dom
npm install -D @testing-library/user-event
npm install -D happy-dom # or jsdom
```

### Configuration

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'happy-dom', // or 'jsdom'
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData',
        '**/*.test.ts',
        '**/*.test.tsx'
      ]
    },
    include: ['**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'dist', '.next'],
    css: true
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@/components': path.resolve(__dirname, './src/components'),
      '@/utils': path.resolve(__dirname, './src/utils')
    }
  }
});
```

### Setup File

```typescript
// tests/setup.ts
import { expect, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers);

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn()
  }))
});

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn()
}));

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn()
}));
```

## Testing React Components

### Basic Component Test

```typescript
// components/Button.tsx
import { FC, ReactNode } from 'react';

interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
}

export const Button: FC<ButtonProps> = ({
  children,
  onClick,
  variant = 'primary',
  disabled = false
}) => {
  return (
    <button
      className={`btn btn-${variant}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
};

// components/Button.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './Button';

describe('Button', () => {
  it('renders with children', () => {
    render(<Button>Click me</Button>);

    expect(screen.getByRole('button')).toHaveTextContent('Click me');
  });

  it('calls onClick when clicked', async () => {
    const handleClick = vi.fn();
    const user = userEvent.setup();

    render(<Button onClick={handleClick}>Click me</Button>);

    await user.click(screen.getByRole('button'));

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('does not call onClick when disabled', async () => {
    const handleClick = vi.fn();
    const user = userEvent.setup();

    render(
      <Button onClick={handleClick} disabled>
        Click me
      </Button>
    );

    await user.click(screen.getByRole('button'));

    expect(handleClick).not.toHaveBeenCalled();
  });

  it('applies correct variant class', () => {
    const { rerender } = render(<Button variant="primary">Click me</Button>);

    expect(screen.getByRole('button')).toHaveClass('btn-primary');

    rerender(<Button variant="secondary">Click me</Button>);

    expect(screen.getByRole('button')).toHaveClass('btn-secondary');
  });

  it('is disabled when disabled prop is true', () => {
    render(<Button disabled>Click me</Button>);

    expect(screen.getByRole('button')).toBeDisabled();
  });
});
```

### Testing Forms

```typescript
// components/LoginForm.tsx
import { useState, FormEvent } from 'react';

interface LoginFormProps {
  onSubmit: (email: string, password: string) => Promise<void>;
}

export function LoginForm({ onSubmit }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await onSubmit(email, password);
    } catch (err) {
      setError('Login failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} aria-label="login form">
      {error && <div role="alert">{error}</div>}

      <div>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>

      <div>
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Logging in...' : 'Log in'}
      </button>
    </form>
  );
}

// components/LoginForm.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginForm } from './LoginForm';

describe('LoginForm', () => {
  it('renders form fields', () => {
    render(<LoginForm onSubmit={vi.fn()} />);

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /log in/i })).toBeInTheDocument();
  });

  it('submits form with email and password', async () => {
    const handleSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(<LoginForm onSubmit={handleSubmit} />);

    await user.type(screen.getByLabelText(/email/i), 'test@example.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /log in/i }));

    await waitFor(() => {
      expect(handleSubmit).toHaveBeenCalledWith('test@example.com', 'password123');
    });
  });

  it('shows loading state during submission', async () => {
    const handleSubmit = vi.fn().mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 100))
    );
    const user = userEvent.setup();

    render(<LoginForm onSubmit={handleSubmit} />);

    await user.type(screen.getByLabelText(/email/i), 'test@example.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /log in/i }));

    expect(screen.getByRole('button')).toHaveTextContent('Logging in...');
    expect(screen.getByRole('button')).toBeDisabled();

    await waitFor(() => {
      expect(screen.getByRole('button')).toHaveTextContent('Log in');
      expect(screen.getByRole('button')).not.toBeDisabled();
    });
  });

  it('displays error message on submission failure', async () => {
    const handleSubmit = vi.fn().mockRejectedValue(new Error('Login failed'));
    const user = userEvent.setup();

    render(<LoginForm onSubmit={handleSubmit} />);

    await user.type(screen.getByLabelText(/email/i), 'test@example.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /log in/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Login failed. Please try again.'
      );
    });
  });
});
```

### Testing with Context

```typescript
// contexts/AuthContext.tsx
import { createContext, useContext, useState, ReactNode } from 'react';

interface User {
  id: string;
  name: string;
  email: string;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  const login = async (email: string, password: string) => {
    // Mock login
    const user = { id: '1', name: 'Test User', email };
    setUser(user);
  };

  const logout = () => {
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}

// components/UserProfile.tsx
import { useAuth } from '../contexts/AuthContext';

export function UserProfile() {
  const { user, logout } = useAuth();

  if (!user) {
    return <div>Please log in</div>;
  }

  return (
    <div>
      <h1>Welcome, {user.name}</h1>
      <p>{user.email}</p>
      <button onClick={logout}>Log out</button>
    </div>
  );
}

// components/UserProfile.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider } from '../contexts/AuthContext';
import { UserProfile } from './UserProfile';

// Helper function to render with providers
function renderWithAuth(ui: React.ReactElement) {
  return render(<AuthProvider>{ui}</AuthProvider>);
}

describe('UserProfile', () => {
  it('shows login message when not authenticated', () => {
    renderWithAuth(<UserProfile />);

    expect(screen.getByText(/please log in/i)).toBeInTheDocument();
  });

  it('shows user info when authenticated', async () => {
    const { rerender } = renderWithAuth(<UserProfile />);

    // Simulate login (in real test, you'd use the login function)
    // For this example, we'll need to modify our test approach

    // Better approach: Create a custom AuthProvider for testing
    const mockUser = { id: '1', name: 'John Doe', email: 'john@example.com' };

    render(
      <AuthProvider>
        <MockAuthUser user={mockUser}>
          <UserProfile />
        </MockAuthUser>
      </AuthProvider>
    );

    expect(screen.getByText(/welcome, john doe/i)).toBeInTheDocument();
    expect(screen.getByText(/john@example.com/i)).toBeInTheDocument();
  });
});

// Test helper component
function MockAuthUser({
  children,
  user
}: {
  children: ReactNode;
  user: User;
}) {
  const auth = useAuth();

  useEffect(() => {
    if (user) {
      auth.login(user.email, 'password');
    }
  }, []);

  return <>{children}</>;
}
```

## Testing Custom Hooks

### Basic Hook Test

```typescript
// hooks/useCounter.ts
import { useState, useCallback } from 'react';

export function useCounter(initialValue = 0) {
  const [count, setCount] = useState(initialValue);

  const increment = useCallback(() => {
    setCount((c) => c + 1);
  }, []);

  const decrement = useCallback(() => {
    setCount((c) => c - 1);
  }, []);

  const reset = useCallback(() => {
    setCount(initialValue);
  }, [initialValue]);

  return { count, increment, decrement, reset };
}

// hooks/useCounter.test.ts
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCounter } from './useCounter';

describe('useCounter', () => {
  it('initializes with default value', () => {
    const { result } = renderHook(() => useCounter());

    expect(result.current.count).toBe(0);
  });

  it('initializes with custom value', () => {
    const { result } = renderHook(() => useCounter(10));

    expect(result.current.count).toBe(10);
  });

  it('increments count', () => {
    const { result } = renderHook(() => useCounter());

    act(() => {
      result.current.increment();
    });

    expect(result.current.count).toBe(1);
  });

  it('decrements count', () => {
    const { result } = renderHook(() => useCounter(5));

    act(() => {
      result.current.decrement();
    });

    expect(result.current.count).toBe(4);
  });

  it('resets to initial value', () => {
    const { result } = renderHook(() => useCounter(10));

    act(() => {
      result.current.increment();
      result.current.increment();
    });

    expect(result.current.count).toBe(12);

    act(() => {
      result.current.reset();
    });

    expect(result.current.count).toBe(10);
  });
});
```

### Testing Async Hooks

```typescript
// hooks/useUsers.ts
import { useState, useEffect } from 'react';

interface User {
  id: string;
  name: string;
  email: string;
}

export function useUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchUsers() {
      try {
        setLoading(true);
        const response = await fetch('/api/users');

        if (!response.ok) {
          throw new Error('Failed to fetch users');
        }

        const data = await response.json();

        if (!cancelled) {
          setUsers(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err as Error);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchUsers();

    return () => {
      cancelled = true;
    };
  }, []);

  return { users, loading, error };
}

// hooks/useUsers.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useUsers } from './useUsers';

describe('useUsers', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches users successfully', async () => {
    const mockUsers = [
      { id: '1', name: 'John', email: 'john@example.com' },
      { id: '2', name: 'Jane', email: 'jane@example.com' }
    ];

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockUsers
    });

    const { result } = renderHook(() => useUsers());

    expect(result.current.loading).toBe(true);
    expect(result.current.users).toEqual([]);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.users).toEqual(mockUsers);
    expect(result.current.error).toBeNull();
  });

  it('handles fetch error', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false
    });

    const { result } = renderHook(() => useUsers());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('Failed to fetch users');
    expect(result.current.users).toEqual([]);
  });
});
```

## Mocking

### Mocking Functions

```typescript
// utils/api.ts
export async function fetchUser(id: string) {
  const response = await fetch(`/api/users/${id}`);
  return response.json();
}

// components/UserCard.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import * as api from '../utils/api';
import { UserCard } from './UserCard';

// Mock the entire module
vi.mock('../utils/api');

describe('UserCard', () => {
  it('displays user data', async () => {
    const mockUser = {
      id: '1',
      name: 'John Doe',
      email: 'john@example.com'
    };

    // Mock the function implementation
    vi.mocked(api.fetchUser).mockResolvedValue(mockUser);

    render(<UserCard userId="1" />);

    await waitFor(() => {
      expect(screen.getByText(mockUser.name)).toBeInTheDocument();
    });

    expect(api.fetchUser).toHaveBeenCalledWith('1');
  });
});
```

### Mocking Modules

```typescript
// Inline mock
vi.mock('../utils/api', () => ({
  fetchUser: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn()
}));

// Mock with factory
vi.mock('../utils/api', () => {
  return {
    fetchUser: vi.fn((id: string) => ({
      id,
      name: 'Mock User',
      email: 'mock@example.com'
    }))
  };
});

// Partial mock (keep some real implementations)
vi.mock('../utils/api', async () => {
  const actual = await vi.importActual('../utils/api');
  return {
    ...actual,
    fetchUser: vi.fn() // Only mock this one
  };
});
```

### Spying on Functions

```typescript
import { describe, it, expect, vi } from 'vitest';

describe('Spying', () => {
  it('spies on console.log', () => {
    const spy = vi.spyOn(console, 'log');

    console.log('Hello, world!');

    expect(spy).toHaveBeenCalledWith('Hello, world!');

    spy.mockRestore();
  });

  it('spies on object methods', () => {
    const obj = {
      getValue: () => 42
    };

    const spy = vi.spyOn(obj, 'getValue');

    obj.getValue();

    expect(spy).toHaveBeenCalled();
    expect(spy).toHaveReturnedWith(42);

    // Change implementation
    spy.mockReturnValue(100);
    expect(obj.getValue()).toBe(100);

    spy.mockRestore();
  });
});
```

### Mocking Timers

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Timer tests', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('waits for timeout', () => {
    const callback = vi.fn();

    setTimeout(callback, 1000);

    expect(callback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1000);

    expect(callback).toHaveBeenCalled();
  });

  it('runs all timers', () => {
    const callback1 = vi.fn();
    const callback2 = vi.fn();

    setTimeout(callback1, 1000);
    setTimeout(callback2, 2000);

    vi.runAllTimers();

    expect(callback1).toHaveBeenCalled();
    expect(callback2).toHaveBeenCalled();
  });

  it('advances to next timer', () => {
    const callback1 = vi.fn();
    const callback2 = vi.fn();

    setTimeout(callback1, 1000);
    setTimeout(callback2, 2000);

    vi.advanceTimersToNextTimer();
    expect(callback1).toHaveBeenCalled();
    expect(callback2).not.toHaveBeenCalled();

    vi.advanceTimersToNextTimer();
    expect(callback2).toHaveBeenCalled();
  });
});
```

## Testing Async Code

### Promises

```typescript
// utils/delay.ts
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchWithRetry(
  url: string,
  retries = 3
): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fetch(url);
    } catch (error) {
      if (i === retries - 1) throw error;
      await delay(1000 * (i + 1));
    }
  }
  throw new Error('Max retries reached');
}

// utils/delay.test.ts
import { describe, it, expect, vi } from 'vitest';
import { fetchWithRetry } from './delay';

describe('fetchWithRetry', () => {
  it('returns response on first try', async () => {
    const mockResponse = new Response('OK');
    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    const result = await fetchWithRetry('https://api.example.com');

    expect(result).toBe(mockResponse);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('retries on failure', async () => {
    global.fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce(new Response('OK'));

    const result = await fetchWithRetry('https://api.example.com');

    expect(result).toBeInstanceOf(Response);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('throws after max retries', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    await expect(fetchWithRetry('https://api.example.com')).rejects.toThrow(
      'Network error'
    );

    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
```

## Snapshot Testing

```typescript
// components/Card.tsx
interface CardProps {
  title: string;
  description: string;
  footer?: string;
}

export function Card({ title, description, footer }: CardProps) {
  return (
    <div className="card">
      <h2>{title}</h2>
      <p>{description}</p>
      {footer && <footer>{footer}</footer>}
    </div>
  );
}

// components/Card.test.tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Card } from './Card';

describe('Card', () => {
  it('matches snapshot', () => {
    const { container } = render(
      <Card
        title="Test Card"
        description="This is a test card"
        footer="Footer text"
      />
    );

    expect(container).toMatchSnapshot();
  });

  it('matches snapshot without footer', () => {
    const { container } = render(
      <Card title="Test Card" description="This is a test card" />
    );

    expect(container).toMatchSnapshot();
  });

  it('matches inline snapshot', () => {
    const { container } = render(
      <Card title="Test" description="Description" />
    );

    expect(container.innerHTML).toMatchInlineSnapshot(`
      "<div class=\\"card\\">
        <h2>Test</h2>
        <p>Description</p>
      </div>"
    `);
  });
});
```

## E2E Testing with Playwright

### Setup

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure'
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] }
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] }
    }
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI
  }
});
```

### E2E Tests

```typescript
// e2e/login.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Login Flow', () => {
  test('should login successfully', async ({ page }) => {
    await page.goto('/login');

    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', 'password123');

    await page.click('button[type="submit"]');

    await expect(page).toHaveURL('/dashboard');
    await expect(page.locator('h1')).toContainText('Welcome');
  });

  test('should show error with invalid credentials', async ({ page }) => {
    await page.goto('/login');

    await page.fill('input[name="email"]', 'wrong@example.com');
    await page.fill('input[name="password"]', 'wrongpassword');

    await page.click('button[type="submit"]');

    await expect(page.locator('[role="alert"]')).toContainText(
      'Invalid credentials'
    );
  });

  test('should validate email format', async ({ page }) => {
    await page.goto('/login');

    await page.fill('input[name="email"]', 'invalid-email');
    await page.fill('input[name="password"]', 'password123');

    await page.click('button[type="submit"]');

    const emailInput = page.locator('input[name="email"]');
    await expect(emailInput).toHaveAttribute('aria-invalid', 'true');
  });
});

// e2e/shopping.spec.ts
test.describe('Shopping Cart', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto('/login');
    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/dashboard');
  });

  test('should add item to cart', async ({ page }) => {
    await page.goto('/products');

    // Click first product
    await page.click('[data-testid="product-card"]:first-child');

    // Add to cart
    await page.click('button:has-text("Add to Cart")');

    // Check cart badge
    const cartBadge = page.locator('[data-testid="cart-badge"]');
    await expect(cartBadge).toHaveText('1');
  });

  test('should complete checkout', async ({ page }) => {
    // Add item to cart
    await page.goto('/products');
    await page.click('[data-testid="add-to-cart"]:first-child');

    // Go to cart
    await page.click('[data-testid="cart-icon"]');
    await expect(page).toHaveURL('/cart');

    // Proceed to checkout
    await page.click('button:has-text("Checkout")');
    await expect(page).toHaveURL('/checkout');

    // Fill checkout form
    await page.fill('input[name="name"]', 'John Doe');
    await page.fill('input[name="address"]', '123 Main St');
    await page.fill('input[name="city"]', 'New York');
    await page.fill('input[name="zipCode"]', '10001');

    // Complete order
    await page.click('button:has-text("Place Order")');

    // Verify success
    await expect(page).toHaveURL('/order-confirmation');
    await expect(page.locator('h1')).toContainText('Order Confirmed');
  });
});
```

### Page Object Model

```typescript
// e2e/pages/LoginPage.ts
import { Page, Locator } from '@playwright/test';

export class LoginPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.locator('input[name="email"]');
    this.passwordInput = page.locator('input[name="password"]');
    this.submitButton = page.locator('button[type="submit"]');
    this.errorMessage = page.locator('[role="alert"]');
  }

  async goto() {
    await this.page.goto('/login');
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }

  async getErrorMessage() {
    return this.errorMessage.textContent();
  }
}

// Usage
test('login with page object', async ({ page }) => {
  const loginPage = new LoginPage(page);

  await loginPage.goto();
  await loginPage.login('test@example.com', 'password123');

  await expect(page).toHaveURL('/dashboard');
});
```

## Coverage Configuration

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData',
        '**/*.test.{ts,tsx}',
        '**/*.spec.{ts,tsx}'
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80
      }
    }
  }
});

// package.json scripts
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage",
    "test:watch": "vitest --watch"
  }
}
```

## Testing Best Practices

### 1. Test Behavior, Not Implementation

```typescript
// Bad: Testing implementation details
it('updates state when button is clicked', () => {
  const { result } = renderHook(() => useCounter());

  act(() => {
    result.current.increment();
  });

  expect(result.current.count).toBe(1);
});

// Good: Testing user-facing behavior
it('increments counter when button is clicked', async () => {
  const user = userEvent.setup();
  render(<Counter />);

  await user.click(screen.getByRole('button', { name: /increment/i }));

  expect(screen.getByText(/count: 1/i)).toBeInTheDocument();
});
```

### 2. Use Proper Query Methods

```typescript
// Good: Accessible queries (preferred)
screen.getByRole('button', { name: /submit/i });
screen.getByLabelText(/email/i);
screen.getByText(/welcome/i);

// Okay: Test IDs (when needed)
screen.getByTestId('custom-element');

// Bad: querySelector (avoid)
container.querySelector('.button-class');
```

### 3. Wait for Async Updates

```typescript
// Bad: Not waiting
it('loads data', () => {
  render(<UserList />);
  expect(screen.getByText('John Doe')).toBeInTheDocument(); // May fail
});

// Good: Wait for element
it('loads data', async () => {
  render(<UserList />);
  expect(await screen.findByText('John Doe')).toBeInTheDocument();
});

// Good: Wait for condition
it('loads data', async () => {
  render(<UserList />);

  await waitFor(() => {
    expect(screen.getByText('John Doe')).toBeInTheDocument();
  });
});
```

### 4. Keep Tests Isolated

```typescript
// Bad: Tests depend on each other
let userId: string;

it('creates user', async () => {
  userId = await createUser();
  expect(userId).toBeDefined();
});

it('updates user', async () => {
  await updateUser(userId); // Depends on previous test
});

// Good: Independent tests
it('creates user', async () => {
  const userId = await createUser();
  expect(userId).toBeDefined();
});

it('updates user', async () => {
  const userId = await createUser(); // Create fresh data
  await updateUser(userId);
  const user = await getUser(userId);
  expect(user).toBeDefined();
});
```

## CI/CD Integration

### GitHub Actions

```yaml
# .github/workflows/test.yml
name: Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run unit tests
        run: npm run test:coverage

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          file: ./coverage/lcov.info

      - name: Install Playwright
        run: npx playwright install --with-deps

      - name: Run E2E tests
        run: npx playwright test

      - name: Upload Playwright report
        uses: actions/upload-artifact@v3
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
```

This comprehensive guide covers all aspects of testing TypeScript applications from unit tests to E2E tests.
