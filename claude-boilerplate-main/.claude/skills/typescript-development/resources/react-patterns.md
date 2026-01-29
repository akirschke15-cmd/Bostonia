# React Patterns with TypeScript

## Modern React Architecture

### Component Patterns

#### Function Components with TypeScript
```typescript
import { FC, ReactNode } from 'react';

// Props interface
interface ButtonProps {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  onClick?: () => void;
  loading?: boolean;
}

// Function component
export const Button: FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  onClick,
  loading = false
}) => {
  const handleClick = () => {
    if (!disabled && !loading && onClick) {
      onClick();
    }
  };

  return (
    <button
      className={`btn btn-${variant} btn-${size}`}
      disabled={disabled || loading}
      onClick={handleClick}
    >
      {loading ? <Spinner /> : children}
    </button>
  );
};
```

#### Generic Components
```typescript
interface ListProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  keyExtractor: (item: T) => string | number;
  emptyMessage?: string;
  loading?: boolean;
}

export function List<T>({
  items,
  renderItem,
  keyExtractor,
  emptyMessage = 'No items found',
  loading = false
}: ListProps<T>) {
  if (loading) {
    return <LoadingSpinner />;
  }

  if (items.length === 0) {
    return <EmptyState message={emptyMessage} />;
  }

  return (
    <ul>
      {items.map((item, index) => (
        <li key={keyExtractor(item)}>
          {renderItem(item, index)}
        </li>
      ))}
    </ul>
  );
}

// Usage
<List
  items={users}
  keyExtractor={user => user.id}
  renderItem={user => <UserCard user={user} />}
/>
```

### Custom Hooks

#### Data Fetching Hook
```typescript
import { useState, useEffect, useCallback } from 'react';

interface UseFetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: any;
  headers?: Record<string, string>;
}

interface UseFetchResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useFetch<T>(
  url: string,
  options?: UseFetchOptions
): UseFetchResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(url, {
        method: options?.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers
        },
        body: options?.body ? JSON.stringify(options.body) : undefined
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const json = await response.json();
      setData(json);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [url, options]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

// Usage
function UserProfile({ userId }: { userId: string }) {
  const { data: user, loading, error } = useFetch<User>(
    `/api/users/${userId}`
  );

  if (loading) return <Spinner />;
  if (error) return <ErrorMessage error={error} />;
  if (!user) return null;

  return <div>{user.name}</div>;
}
```

#### Form Hook
```typescript
import { useState, ChangeEvent, FormEvent } from 'react';

interface UseFormOptions<T> {
  initialValues: T;
  validate?: (values: T) => Partial<Record<keyof T, string>>;
  onSubmit: (values: T) => void | Promise<void>;
}

interface UseFormReturn<T> {
  values: T;
  errors: Partial<Record<keyof T, string>>;
  touched: Partial<Record<keyof T, boolean>>;
  handleChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  handleBlur: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  handleSubmit: (e: FormEvent<HTMLFormElement>) => void;
  setFieldValue: (field: keyof T, value: any) => void;
  resetForm: () => void;
  isSubmitting: boolean;
}

export function useForm<T extends Record<string, any>>({
  initialValues,
  validate,
  onSubmit
}: UseFormOptions<T>): UseFormReturn<T> {
  const [values, setValues] = useState<T>(initialValues);
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({});
  const [touched, setTouched] = useState<Partial<Record<keyof T, boolean>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setValues(prev => ({ ...prev, [name]: value }));
  };

  const handleBlur = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name } = e.target;
    setTouched(prev => ({ ...prev, [name]: true }));

    if (validate) {
      const validationErrors = validate(values);
      setErrors(validationErrors);
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Mark all fields as touched
    const allTouched = Object.keys(values).reduce((acc, key) => {
      acc[key as keyof T] = true;
      return acc;
    }, {} as Partial<Record<keyof T, boolean>>);
    setTouched(allTouched);

    // Validate
    const validationErrors = validate ? validate(values) : {};
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length === 0) {
      setIsSubmitting(true);
      try {
        await onSubmit(values);
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const setFieldValue = (field: keyof T, value: any) => {
    setValues(prev => ({ ...prev, [field]: value }));
  };

  const resetForm = () => {
    setValues(initialValues);
    setErrors({});
    setTouched({});
  };

  return {
    values,
    errors,
    touched,
    handleChange,
    handleBlur,
    handleSubmit,
    setFieldValue,
    resetForm,
    isSubmitting
  };
}

// Usage
function LoginForm() {
  const form = useForm({
    initialValues: { email: '', password: '' },
    validate: values => {
      const errors: any = {};
      if (!values.email) errors.email = 'Email is required';
      if (!values.password) errors.password = 'Password is required';
      return errors;
    },
    onSubmit: async values => {
      await login(values);
    }
  });

  return (
    <form onSubmit={form.handleSubmit}>
      <input
        name="email"
        value={form.values.email}
        onChange={form.handleChange}
        onBlur={form.handleBlur}
      />
      {form.touched.email && form.errors.email && (
        <span>{form.errors.email}</span>
      )}

      <button type="submit" disabled={form.isSubmitting}>
        Login
      </button>
    </form>
  );
}
```

