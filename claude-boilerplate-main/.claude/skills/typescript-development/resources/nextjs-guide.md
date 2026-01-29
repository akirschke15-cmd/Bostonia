# Next.js 14+ App Router Guide

## Introduction to Next.js App Router

Next.js 14 introduced significant improvements to the App Router, providing a powerful framework for building modern web applications with React Server Components, streaming, and enhanced data fetching patterns.

## App Router vs Pages Router

### Directory Structure Comparison

```typescript
// Pages Router (Legacy)
pages/
  index.tsx              // Route: /
  about.tsx              // Route: /about
  blog/
    [slug].tsx          // Route: /blog/:slug
  api/
    users.ts            // API: /api/users

// App Router (Modern)
app/
  page.tsx              // Route: /
  about/
    page.tsx            // Route: /about
  blog/
    [slug]/
      page.tsx          // Route: /blog/:slug
  api/
    users/
      route.ts          // API: /api/users
```

### Migration Example

```typescript
// Pages Router
// pages/products/[id].tsx
import { GetServerSideProps } from 'next';

interface Product {
  id: string;
  name: string;
  price: number;
}

interface Props {
  product: Product;
}

export default function ProductPage({ product }: Props) {
  return <div>{product.name}</div>;
}

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const product = await fetchProduct(context.params?.id as string);
  return { props: { product } };
};
```

```typescript
// App Router
// app/products/[id]/page.tsx
interface Product {
  id: string;
  name: string;
  price: number;
}

async function getProduct(id: string): Promise<Product> {
  const res = await fetch(`https://api.example.com/products/${id}`, {
    next: { revalidate: 3600 } // Cache for 1 hour
  });

  if (!res.ok) throw new Error('Failed to fetch product');
  return res.json();
}

export default async function ProductPage({
  params
}: {
  params: { id: string }
}) {
  const product = await getProduct(params.id);

  return (
    <div>
      <h1>{product.name}</h1>
      <p>${product.price}</p>
    </div>
  );
}

// Generate metadata
export async function generateMetadata({
  params
}: {
  params: { id: string }
}) {
  const product = await getProduct(params.id);

  return {
    title: product.name,
    description: `Buy ${product.name} for $${product.price}`
  };
}
```

## Server Components vs Client Components

### Server Components (Default)

```typescript
// app/components/ProductList.tsx
// This is a Server Component by default

interface Product {
  id: string;
  name: string;
  price: number;
}

async function getProducts(): Promise<Product[]> {
  // Direct database access (no API needed)
  const products = await db.product.findMany();
  return products;
}

export default async function ProductList() {
  const products = await getProducts();

  return (
    <div>
      {products.map(product => (
        <div key={product.id}>
          <h2>{product.name}</h2>
          <p>${product.price}</p>
        </div>
      ))}
    </div>
  );
}

// Benefits:
// - No JavaScript sent to client
// - Direct database/API access
// - Automatic code splitting
// - Better SEO
```

### Client Components

```typescript
// app/components/AddToCart.tsx
'use client';

import { useState } from 'react';

interface AddToCartProps {
  productId: string;
  productName: string;
}

export default function AddToCart({ productId, productName }: AddToCartProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [count, setCount] = useState(1);

  const handleAddToCart = async () => {
    setIsAdding(true);
    try {
      await fetch('/api/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, quantity: count })
      });

      alert(`Added ${count} ${productName} to cart`);
    } catch (error) {
      console.error('Failed to add to cart:', error);
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div>
      <input
        type="number"
        min="1"
        value={count}
        onChange={(e) => setCount(parseInt(e.target.value))}
      />
      <button onClick={handleAddToCart} disabled={isAdding}>
        {isAdding ? 'Adding...' : 'Add to Cart'}
      </button>
    </div>
  );
}

// Use 'use client' when you need:
// - useState, useEffect, or other hooks
// - Event listeners (onClick, onChange)
// - Browser APIs
// - Third-party libraries that use hooks
```

### Combining Server and Client Components

```typescript
// app/products/[id]/page.tsx (Server Component)
import { AddToCart } from '@/components/AddToCart';
import { ProductReviews } from '@/components/ProductReviews';

