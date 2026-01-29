# TypeScript Development Skill

## Overview
This skill provides comprehensive guidance for TypeScript development, covering type-safe patterns, modern JavaScript features, popular frameworks, and best practices for building scalable applications.

## When This Skill Activates
- Working with `.ts` or `.tsx` files
- TypeScript configuration (tsconfig.json)
- Frontend frameworks (React, Vue, Angular)
- Node.js backend development
- Full-stack applications (Next.js, Remix)

## Quick Reference

### TypeScript Project Setup

#### tsconfig.json (Strict Mode)
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "moduleResolution": "bundler",
    "resolveJsonModule": true,

    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,

    "esModuleInterop": true,
    "skipLibCheck": true,
    "allowSyntheticDefaultImports": true,
    "forceConsistentCasingInFileNames": true,

    "jsx": "react-jsx",
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "build"]
}
```

#### package.json
```json
{
  "name": "my-typescript-project",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "lint": "eslint . --ext ts,tsx",
    "format": "prettier --write \"src/**/*.{ts,tsx}\"",
    "test": "vitest",
    "test:coverage": "vitest --coverage",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@typescript-eslint/eslint-plugin": "^6.0.0",
    "@typescript-eslint/parser": "^6.0.0",
    "eslint": "^8.0.0",
    "prettier": "^3.0.0",
    "typescript": "^5.3.0",
    "vite": "^5.0.0",
    "vitest": "^1.0.0"
  }
}
```

### Advanced Type Patterns

#### Utility Types
```typescript
// Pick - Select specific properties
type User = { id: number; name: string; email: string; password: string };
type PublicUser = Pick<User, 'id' | 'name'>;

// Omit - Exclude specific properties
type UserWithoutPassword = Omit<User, 'password'>;

// Partial - Make all properties optional
type PartialUser = Partial<User>;

// Required - Make all properties required
type RequiredUser = Required<PartialUser>;

// Record - Create object type with specific keys
type UserRoles = Record<'admin' | 'user' | 'guest', Permission[]>;

// ReturnType - Extract function return type
function getUser() {
  return { id: 1, name: 'John' };
}
type UserType = ReturnType<typeof getUser>;
```

#### Generic Types
```typescript
// Generic function
function identity<T>(value: T): T {
  return value;
}

// Generic with constraints
interface HasId {
  id: number;
}

function findById<T extends HasId>(items: T[], id: number): T | undefined {
  return items.find(item => item.id === id);
}

// Generic class
class DataStore<T> {
  private data: T[] = [];

  add(item: T): void {
    this.data.push(item);
  }

  get(index: number): T | undefined {
    return this.data[index];
  }

  filter(predicate: (item: T) => boolean): T[] {
    return this.data.filter(predicate);
  }
}

// Generic with multiple type parameters
function merge<T, U>(obj1: T, obj2: U): T & U {
  return { ...obj1, ...obj2 };
}
```

#### Conditional Types
```typescript
// Basic conditional type
type IsString<T> = T extends string ? true : false;

// Distributed conditional types
type ToArray<T> = T extends any ? T[] : never;
type Result = ToArray<string | number>; // string[] | number[]

// Infer in conditional types
type ExtractReturnType<T> = T extends (...args: any[]) => infer R ? R : never;

// Real-world example: API response unwrapper
type UnwrapPromise<T> = T extends Promise<infer U> ? U : T;
type Data = UnwrapPromise<Promise<string>>; // string
```

#### Mapped Types
```typescript
// Make all properties readonly
type Readonly<T> = {
  readonly [P in keyof T]: T[P];
};

// Make all properties mutable
type Mutable<T> = {
  -readonly [P in keyof T]: T[P];
};

// Make all properties nullable
type Nullable<T> = {
  [P in keyof T]: T[P] | null;
};

// Transform property types
type Getters<T> = {
  [P in keyof T as `get${Capitalize<string & P>}`]: () => T[P];
};