### State Management Patterns

#### Context + useReducer
```typescript
import { createContext, useContext, useReducer, ReactNode } from 'react';

// State
interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

interface CartState {
  items: CartItem[];
  total: number;
}

// Actions
type CartAction =
  | { type: 'ADD_ITEM'; payload: CartItem }
  | { type: 'REMOVE_ITEM'; payload: string }
  | { type: 'UPDATE_QUANTITY'; payload: { id: string; quantity: number } }
  | { type: 'CLEAR_CART' };

// Reducer
function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'ADD_ITEM': {
      const existingItem = state.items.find(
        item => item.id === action.payload.id
      );

      if (existingItem) {
        return {
          ...state,
          items: state.items.map(item =>
            item.id === action.payload.id
              ? { ...item, quantity: item.quantity + 1 }
              : item
          ),
          total: state.total + action.payload.price
        };
      }

      return {
        ...state,
        items: [...state.items, action.payload],
        total: state.total + action.payload.price
      };
    }

    case 'REMOVE_ITEM': {
      const item = state.items.find(i => i.id === action.payload);
      return {
        ...state,
        items: state.items.filter(i => i.id !== action.payload),
        total: item ? state.total - item.price * item.quantity : state.total
      };
    }

    case 'UPDATE_QUANTITY': {
      const item = state.items.find(i => i.id === action.payload.id);
      if (!item) return state;

      const quantityDiff = action.payload.quantity - item.quantity;
      return {
        ...state,
        items: state.items.map(i =>
          i.id === action.payload.id
            ? { ...i, quantity: action.payload.quantity }
            : i
        ),
        total: state.total + item.price * quantityDiff
      };
    }

    case 'CLEAR_CART':
      return { items: [], total: 0 };

    default:
      return state;
  }
}

// Context
interface CartContextType {
  state: CartState;
  addItem: (item: CartItem) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, { items: [], total: 0 });

  const value: CartContextType = {
    state,
    addItem: item => dispatch({ type: 'ADD_ITEM', payload: item }),
    removeItem: id => dispatch({ type: 'REMOVE_ITEM', payload: id }),
    updateQuantity: (id, quantity) =>
      dispatch({ type: 'UPDATE_QUANTITY', payload: { id, quantity } }),
    clearCart: () => dispatch({ type: 'CLEAR_CART' })
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within CartProvider');
  }
  return context;
}

// Usage
function App() {
  return (
    <CartProvider>
      <ProductList />
      <Cart />
    </CartProvider>
  );
}

function ProductList() {
  const { addItem } = useCart();

  return (
    <button onClick={() => addItem({ id: '1', name: 'Product', price: 10, quantity: 1 })}>
      Add to Cart
    </button>
  );
}
```

### Compound Components Pattern