interface Product {
  id: string;
  name: string;
  price: number;
  description: string;
}

async function getProduct(id: string): Promise<Product> {
  const res = await fetch(`https://api.example.com/products/${id}`);
  return res.json();
}

export default async function ProductPage({
  params
}: {
  params: { id: string }
}) {
  // Fetch on server
  const product = await getProduct(params.id);

  return (
    <div>
      {/* Server-rendered content */}
      <h1>{product.name}</h1>
      <p>{product.description}</p>
      <p>${product.price}</p>

      {/* Client component for interactivity */}
      <AddToCart productId={product.id} productName={product.name} />

      {/* Server component with async data */}
      <ProductReviews productId={product.id} />
    </div>
  );
}
```

## File-Based Routing

### Special Files

```typescript
// app/layout.tsx - Root layout (required)
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'My App',
  description: 'Built with Next.js 14'
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <header>Global Header</header>
        {children}
        <footer>Global Footer</footer>
      </body>
    </html>
  );
}
```

```typescript
// app/dashboard/layout.tsx - Nested layout
export default function DashboardLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="dashboard-container">
      <aside className="sidebar">
        <nav>Dashboard Navigation</nav>
      </aside>
      <main>{children}</main>
    </div>
  );
}
```

```typescript
// app/dashboard/template.tsx - Template (resets state)
export default function DashboardTemplate({
  children
}: {
  children: React.ReactNode;
}) {
  // Template re-renders on navigation (unlike layout)
  return <div className="dashboard-wrapper">{children}</div>;
}
```

```typescript
// app/loading.tsx - Loading UI
export default function Loading() {
  return (
    <div className="loading-spinner">
      <div className="spinner" />
      Loading...
    </div>
  );
}
```

```typescript
// app/error.tsx - Error handling
'use client';

export default function Error({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div>
      <h2>Something went wrong!</h2>
      <p>{error.message}</p>
      <button onClick={reset}>Try again</button>
    </div>
  );
}
```

```typescript
// app/not-found.tsx - 404 page
import Link from 'next/link';

export default function NotFound() {
  return (
    <div>
      <h2>Not Found</h2>
      <p>Could not find requested resource</p>
      <Link href="/">Return Home</Link>
    </div>
  );
}
```

### Dynamic Routes

```typescript
// app/blog/[slug]/page.tsx - Single dynamic segment
interface PageProps {
  params: { slug: string };
  searchParams: { [key: string]: string | string[] | undefined };
}

export default async function BlogPost({ params, searchParams }: PageProps) {
  const post = await getPost(params.slug);

  return (
    <article>
      <h1>{post.title}</h1>
      <div>{post.content}</div>
    </article>
  );
}

// Generate static params for static generation
export async function generateStaticParams() {
  const posts = await getAllPosts();

  return posts.map(post => ({
    slug: post.slug
  }));
}
```

```typescript
// app/shop/[...slug]/page.tsx - Catch-all segments
interface PageProps {
  params: { slug: string[] };
}

export default function ShopPage({ params }: PageProps) {
  // /shop/a => ['a']
  // /shop/a/b => ['a', 'b']
  // /shop/a/b/c => ['a', 'b', 'c']

  const category = params.slug[0];
  const subcategory = params.slug[1];
  const product = params.slug[2];

  return <div>Category: {category}</div>;
}
```

```typescript
// app/docs/[[...slug]]/page.tsx - Optional catch-all
interface PageProps {
  params: { slug?: string[] };
}

export default function DocsPage({ params }: PageProps) {
  // /docs => undefined
  // /docs/a => ['a']
  // /docs/a/b => ['a', 'b']

  if (!params.slug) {
    return <DocsHome />;
  }

  return <DocPage slug={params.slug} />;
}
```

## Data Fetching

### Server-Side Fetching

```typescript
// app/posts/page.tsx
interface Post {
  id: string;
  title: string;
  content: string;
  createdAt: string;
}

