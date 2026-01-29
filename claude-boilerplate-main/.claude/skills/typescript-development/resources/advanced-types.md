# Advanced TypeScript Type Patterns

## Introduction

This guide explores advanced TypeScript type patterns for building type-safe, maintainable applications. These patterns leverage TypeScript's powerful type system to catch errors at compile time and improve developer experience.

## Generic Types and Constraints

### Basic Generics

```typescript
// Generic function
function identity<T>(value: T): T {
  return value;
}

const num = identity<number>(42); // number
const str = identity<string>("hello"); // string
const auto = identity(true); // boolean (type inference)

// Generic interface
interface Box<T> {
  value: T;
}

const numberBox: Box<number> = { value: 42 };
const stringBox: Box<string> = { value: "hello" };

// Generic class
class GenericNumber<T> {
  zeroValue: T;
  add: (x: T, y: T) => T;

  constructor(zero: T, addFn: (x: T, y: T) => T) {
    this.zeroValue = zero;
    this.add = addFn;
  }
}

const myGenericNumber = new GenericNumber<number>(
  0,
  (x, y) => x + y
);
```

### Generic Constraints

```typescript
// Constraint with extends
interface HasLength {
  length: number;
}

function logLength<T extends HasLength>(arg: T): T {
  console.log(arg.length);
  return arg;
}

logLength("hello"); // OK: string has length
logLength([1, 2, 3]); // OK: array has length
logLength({ length: 10, value: 3 }); // OK: has length property
// logLength(42); // Error: number doesn't have length

// Multiple type parameters with constraints
function merge<T extends object, U extends object>(obj1: T, obj2: U): T & U {
  return { ...obj1, ...obj2 };
}

const merged = merge({ name: "John" }, { age: 30 });
// merged: { name: string; age: number; }

// Constraining to keys of an object
function getProperty<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}

const person = { name: "John", age: 30 };
const name = getProperty(person, "name"); // string
const age = getProperty(person, "age"); // number
// getProperty(person, "email"); // Error: "email" not in person
```

### Advanced Generic Patterns

```typescript
// Generic factory function
type Constructor<T> = new (...args: any[]) => T;

function createInstance<T>(ctor: Constructor<T>, ...args: any[]): T {
  return new ctor(...args);
}

class User {
  constructor(public name: string) {}
}

const user = createInstance(User, "John");

// Generic repository pattern
interface Entity {
  id: string;
}

class Repository<T extends Entity> {
  private items: Map<string, T> = new Map();

  create(item: T): void {
    this.items.set(item.id, item);
  }

  read(id: string): T | undefined {
    return this.items.get(id);
  }

  update(item: T): void {
    this.items.set(item.id, item);
  }

  delete(id: string): void {
    this.items.delete(id);
  }

  findAll(): T[] {
    return Array.from(this.items.values());
  }

  findBy<K extends keyof T>(key: K, value: T[K]): T[] {
    return this.findAll().filter((item) => item[key] === value);
  }
}

interface User extends Entity {
  name: string;
  email: string;
}

const userRepo = new Repository<User>();
userRepo.create({ id: "1", name: "John", email: "john@example.com" });

const users = userRepo.findBy("name", "John"); // Type-safe!
```

## Conditional Types

### Basic Conditional Types

```typescript
// T extends U ? X : Y
type IsString<T> = T extends string ? true : false;

type A = IsString<string>; // true
type B = IsString<number>; // false

// Extract non-nullable types
type NonNullable<T> = T extends null | undefined ? never : T;

type C = NonNullable<string | null>; // string
type D = NonNullable<number | undefined>; // number

// Flatten array type
type Flatten<T> = T extends Array<infer U> ? U : T;

type E = Flatten<string[]>; // string
type F = Flatten<number>; // number
```

### Distributive Conditional Types

```typescript
// Conditional types distribute over union types
type ToArray<T> = T extends any ? T[] : never;

type G = ToArray<string | number>; // string[] | number[]

// Extract function return types
type ReturnType<T> = T extends (...args: any[]) => infer R ? R : never;

type H = ReturnType<() => string>; // string
type I = ReturnType<(x: number) => boolean>; // boolean

// Extract function parameters
type Parameters<T> = T extends (...args: infer P) => any ? P : never;

type J = Parameters<(a: string, b: number) => void>; // [string, number]
```

### Complex Conditional Types