```typescript
import { createContext, useContext, useState, ReactNode } from 'react';

// Accordion context
interface AccordionContextType {
  activeId: string | null;
  setActiveId: (id: string | null) => void;
}

const AccordionContext = createContext<AccordionContextType | undefined>(
  undefined
);

// Main component
interface AccordionProps {
  children: ReactNode;
  defaultActiveId?: string | null;
}

export function Accordion({ children, defaultActiveId = null }: AccordionProps) {
  const [activeId, setActiveId] = useState<string | null>(defaultActiveId);

  return (
    <AccordionContext.Provider value={{ activeId, setActiveId }}>
      <div className="accordion">{children}</div>
    </AccordionContext.Provider>
  );
}

// Item component
interface AccordionItemProps {
  id: string;
  children: ReactNode;
}

Accordion.Item = function AccordionItem({ id, children }: AccordionItemProps) {
  return <div className="accordion-item">{children}</div>;
};

// Header component
interface AccordionHeaderProps {
  id: string;
  children: ReactNode;
}

Accordion.Header = function AccordionHeader({
  id,
  children
}: AccordionHeaderProps) {
  const context = useContext(AccordionContext);
  if (!context) throw new Error('AccordionHeader must be used within Accordion');

  const { activeId, setActiveId } = context;
  const isActive = activeId === id;

  return (
    <button
      className={`accordion-header ${isActive ? 'active' : ''}`}
      onClick={() => setActiveId(isActive ? null : id)}
    >
      {children}
    </button>
  );
};

// Panel component
interface AccordionPanelProps {
  id: string;
  children: ReactNode;
}

Accordion.Panel = function AccordionPanel({
  id,
  children
}: AccordionPanelProps) {
  const context = useContext(AccordionContext);
  if (!context) throw new Error('AccordionPanel must be used within Accordion');

  const { activeId } = context;
  const isActive = activeId === id;

  if (!isActive) return null;

  return <div className="accordion-panel">{children}</div>;
};

// Usage
function FAQ() {
  return (
    <Accordion defaultActiveId="1">
      <Accordion.Item id="1">
        <Accordion.Header id="1">What is React?</Accordion.Header>
        <Accordion.Panel id="1">React is a JavaScript library...</Accordion.Panel>
      </Accordion.Item>

      <Accordion.Item id="2">
        <Accordion.Header id="2">What is TypeScript?</Accordion.Header>
        <Accordion.Panel id="2">TypeScript is a typed superset...</Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
}
```

### Render Props Pattern

```typescript
interface MousePosition {
  x: number;
  y: number;
}

interface MouseTrackerProps {
  render: (position: MousePosition) => ReactNode;
}

function MouseTracker({ render }: MouseTrackerProps) {
  const [position, setPosition] = useState<MousePosition>({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      setPosition({ x: event.clientX, y: event.clientY });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return <>{render(position)}</>;
}

// Usage
function App() {
  return (
    <MouseTracker
      render={({ x, y }) => (
        <div>
          Mouse position: {x}, {y}
        </div>
      )}
    />
  );
}
```

### Performance Optimization

#### useMemo and useCallback
```typescript
import { useMemo, useCallback, useState, memo } from 'react';

function ExpensiveComponent({ items }: { items: Item[] }) {
  const [filter, setFilter] = useState('');

  // Memoize expensive computation
  const filteredItems = useMemo(() => {
    console.log('Filtering items...');
    return items.filter(item =>
      item.name.toLowerCase().includes(filter.toLowerCase())
    );
  }, [items, filter]);

  // Memoize callback
  const handleItemClick = useCallback((id: string) => {
    console.log('Clicked:', id);
  }, []);

  return (
    <div>
      <input value={filter} onChange={e => setFilter(e.target.value)} />
      {filteredItems.map(item => (
        <Item key={item.id} item={item} onClick={handleItemClick} />
      ))}
    </div>
  );
}

// Child component with memo
interface ItemProps {
  item: Item;
  onClick: (id: string) => void;
}

const Item = memo<ItemProps>(({ item, onClick }) => {
  console.log('Rendering item:', item.id);
  return <div onClick={() => onClick(item.id)}>{item.name}</div>;
});
```

#### Code Splitting
```typescript
import { lazy, Suspense } from 'react';

// Lazy load components
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Profile = lazy(() => import('./pages/Profile'));
const Settings = lazy(() => import('./pages/Settings'));

function App() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </Suspense>
  );
}
```

### Error Boundaries

```typescript
import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
    // Log to error reporting service
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div>
            <h1>Something went wrong</h1>
            <details>
              <summary>Error details</summary>
              <pre>{this.state.error?.message}</pre>
            </details>
          </div>
        )
      );
    }

    return this.props.children;
  }
}

// Usage
function App() {
  return (
    <ErrorBoundary fallback={<ErrorFallback />}>
      <MyComponent />
    </ErrorBoundary>
  );
}
```

These patterns provide a solid foundation for building scalable, maintainable React applications with TypeScript.