// Static Generation (default)
async function getPosts(): Promise<Post[]> {
  const res = await fetch('https://api.example.com/posts', {
    next: { revalidate: 3600 } // Revalidate every hour
  });

  if (!res.ok) throw new Error('Failed to fetch posts');
  return res.json();
}

export default async function PostsPage() {
  const posts = await getPosts();

  return (
    <div>
      {posts.map(post => (
        <article key={post.id}>
          <h2>{post.title}</h2>
          <p>{post.content}</p>
        </article>
      ))}
    </div>
  );
}
```

```typescript
// Dynamic rendering
async function getUserData(userId: string) {
  const res = await fetch(`https://api.example.com/users/${userId}`, {
    cache: 'no-store' // Always fetch fresh data
  });

  return res.json();
}

// Or use dynamic functions to opt into dynamic rendering
import { cookies, headers } from 'next/headers';

export default async function UserPage() {
  const cookieStore = cookies();
  const token = cookieStore.get('token');

  const headersList = headers();
  const userAgent = headersList.get('user-agent');

  // This page will be dynamically rendered
  return <div>User data</div>;
}
```

### Parallel Data Fetching

```typescript
// app/dashboard/page.tsx
interface User {
  id: string;
  name: string;
}

interface Stats {
  views: number;
  likes: number;
}

interface Activity {
  id: string;
  action: string;
  timestamp: string;
}

async function getUser(): Promise<User> {
  const res = await fetch('https://api.example.com/user');
  return res.json();
}

async function getStats(): Promise<Stats> {
  const res = await fetch('https://api.example.com/stats');
  return res.json();
}

async function getActivity(): Promise<Activity[]> {
  const res = await fetch('https://api.example.com/activity');
  return res.json();
}

export default async function Dashboard() {
  // Fetch in parallel
  const [user, stats, activity] = await Promise.all([
    getUser(),
    getStats(),
    getActivity()
  ]);

  return (
    <div>
      <h1>Welcome, {user.name}</h1>
      <div>Views: {stats.views}</div>
      <div>
        {activity.map(item => (
          <div key={item.id}>{item.action}</div>
        ))}
      </div>
    </div>
  );
}
```

### Streaming with Suspense

```typescript
// app/products/page.tsx
import { Suspense } from 'react';

async function FeaturedProducts() {
  // Slow query
  await new Promise(resolve => setTimeout(resolve, 3000));
  const products = await getFeaturedProducts();

  return (
    <div>
      {products.map(product => (
        <div key={product.id}>{product.name}</div>
      ))}
    </div>
  );
}

async function AllProducts() {
  // Fast query
  const products = await getAllProducts();

  return (
    <div>
      {products.map(product => (
        <div key={product.id}>{product.name}</div>
      ))}
    </div>
  );
}

export default function ProductsPage() {
  return (
    <div>
      <h1>Products</h1>

      {/* Featured products load slowly, show fallback */}
      <Suspense fallback={<div>Loading featured products...</div>}>
        <FeaturedProducts />
      </Suspense>

      {/* All products load immediately */}
      <Suspense fallback={<div>Loading all products...</div>}>
        <AllProducts />
      </Suspense>
    </div>
  );
}
```

## Route Handlers (API Routes)

### Basic Route Handler

```typescript
// app/api/users/route.ts
import { NextRequest, NextResponse } from 'next/server';

interface User {
  id: string;
  name: string;
  email: string;
}

// GET /api/users
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('query');

  const users = await db.user.findMany({
    where: query ? { name: { contains: query } } : undefined
  });

  return NextResponse.json(users);
}

// POST /api/users
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const user = await db.user.create({
      data: {
        name: body.name,
        email: body.email
      }
    });

    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to create user' },
      { status: 500 }
    );
  }
}
```

### Dynamic Route Handler

```typescript
// app/api/users/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';

interface RouteContext {
  params: { id: string };
}