```typescript
// Promise unwrapping
type Awaited<T> = T extends Promise<infer U>
  ? U extends Promise<any>
    ? Awaited<U>
    : U
  : T;

type K = Awaited<Promise<string>>; // string
type L = Awaited<Promise<Promise<number>>>; // number

// Function overload resolution
type UnionToIntersection<U> = (
  U extends any ? (k: U) => void : never
) extends (k: infer I) => void
  ? I
  : never;

type M = UnionToIntersection<{ a: string } | { b: number }>;
// { a: string } & { b: number }

// Remove readonly
type Mutable<T> = {
  -readonly [P in keyof T]: T[P];
};

interface ReadonlyUser {
  readonly id: string;
  readonly name: string;
}

type MutableUser = Mutable<ReadonlyUser>;
// { id: string; name: string; }
```

## Mapped Types

### Basic Mapped Types

```typescript
// Make all properties optional
type Partial<T> = {
  [P in keyof T]?: T[P];
};

// Make all properties required
type Required<T> = {
  [P in keyof T]-?: T[P];
};

// Make all properties readonly
type Readonly<T> = {
  readonly [P in keyof T]: T[P];
};

// Pick specific properties
type Pick<T, K extends keyof T> = {
  [P in K]: T[P];
};

// Omit specific properties
type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;

// Example usage
interface User {
  id: string;
  name: string;
  email: string;
  age: number;
}

type PartialUser = Partial<User>; // All optional
type RequiredUser = Required<PartialUser>; // All required
type ReadonlyUser = Readonly<User>; // All readonly
type UserPreview = Pick<User, "id" | "name">; // Only id and name
type UserWithoutEmail = Omit<User, "email">; // All except email
```

### Advanced Mapped Types

```typescript
// Transform property types
type Nullable<T> = {
  [P in keyof T]: T[P] | null;
};

type StringifyProperties<T> = {
  [P in keyof T]: string;
};

interface User {
  id: number;
  name: string;
  age: number;
}

type NullableUser = Nullable<User>;
// { id: number | null; name: string | null; age: number | null; }

type StringUser = StringifyProperties<User>;
// { id: string; name: string; age: string; }

// Getters type
type Getters<T> = {
  [P in keyof T as `get${Capitalize<string & P>}`]: () => T[P];
};

type UserGetters = Getters<User>;
// {
//   getId: () => number;
//   getName: () => string;
//   getAge: () => number;
// }

// Filter properties by type
type FilterByType<T, ValueType> = {
  [P in keyof T as T[P] extends ValueType ? P : never]: T[P];
};

interface Mixed {
  id: number;
  name: string;
  age: number;
  active: boolean;
}

type StringProps = FilterByType<Mixed, string>; // { name: string; }
type NumberProps = FilterByType<Mixed, number>; // { id: number; age: number; }
```

### Key Remapping in Mapped Types

```typescript
// Remove specific prefix
type RemovePrefix<T, Prefix extends string> = {
  [K in keyof T as K extends `${Prefix}${infer Rest}` ? Rest : K]: T[K];
};

interface PrefixedUser {
  user_id: string;
  user_name: string;
  user_email: string;
}

type CleanUser = RemovePrefix<PrefixedUser, "user_">;
// { id: string; name: string; email: string; }

// Event handlers
type EventHandlers<T> = {
  [K in keyof T as `on${Capitalize<string & K>}Change`]: (
    value: T[K]
  ) => void;
};

interface FormFields {
  email: string;
  password: string;
  age: number;
}

type FormHandlers = EventHandlers<FormFields>;
// {
//   onEmailChange: (value: string) => void;
//   onPasswordChange: (value: string) => void;
//   onAgeChange: (value: number) => void;
// }
```

## Template Literal Types

### Basic Template Literals

```typescript
// String literal types as templates
type World = "world";
type Greeting = `hello ${World}`; // "hello world"

// Union distribution
type Color = "red" | "blue" | "green";
type Shade = "light" | "dark";
type ColorShade = `${Shade}-${Color}`;
// "light-red" | "light-blue" | "light-green" | "dark-red" | "dark-blue" | "dark-green"

// Event names
type EventName<T extends string> = `on${Capitalize<T>}`;

type MouseEvent = EventName<"click" | "hover" | "scroll">;
// "onClick" | "onHover" | "onScroll"
```

### Advanced Template Literal Patterns