interface Person {
  name: string;
  age: number;
}

type PersonGetters = Getters<Person>;
// { getName: () => string; getAge: () => number; }
```

## React with TypeScript

### Component Patterns
```typescript
import { FC, ReactNode, useState, useEffect } from 'react';

// Props interface
interface ButtonProps {
  onClick: () => void;
  children: ReactNode;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
}

// Function component with props
export const Button: FC<ButtonProps> = ({
  onClick,
  children,
  variant = 'primary',
  disabled = false
}) => {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`btn btn-${variant}`}
    >
      {children}
    </button>
  );
};

// Generic component
interface ListProps<T> {
  items: T[];
  renderItem: (item: T) => ReactNode;
  keyExtractor: (item: T) => string | number;
}

export function List<T>({ items, renderItem, keyExtractor }: ListProps<T>) {
  return (
    <ul>
      {items.map(item => (
        <li key={keyExtractor(item)}>{renderItem(item)}</li>
      ))}
    </ul>
  );
}
```

### Custom Hooks
```typescript
import { useState, useEffect, useCallback, useRef } from 'react';

// Data fetching hook
interface UseFetchResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useFetch<T>(url: string): UseFetchResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(url);
      const json = await response.json();
      setData(json);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

// Local storage hook
export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, (value: T) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = (value: T) => {
    try {
      setStoredValue(value);
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error('Error saving to localStorage:', error);
    }
  };

  return [storedValue, setValue];
}
```

## API Development with TypeScript

### Express.js with Type Safety
```typescript
import express, { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

// Request validation with Zod
const createUserSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  age: z.number().int().min(0).max(150)
});

type CreateUserInput = z.infer<typeof createUserSchema>;

// Typed request handler
interface TypedRequest<T> extends Request {
  body: T;
}

// Middleware for validation
function validateBody<T>(schema: z.Schema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ errors: error.errors });
      } else {
        next(error);
      }
    }
  };
}

// Route handler
app.post(
  '/users',
  validateBody(createUserSchema),
  async (req: TypedRequest<CreateUserInput>, res: Response) => {
    const user = await createUser(req.body);
    res.status(201).json(user);
  }
);
```

### tRPC for End-to-End Type Safety
```typescript
// server.ts
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

const t = initTRPC.create();

export const appRouter = t.router({
  getUser: t.procedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return await db.user.findUnique({ where: { id: input.id } });
    }),

  createUser: t.procedure
    .input(z.object({
      name: z.string(),
      email: z.string().email()
    }))
    .mutation(async ({ input }) => {
      return await db.user.create({ data: input });
    })
});

export type AppRouter = typeof appRouter;

// client.ts
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from './server';

const client = createTRPCProxyClient<AppRouter>({
  links: [httpBatchLink({ url: 'http://localhost:3000/trpc' })]
});

// Fully typed, no manual type definitions!
const user = await client.getUser.query({ id: 1 });
```

## Testing with TypeScript

### Vitest Tests
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from './Button';

describe('Button', () => {
  it('renders with text', () => {
    render(<Button onClick={() => {}}>Click me</Button>);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click me</Button>);

    fireEvent.click(screen.getByText('Click me'));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('is disabled when disabled prop is true', () => {
    render(<Button onClick={() => {}} disabled>Click me</Button>);
    expect(screen.getByText('Click me')).toBeDisabled();
  });
});

// Testing async functions
describe('fetchUser', () => {
  it('fetches user data', async () => {
    const user = await fetchUser(1);
    expect(user).toEqual({
      id: 1,
      name: 'John Doe',
      email: 'john@example.com'
    });
  });
});

// Mocking with types
interface Database {
  getUser(id: number): Promise<User>;
}

const mockDatabase: Database = {
  getUser: vi.fn().mockResolvedValue({
    id: 1,
    name: 'Test User'
  })
};
```

## Error Handling