// GET /api/users/:id
export async function GET(
  request: NextRequest,
  { params }: RouteContext
) {
  const user = await db.user.findUnique({
    where: { id: params.id }
  });

  if (!user) {
    return NextResponse.json(
      { error: 'User not found' },
      { status: 404 }
    );
  }

  return NextResponse.json(user);
}

// PATCH /api/users/:id
export async function PATCH(
  request: NextRequest,
  { params }: RouteContext
) {
  const body = await request.json();

  const user = await db.user.update({
    where: { id: params.id },
    data: body
  });

  return NextResponse.json(user);
}

// DELETE /api/users/:id
export async function DELETE(
  request: NextRequest,
  { params }: RouteContext
) {
  await db.user.delete({
    where: { id: params.id }
  });

  return new NextResponse(null, { status: 204 });
}
```

### Headers and Cookies

```typescript
// app/api/auth/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  const body = await request.json();

  // Authenticate user
  const user = await authenticateUser(body.email, body.password);

  if (!user) {
    return NextResponse.json(
      { error: 'Invalid credentials' },
      { status: 401 }
    );
  }

  // Set cookie
  const cookieStore = cookies();
  cookieStore.set('token', user.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 60 * 24 * 7 // 1 week
  });

  // Set headers
  const response = NextResponse.json({ user });
  response.headers.set('X-Custom-Header', 'value');

  return response;
}
```

## Middleware

```typescript
// middleware.ts (in root)
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Check authentication
  const token = request.cookies.get('token');

  // Protect routes
  if (request.nextUrl.pathname.startsWith('/dashboard')) {
    if (!token) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  // Add custom header
  const response = NextResponse.next();
  response.headers.set('x-custom-header', 'value');

  // Rewrite
  if (request.nextUrl.pathname === '/old-path') {
    return NextResponse.rewrite(new URL('/new-path', request.url));
  }

  return response;
}

// Configure which routes middleware runs on
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - api routes
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)'
  ]
};
```

### Advanced Middleware Patterns

```typescript
// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Rate limiting
const rateLimit = new Map<string, number[]>();

function checkRateLimit(ip: string, limit: number, window: number): boolean {
  const now = Date.now();
  const timestamps = rateLimit.get(ip) || [];

  // Remove old timestamps
  const validTimestamps = timestamps.filter(t => now - t < window);

  if (validTimestamps.length >= limit) {
    return false;
  }

  validTimestamps.push(now);
  rateLimit.set(ip, validTimestamps);
  return true;
}

export function middleware(request: NextRequest) {
  // Get client IP
  const ip = request.ip || 'unknown';

  // Rate limit API routes
  if (request.nextUrl.pathname.startsWith('/api')) {
    const allowed = checkRateLimit(ip, 100, 60000); // 100 requests per minute

    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429 }
      );
    }
  }

  // Geolocation
  const country = request.geo?.country || 'unknown';
  const response = NextResponse.next();
  response.headers.set('x-user-country', country);

  // A/B testing
  const bucket = Math.random() < 0.5 ? 'A' : 'B';
  response.cookies.set('ab-test-bucket', bucket);

  return response;
}
```

## Static and Dynamic Rendering

### Force Static Rendering

```typescript
// app/posts/page.tsx
export const dynamic = 'force-static';

export default async function PostsPage() {
  const posts = await getPosts();
  return <div>{/* Render posts */}</div>;
}
```

### Force Dynamic Rendering

```typescript
// app/dashboard/page.tsx
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function DashboardPage() {
  // Always fetches fresh data
  const data = await getCurrentUserData();
  return <div>{/* Render dashboard */}</div>;
}
```

### Incremental Static Regeneration (ISR)

```typescript
// app/blog/[slug]/page.tsx
interface Post {
  slug: string;
  title: string;
  content: string;
}

// Revalidate every 60 seconds
export const revalidate = 60;

async function getPost(slug: string): Promise<Post> {
  const res = await fetch(`https://api.example.com/posts/${slug}`);
  return res.json();
}