```typescript
// Path builder
type Join<T extends string[], D extends string> = T extends [
  infer F extends string,
  ...infer R extends string[]
]
  ? R extends []
    ? F
    : `${F}${D}${Join<R, D>}`
  : never;

type Path = Join<["api", "users", "profile"], "/">;
// "api/users/profile"

// Route parameters
type RouteParams<T extends string> =
  T extends `${infer _Start}:${infer Param}/${infer Rest}`
    ? Param | RouteParams<Rest>
    : T extends `${infer _Start}:${infer Param}`
    ? Param
    : never;

type UserRoute = RouteParams<"/users/:userId/posts/:postId">;
// "userId" | "postId"

// CSS properties
type CSSValue = string | number;

type CSSProperties = {
  [K in
    | "margin"
    | "padding"
    | "border"
    | "background" as `${K}${
    | ""
    | "Top"
    | "Right"
    | "Bottom"
    | "Left"}`]?: CSSValue;
};

const styles: CSSProperties = {
  margin: "10px",
  marginTop: "20px",
  paddingLeft: 5
};
```

## Utility Types (Built-in and Custom)

### Built-in Utility Types

```typescript
// Partial<T> - Make all properties optional
interface Todo {
  title: string;
  description: string;
  completed: boolean;
}

type PartialTodo = Partial<Todo>;
// {
//   title?: string;
//   description?: string;
//   completed?: boolean;
// }

// Required<T> - Make all properties required
type RequiredTodo = Required<PartialTodo>;

// Readonly<T> - Make all properties readonly
type ReadonlyTodo = Readonly<Todo>;

// Record<K, T> - Create object type with keys K and values T
type PageInfo = {
  title: string;
  url: string;
};

type Page = "home" | "about" | "contact";
type PageMap = Record<Page, PageInfo>;

// Pick<T, K> - Pick specific properties
type TodoPreview = Pick<Todo, "title" | "completed">;
// { title: string; completed: boolean; }

// Omit<T, K> - Omit specific properties
type TodoInfo = Omit<Todo, "completed">;
// { title: string; description: string; }

// Exclude<T, U> - Exclude types from union
type T0 = Exclude<"a" | "b" | "c", "a">; // "b" | "c"
type T1 = Exclude<string | number | boolean, boolean>; // string | number

// Extract<T, U> - Extract types from union
type T2 = Extract<"a" | "b" | "c", "a" | "f">; // "a"
type T3 = Extract<string | number | boolean, number>; // number

// NonNullable<T> - Remove null and undefined
type T4 = NonNullable<string | null | undefined>; // string

// ReturnType<T> - Get function return type
function createUser() {
  return { id: 1, name: "John" };
}

type User = ReturnType<typeof createUser>;
// { id: number; name: string; }

// Parameters<T> - Get function parameters as tuple
function greet(name: string, age: number) {
  console.log(`Hello ${name}, you are ${age}`);
}

type GreetParams = Parameters<typeof greet>; // [string, number]

// InstanceType<T> - Get instance type of constructor
class Person {
  constructor(public name: string) {}
}

type PersonInstance = InstanceType<typeof Person>; // Person
```

### Custom Utility Types

```typescript
// DeepPartial - Recursive partial
type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

interface NestedUser {
  id: string;
  profile: {
    name: string;
    address: {
      street: string;
      city: string;
    };
  };
}

type PartialNestedUser = DeepPartial<NestedUser>;
// All properties at all levels are optional

// DeepReadonly - Recursive readonly
type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P];
};

// Mutable - Remove readonly
type Mutable<T> = {
  -readonly [P in keyof T]: T[P];
};

// PickByType - Pick properties by value type
type PickByType<T, ValueType> = Pick<
  T,
  {
    [Key in keyof T]-?: T[Key] extends ValueType ? Key : never;
  }[keyof T]
>;

interface Example {
  id: number;
  name: string;
  age: number;
  active: boolean;
}

type NumberFields = PickByType<Example, number>; // { id: number; age: number; }

// OmitByType - Omit properties by value type
type OmitByType<T, ValueType> = Pick<
  T,
  {
    [Key in keyof T]-?: T[Key] extends ValueType ? never : Key;
  }[keyof T]
>;

type NonNumberFields = OmitByType<Example, number>;
// { name: string; active: boolean; }

// PartialBy - Make specific properties optional
type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

interface User {
  id: string;
  name: string;
  email: string;
  age: number;
}

type UserUpdate = PartialBy<User, "name" | "age">;
// { id: string; email: string; name?: string; age?: number; }

// RequiredBy - Make specific properties required
type RequiredBy<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;
```