### Custom Error Classes
```typescript
export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public isOperational: boolean = true
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404);
  }
}

// Usage
function getUser(id: number): User {
  const user = db.findUser(id);
  if (!user) {
    throw new NotFoundError('User');
  }
  return user;
}

// Express error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      status: 'error',
      message: err.message
    });
  } else {
    console.error(err);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});
```

### Result Type Pattern
```typescript
type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

function divide(a: number, b: number): Result<number, string> {
  if (b === 0) {
    return { ok: false, error: 'Division by zero' };
  }
  return { ok: true, value: a / b };
}

// Usage
const result = divide(10, 2);
if (result.ok) {
  console.log(result.value); // TypeScript knows this exists
} else {
  console.error(result.error); // TypeScript knows this exists
}
```

## Best Practices

### Avoid `any`
```typescript
// ❌ Bad
function process(data: any) {
  return data.value;
}

// ✅ Good
function process<T extends { value: unknown }>(data: T) {
  return data.value;
}

// Or with unknown
function process(data: unknown) {
  if (typeof data === 'object' && data !== null && 'value' in data) {
    return data.value;
  }
  throw new Error('Invalid data');
}
```

### Use Type Guards
```typescript
function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isUser(value: unknown): value is User {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'name' in value
  );
}

// Usage
function process(value: unknown) {
  if (isString(value)) {
    console.log(value.toUpperCase()); // TypeScript knows it's a string
  }
}
```

### Branded Types
```typescript
// Create distinct types from primitives
type UserId = number & { readonly brand: unique symbol };
type ProductId = number & { readonly brand: unique symbol };

function createUserId(id: number): UserId {
  return id as UserId;
}

function getUserById(id: UserId): User {
  // ...
}

const userId = createUserId(1);
const productId = 1 as ProductId;

getUserById(userId); // ✅ OK
getUserById(productId); // ❌ Type error!
```

## Tooling Configuration

### ESLint Configuration
```javascript
// eslint.config.js
import tseslint from '@typescript-eslint/eslint-plugin';
import parser from '@typescript-eslint/parser';

export default [
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser,
      parserOptions: {
        project: './tsconfig.json'
      }
    },
    plugins: {
      '@typescript-eslint': tseslint
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': 'error',
      '@typescript-eslint/strict-boolean-expressions': 'warn',
      '@typescript-eslint/no-floating-promises': 'error'
    }
  }
];
```

### Prettier Configuration
```json
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100,
  "arrowParens": "avoid"
}
```

## Additional Resources

For detailed guidance on specific topics:

### Frontend Development
- `resources/react-patterns.md` (709 lines) - React hooks, context, compound components, performance optimization, error boundaries
- `resources/nextjs-guide.md` (1,319 lines) - Next.js 14+ App Router, Server/Client Components, data fetching, Server Actions, deployment
- `resources/state-management.md` (1,355 lines) - Zustand, Redux Toolkit, TanStack Query, React Hook Form, URL state, local storage sync

### Backend Development
- `resources/api-development.md` (1,543 lines) - Express with TypeScript, tRPC, Fastify, authentication, validation, Prisma, testing
- `resources/advanced-types.md` (1,188 lines) - Generics, conditional types, mapped types, template literals, type guards, branded types

### Testing & Quality
- `resources/testing-guide.md` (1,318 lines) - Vitest, Testing Library, Playwright, mocking, coverage, CI/CD integration

**Total: 7,432+ lines of TypeScript guidance across 6 comprehensive resource files**

## Common Pitfalls to Avoid

- ❌ Using `any` instead of `unknown`
- ❌ Not enabling strict mode in tsconfig.json
- ❌ Type assertions without validation (`as` keyword)
- ❌ Not handling promise rejections
- ❌ Ignoring TypeScript errors with `@ts-ignore`
- ❌ Not using discriminated unions for state management
- ❌ Overusing optional chaining without null checks
- ❌ Not defining proper error types