export default async function BlogPost({
  params
}: {
  params: { slug: string }
}) {
  const post = await getPost(params.slug);

  return (
    <article>
      <h1>{post.title}</h1>
      <div>{post.content}</div>
    </article>
  );
}

export async function generateStaticParams() {
  const posts = await fetch('https://api.example.com/posts').then(r => r.json());

  return posts.map((post: Post) => ({
    slug: post.slug
  }));
}
```

## Image Optimization

```typescript
// app/gallery/page.tsx
import Image from 'next/image';

interface ImageData {
  id: string;
  url: string;
  alt: string;
  width: number;
  height: number;
}

export default function Gallery({ images }: { images: ImageData[] }) {
  return (
    <div className="grid">
      {images.map(image => (
        <div key={image.id}>
          {/* Optimized image with automatic WebP conversion */}
          <Image
            src={image.url}
            alt={image.alt}
            width={image.width}
            height={image.height}
            quality={90}
            priority={false} // Set true for above-the-fold images
            placeholder="blur" // Shows blur placeholder while loading
            blurDataURL="data:image/..." // Base64 blur placeholder
          />
        </div>
      ))}
    </div>
  );
}

// Fill mode for responsive images
function ResponsiveImage() {
  return (
    <div style={{ position: 'relative', width: '100%', height: '400px' }}>
      <Image
        src="/hero.jpg"
        alt="Hero image"
        fill
        style={{ objectFit: 'cover' }}
        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
      />
    </div>
  );
}
```

## Metadata API

```typescript
// app/blog/[slug]/page.tsx
import type { Metadata, ResolvingMetadata } from 'next';

interface Props {
  params: { slug: string };
}

// Static metadata
export const metadata: Metadata = {
  title: 'My Blog',
  description: 'Read the latest posts'
};

// Dynamic metadata
export async function generateMetadata(
  { params }: Props,
  parent: ResolvingMetadata
): Promise<Metadata> {
  const post = await getPost(params.slug);

  // Access parent metadata
  const previousImages = (await parent).openGraph?.images || [];

  return {
    title: post.title,
    description: post.excerpt,
    openGraph: {
      title: post.title,
      description: post.excerpt,
      images: [post.image, ...previousImages],
      type: 'article',
      publishedTime: post.publishedAt,
      authors: [post.author.name]
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.excerpt,
      images: [post.image]
    },
    alternates: {
      canonical: `https://example.com/blog/${post.slug}`
    }
  };
}

export default async function BlogPost({ params }: Props) {
  const post = await getPost(params.slug);
  return <article>{post.content}</article>;
}
```

## Server Actions

```typescript
// app/actions.ts
'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { redirect } from 'next/navigation';

interface CreatePostData {
  title: string;
  content: string;
  authorId: string;
}

export async function createPost(formData: FormData) {
  const title = formData.get('title') as string;
  const content = formData.get('content') as string;

  // Validate
  if (!title || !content) {
    return { error: 'Title and content are required' };
  }

  // Create post
  const post = await db.post.create({
    data: { title, content, authorId: 'current-user-id' }
  });

  // Revalidate the posts page
  revalidatePath('/posts');

  // Or revalidate by cache tag
  revalidateTag('posts');

  // Redirect to new post
  redirect(`/posts/${post.id}`);
}

export async function updatePost(id: string, data: Partial<CreatePostData>) {
  const post = await db.post.update({
    where: { id },
    data
  });

  revalidatePath(`/posts/${id}`);
  return { post };
}

export async function deletePost(id: string) {
  await db.post.delete({
    where: { id }
  });

  revalidatePath('/posts');
  redirect('/posts');
}
```

### Using Server Actions

```typescript
// app/posts/new/page.tsx
import { createPost } from '@/app/actions';
import { SubmitButton } from '@/components/SubmitButton';

export default function NewPostPage() {
  return (
    <form action={createPost}>
      <input name="title" type="text" placeholder="Title" required />
      <textarea name="content" placeholder="Content" required />
      <SubmitButton />
    </form>
  );
}