## Type Guards and Narrowing

### Built-in Type Guards

```typescript
// typeof type guard
function padLeft(value: string, padding: string | number) {
  if (typeof padding === "number") {
    return " ".repeat(padding) + value;
  }
  if (typeof padding === "string") {
    return padding + value;
  }
}

// instanceof type guard
class Dog {
  bark() {
    console.log("Woof!");
  }
}

class Cat {
  meow() {
    console.log("Meow!");
  }
}

function makeSound(animal: Dog | Cat) {
  if (animal instanceof Dog) {
    animal.bark(); // animal is Dog
  } else {
    animal.meow(); // animal is Cat
  }
}

// in operator
interface Fish {
  swim: () => void;
}

interface Bird {
  fly: () => void;
}

function move(animal: Fish | Bird) {
  if ("swim" in animal) {
    animal.swim(); // animal is Fish
  } else {
    animal.fly(); // animal is Bird
  }
}
```

### Custom Type Guards

```typescript
// User-defined type guard with 'is'
interface User {
  id: string;
  name: string;
  email: string;
}

interface Admin extends User {
  permissions: string[];
}

function isAdmin(user: User | Admin): user is Admin {
  return "permissions" in user;
}

function handleUser(user: User | Admin) {
  if (isAdmin(user)) {
    console.log(user.permissions); // user is Admin
  } else {
    console.log(user.name); // user is User
  }
}

// Array type guard
function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

// Nullable type guard
function isDefined<T>(value: T | undefined | null): value is T {
  return value !== undefined && value !== null;
}

const values = ["a", undefined, "b", null, "c"];
const defined = values.filter(isDefined); // string[]

// Complex type guard
interface Success<T> {
  type: "success";
  data: T;
}

interface Failure {
  type: "failure";
  error: string;
}

type Result<T> = Success<T> | Failure;

function isSuccess<T>(result: Result<T>): result is Success<T> {
  return result.type === "success";
}

function handleResult<T>(result: Result<T>) {
  if (isSuccess(result)) {
    console.log(result.data); // result is Success<T>
  } else {
    console.log(result.error); // result is Failure
  }
}
```

### Assertion Functions

```typescript
// Assertion function
function assert(condition: unknown, message?: string): asserts condition {
  if (!condition) {
    throw new Error(message || "Assertion failed");
  }
}

function processValue(value: string | null) {
  assert(value !== null, "Value must not be null");
  // value is now string
  console.log(value.toUpperCase());
}

// Type assertion function
function assertIsString(value: unknown): asserts value is string {
  if (typeof value !== "string") {
    throw new Error("Value must be a string");
  }
}

function processUnknown(value: unknown) {
  assertIsString(value);
  // value is now string
  console.log(value.toUpperCase());
}

// Non-null assertion
function assertDefined<T>(
  value: T | undefined | null,
  message?: string
): asserts value is T {
  if (value === undefined || value === null) {
    throw new Error(message || "Value must be defined");
  }
}

function getUser(id: string): User | undefined {
  return users.find((u) => u.id === id);
}

const user = getUser("123");
assertDefined(user, "User not found");
console.log(user.name); // user is User
```

## Discriminated Unions

### Basic Discriminated Union

```typescript
// Shape example
interface Circle {
  kind: "circle";
  radius: number;
}

interface Square {
  kind: "square";
  sideLength: number;
}

interface Rectangle {
  kind: "rectangle";
  width: number;
  height: number;
}

type Shape = Circle | Square | Rectangle;

function getArea(shape: Shape): number {
  switch (shape.kind) {
    case "circle":
      return Math.PI * shape.radius ** 2;
    case "square":
      return shape.sideLength ** 2;
    case "rectangle":
      return shape.width * shape.height;
  }
}

// Exhaustiveness checking
function assertNever(x: never): never {
  throw new Error("Unexpected value: " + x);
}

function getAreaSafe(shape: Shape): number {
  switch (shape.kind) {
    case "circle":
      return Math.PI * shape.radius ** 2;
    case "square":
      return shape.sideLength ** 2;
    case "rectangle":
      return shape.width * shape.height;
    default:
      return assertNever(shape); // Compile error if not exhaustive
  }
}
```

### Advanced Discriminated Unions

```typescript
// API response types
interface LoadingState {
  status: "loading";
}

interface SuccessState<T> {
  status: "success";
  data: T;
}

interface ErrorState {
  status: "error";
  error: Error;
}

type AsyncState<T> = LoadingState | SuccessState<T> | ErrorState;

function renderData<T>(state: AsyncState<T>, render: (data: T) => string) {
  switch (state.status) {
    case "loading":
      return "Loading...";
    case "success":
      return render(state.data);
    case "error":
      return `Error: ${state.error.message}`;
  }
}

// Action types (Redux-style)
interface AddTodoAction {
  type: "ADD_TODO";
  payload: {
    id: string;
    text: string;
  };
}

interface ToggleTodoAction {
  type: "TOGGLE_TODO";
  payload: {
    id: string;
  };
}

interface DeleteTodoAction {
  type: "DELETE_TODO";
  payload: {
    id: string;
  };
}

type TodoAction = AddTodoAction | ToggleTodoAction | DeleteTodoAction;

function todoReducer(state: Todo[], action: TodoAction): Todo[] {
  switch (action.type) {
    case "ADD_TODO":
      return [...state, { id: action.payload.id, text: action.payload.text }];
    case "TOGGLE_TODO":
      return state.map((todo) =>
        todo.id === action.payload.id
          ? { ...todo, completed: !todo.completed }
          : todo
      );
    case "DELETE_TODO":
      return state.filter((todo) => todo.id !== action.payload.id);
  }
}
```

## Builder Pattern with Types

```typescript
// Type-safe builder
class UserBuilder {
  private user: Partial<User> = {};

  setId(id: string): this {
    this.user.id = id;
    return this;
  }

  setName(name: string): this {
    this.user.name = name;
    return this;
  }

  setEmail(email: string): this {
    this.user.email = email;
    return this;
  }

  build(): User {
    if (!this.user.id || !this.user.name || !this.user.email) {
      throw new Error("Missing required fields");
    }
    return this.user as User;
  }
}

const user = new UserBuilder()
  .setId("1")
  .setName("John")
  .setEmail("john@example.com")
  .build();

// Advanced builder with required fields tracking
type RequiredKeys<T> = {
  [K in keyof T]-?: {} extends Pick<T, K> ? never : K;
}[keyof T];

type OptionalKeys<T> = {
  [K in keyof T]-?: {} extends Pick<T, K> ? K : never;
}[keyof T];

type Builder<T, Built extends Partial<T> = {}> = {
  [K in RequiredKeys<T>]: K extends keyof Built
    ? never
    : (
        value: T[K]
      ) => Builder<T, Built & Pick<T, K>> & {
        build: RequiredKeys<T> extends keyof (Built & Pick<T, K>)
          ? () => T
          : never;
      };
} & {
  [K in OptionalKeys<T>]: (value: T[K]) => Builder<T, Built & Pick<T, K>>;
} & {
  build: RequiredKeys<T> extends keyof Built ? () => T : never;
};

// Usage ensures all required fields are set before build
function createUser(): Builder<User> {
  const built: any = {};

  const builder: any = {
    setId(id: string) {
      built.id = id;
      return builder;
    },
    setName(name: string) {
      built.name = name;
      return builder;
    },
    setEmail(email: string) {
      built.email = email;
      return builder;
    },
    build() {
      return built;
    }
  };

  return builder;
}

const user2 = createUser().setId("1").setName("John").setEmail("john@example.com").build();
// const incomplete = createUser().setId("1").build(); // Error: build not available
```

## Branded Types

```typescript
// Basic branded type
type Brand<K, T> = K & { __brand: T };

type UserId = Brand<string, "UserId">;
type ProductId = Brand<string, "ProductId">;

// Constructor functions
function createUserId(id: string): UserId {
  return id as UserId;
}

function createProductId(id: string): ProductId {
  return id as ProductId;
}

// Type-safe usage
function getUser(id: UserId): User {
  // Implementation
}

function getProduct(id: ProductId): Product {
  // Implementation
}

const userId = createUserId("user-123");
const productId = createProductId("product-456");

getUser(userId); // OK
// getUser(productId); // Error: ProductId not assignable to UserId
// getUser("user-123"); // Error: string not assignable to UserId

// Branded primitives for validation
type Email = Brand<string, "Email">;
type PositiveNumber = Brand<number, "PositiveNumber">;

function createEmail(value: string): Email | null {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(value) ? (value as Email) : null;
}

function createPositiveNumber(value: number): PositiveNumber | null {
  return value > 0 ? (value as PositiveNumber) : null;
}

// Usage
interface UserData {
  email: Email;
  age: PositiveNumber;
}

const email = createEmail("test@example.com");
const age = createPositiveNumber(25);

if (email && age) {
  const userData: UserData = { email, age };
}
```