// components/SubmitButton.tsx
'use client';

import { useFormStatus } from 'react-dom';

export function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending}>
      {pending ? 'Creating...' : 'Create Post'}
    </button>
  );
}
```

```typescript
// With client-side handling
'use client';

import { updatePost } from '@/app/actions';
import { useState, useTransition } from 'react';

export default function EditPostForm({ post }: { post: Post }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (formData: FormData) => {
    startTransition(async () => {
      const result = await updatePost(post.id, {
        title: formData.get('title') as string,
        content: formData.get('content') as string
      });

      if ('error' in result) {
        setError(result.error);
      }
    });
  };

  return (
    <form action={handleSubmit}>
      <input name="title" defaultValue={post.title} />
      <textarea name="content" defaultValue={post.content} />
      {error && <div className="error">{error}</div>}
      <button type="submit" disabled={isPending}>
        {isPending ? 'Saving...' : 'Save'}
      </button>
    </form>
  );
}
```

## Best Practices

### 1. Use Server Components by Default

```typescript
// Good: Server Component (default)
export default async function ProductsPage() {
  const products = await getProducts();
  return <ProductList products={products} />;
}

// Bad: Client Component when not needed
'use client';
export default function ProductsPage() {
  const [products, setProducts] = useState([]);

  useEffect(() => {
    fetch('/api/products')
      .then(r => r.json())
      .then(setProducts);
  }, []);

  return <ProductList products={products} />;
}
```

### 2. Collocate Client Components

```typescript
// Good: Client component is a leaf node
// app/page.tsx (Server Component)
import { InteractiveButton } from '@/components/InteractiveButton';

export default async function Page() {
  const data = await getData();

  return (
    <div>
      <h1>{data.title}</h1>
      <InteractiveButton />
    </div>
  );
}

// Bad: Entire tree becomes client component
'use client';
export default function Page() {
  const data = useData(); // Could be done on server
  return <div>{/* ... */}</div>;
}
```

### 3. Optimize Data Fetching

```typescript
// Good: Parallel fetching
const [user, posts, comments] = await Promise.all([
  getUser(),
  getPosts(),
  getComments()
]);

// Bad: Sequential fetching
const user = await getUser();
const posts = await getPosts();
const comments = await getComments();
```

### 4. Use Proper Caching Strategies

```typescript
// Static data (revalidate periodically)
fetch('https://api.example.com/posts', {
  next: { revalidate: 3600 }
});

// Dynamic data (always fresh)
fetch('https://api.example.com/user', {
  cache: 'no-store'
});

// Tag-based revalidation
fetch('https://api.example.com/products', {
  next: { tags: ['products'] }
});
// Then: revalidateTag('products')
```

## Deployment Best Practices

### Environment Variables

```typescript
// .env.local
DATABASE_URL="postgresql://..."
NEXT_PUBLIC_API_URL="https://api.example.com"
SECRET_KEY="..."

// Access in Server Components and Route Handlers
const dbUrl = process.env.DATABASE_URL;

// Access in Client Components (must have NEXT_PUBLIC_ prefix)
const apiUrl = process.env.NEXT_PUBLIC_API_URL;
```

### Build Optimization

```typescript
// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable strict mode
  reactStrictMode: true,

  // Image domains
  images: {
    domains: ['cdn.example.com'],
    formats: ['image/webp', 'image/avif']
  },

  // Enable SWC minification
  swcMinify: true,

  // Compression
  compress: true,

  // Generate standalone output for Docker
  output: 'standalone'
};

module.exports = nextConfig;
```

### Docker Deployment

```dockerfile
# Dockerfile
FROM node:18-alpine AS base

# Dependencies
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Builder
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Runner
FROM base AS runner
WORKDIR /app
ENV NODE_ENV production

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000
ENV PORT 3000

CMD ["node", "server.js"]
```

This guide covers the essential patterns and best practices for building modern Next.js 14+ applications with the App Router.