## Type-Level Programming

### Type-Level Arithmetic

```typescript
// Tuple length
type Length<T extends any[]> = T["length"];

type L1 = Length<[1, 2, 3]>; // 3
type L2 = Length<[]>; // 0

// Tuple concatenation
type Concat<T extends any[], U extends any[]> = [...T, ...U];

type C1 = Concat<[1, 2], [3, 4]>; // [1, 2, 3, 4]

// Range generation (simplified)
type Increment<N extends number> = [never, 0, 1, 2, 3, 4, 5][N];

// Build tuple of length N
type BuildTuple<L extends number, T extends any[] = []> = T["length"] extends L
  ? T
  : BuildTuple<L, [...T, any]>;

type Tuple5 = BuildTuple<5>; // [any, any, any, any, any]
```

### Type-Level String Manipulation

```typescript
// String length
type StringLength<
  S extends string,
  Acc extends any[] = []
> = S extends `${infer _F}${infer R}`
  ? StringLength<R, [...Acc, any]>
  : Acc["length"];

type SL1 = StringLength<"hello">; // 5

// String reversal
type Reverse<
  S extends string,
  Acc extends string = ""
> = S extends `${infer F}${infer R}` ? Reverse<R, `${F}${Acc}`> : Acc;

type R1 = Reverse<"hello">; // "olleh"

// CamelCase to snake_case
type CamelToSnake<S extends string> =
  S extends `${infer T}${infer U}`
    ? U extends Uncapitalize<U>
      ? `${Uncapitalize<T>}${CamelToSnake<U>}`
      : `${Uncapitalize<T>}_${CamelToSnake<U>}`
    : S;

type CS1 = CamelToSnake<"helloWorld">; // "hello_world"
type CS2 = CamelToSnake<"getUserById">; // "get_user_by_id"
```

## Best Practices

### 1. Use Type Inference When Possible

```typescript
// Good: Let TypeScript infer
const users = [
  { id: 1, name: "John" },
  { id: 2, name: "Jane" }
];

// Bad: Redundant annotation
const users: Array<{ id: number; name: string }> = [
  { id: 1, name: "John" },
  { id: 2, name: "Jane" }
];
```

### 2. Prefer Union Types Over Enums

```typescript
// Good: Union type
type Status = "pending" | "approved" | "rejected";

// Okay: Const object (if you need values)
const Status = {
  Pending: "pending",
  Approved: "approved",
  Rejected: "rejected"
} as const;

type Status = (typeof Status)[keyof typeof Status];

// Avoid: Enum (generates runtime code)
enum Status {
  Pending = "pending",
  Approved = "approved",
  Rejected = "rejected"
}
```

### 3. Use Const Assertions for Literal Types

```typescript
// Good: Const assertion preserves literal types
const config = {
  apiUrl: "https://api.example.com",
  timeout: 5000,
  retries: 3
} as const;

type Config = typeof config;
// {
//   readonly apiUrl: "https://api.example.com";
//   readonly timeout: 5000;
//   readonly retries: 3;
// }

// Bad: Widened types
const config = {
  apiUrl: "https://api.example.com", // string
  timeout: 5000, // number
  retries: 3 // number
};
```

### 4. Avoid 'any', Use 'unknown' Instead

```typescript
// Bad: any disables type checking
function process(input: any) {
  return input.toUpperCase(); // No error, but might crash
}

// Good: unknown requires type checking
function process(input: unknown) {
  if (typeof input === "string") {
    return input.toUpperCase(); // Safe
  }
  throw new Error("Input must be a string");
}
```

### 5. Use Discriminated Unions for Complex States

```typescript
// Good: Discriminated union
type State =
  | { status: "loading" }
  | { status: "success"; data: User }
  | { status: "error"; error: Error };

// Bad: Optional properties
interface State {
  status: "loading" | "success" | "error";
  data?: User; // Might be present when status is error
  error?: Error; // Might be present when status is success
}
```

This guide covers advanced TypeScript patterns for building robust, type-safe applications.
