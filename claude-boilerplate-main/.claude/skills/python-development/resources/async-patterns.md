# Advanced Async/Await Patterns

## Overview
Asynchronous programming in Python enables concurrent execution of I/O-bound operations, dramatically improving performance for network requests, file I/O, and database operations. This guide covers asyncio fundamentals through advanced patterns.

## Asyncio Fundamentals

### Basic Async/Await
```python
import asyncio
from typing import Any

# Simple async function
async def fetch_data(id: int) -> dict[str, Any]:
    """Simulate fetching data from an API."""
    await asyncio.sleep(1)  # Simulate I/O operation
    return {"id": id, "data": f"Result for {id}"}

# Running async functions
async def main():
    result = await fetch_data(1)
    print(result)

# Entry point
if __name__ == "__main__":
    asyncio.run(main())
```

### Multiple Coroutines with gather()
```python
import asyncio
from typing import List

async def fetch_user(user_id: int) -> dict:
    """Fetch user data."""
    await asyncio.sleep(0.5)
    return {"user_id": user_id, "name": f"User{user_id}"}

async def fetch_posts(user_id: int) -> List[dict]:
    """Fetch user posts."""
    await asyncio.sleep(0.5)
    return [{"id": i, "user_id": user_id} for i in range(3)]

async def fetch_comments(user_id: int) -> List[dict]:
    """Fetch user comments."""
    await asyncio.sleep(0.5)
    return [{"id": i, "user_id": user_id, "text": f"Comment {i}"} for i in range(5)]

async def get_user_profile(user_id: int) -> dict:
    """Fetch all user data concurrently."""
    # gather() runs coroutines concurrently
    user, posts, comments = await asyncio.gather(
        fetch_user(user_id),
        fetch_posts(user_id),
        fetch_comments(user_id)
    )

    return {
        "user": user,
        "posts": posts,
        "comments": comments
    }

# Running concurrently saves time: 0.5s instead of 1.5s
asyncio.run(get_user_profile(1))
```

### create_task() for Fire-and-Forget
```python
import asyncio
from datetime import datetime

async def log_event(event: str):
    """Log event asynchronously."""
    await asyncio.sleep(0.1)
    print(f"[{datetime.now()}] {event}")

async def process_request(request_id: int):
    """Process request and log in background."""
    # Create task to run concurrently
    log_task = asyncio.create_task(log_event(f"Processing request {request_id}"))

    # Main processing
    await asyncio.sleep(1)
    result = f"Result for request {request_id}"

    # Optionally wait for logging to complete
    await log_task

    return result

async def main():
    # Process multiple requests concurrently
    tasks = [asyncio.create_task(process_request(i)) for i in range(3)]
    results = await asyncio.gather(*tasks)
    print(results)

asyncio.run(main())
```

## Async Context Managers

### Basic Pattern
```python
import asyncio
from typing import Optional

class AsyncDatabaseConnection:
    """Async context manager for database connections."""

    def __init__(self, connection_string: str):
        self.connection_string = connection_string
        self.connection: Optional[Any] = None

    async def __aenter__(self):
        """Called when entering 'async with' block."""
        print(f"Connecting to {self.connection_string}")
        await asyncio.sleep(0.1)  # Simulate connection
        self.connection = {"connected": True}
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Called when exiting 'async with' block."""
        print("Closing connection")
        await asyncio.sleep(0.1)  # Simulate cleanup
        self.connection = None

    async def execute(self, query: str) -> List[dict]:
        """Execute query."""
        if not self.connection:
            raise RuntimeError("Not connected")
        await asyncio.sleep(0.1)
        return [{"result": query}]

# Usage
async def query_database():
    async with AsyncDatabaseConnection("postgresql://localhost") as db:
        results = await db.execute("SELECT * FROM users")
        return results

asyncio.run(query_database())
```

### Resource Pool Manager
```python
import asyncio
from typing import List, Optional
from contextlib import asynccontextmanager

class ConnectionPool:
    """Async connection pool."""

    def __init__(self, size: int = 5):
        self.size = size
        self.connections: List[dict] = []
        self.available: asyncio.Queue = asyncio.Queue()
        self.initialized = False

    async def initialize(self):
        """Initialize the pool."""
        if self.initialized:
            return

        for i in range(self.size):
            conn = {"id": i, "in_use": False}
            self.connections.append(conn)
            await self.available.put(conn)

        self.initialized = True

    async def acquire(self) -> dict:
        """Acquire connection from pool."""
        if not self.initialized:
            await self.initialize()

        conn = await self.available.get()
        conn["in_use"] = True
        return conn

    async def release(self, conn: dict):
        """Release connection back to pool."""
        conn["in_use"] = False
        await self.available.put(conn)

    @asynccontextmanager
    async def connection(self):
        """Context manager for acquiring/releasing connections."""
        conn = await self.acquire()
        try:
            yield conn
        finally:
            await self.release(conn)

# Usage
async def use_pool():
    pool = ConnectionPool(size=3)

    async def query(query_id: int):
        async with pool.connection() as conn:
            print(f"Query {query_id} using connection {conn['id']}")
            await asyncio.sleep(0.5)
            return f"Result {query_id}"

    # Multiple concurrent queries sharing pool
    results = await asyncio.gather(*[query(i) for i in range(10)])
    return results

asyncio.run(use_pool())
```

## Async Iterators and Generators

### Async Generator
```python
import asyncio
from typing import AsyncIterator

async def fetch_page(page: int) -> List[dict]:
    """Fetch a page of data."""
    await asyncio.sleep(0.1)
    return [{"id": page * 10 + i, "value": i} for i in range(10)]

async def paginated_data(max_pages: int = 5) -> AsyncIterator[dict]:
    """Async generator for paginated data."""
    for page in range(max_pages):
        data = await fetch_page(page)
        for item in data:
            yield item
            await asyncio.sleep(0.01)  # Simulate processing delay

# Consuming async generator
async def process_all_data():
    async for item in paginated_data():
        print(f"Processing item {item['id']}")

asyncio.run(process_all_data())
```

### Async Iterator Class
```python
import asyncio
from typing import Optional

class AsyncDataStream:
    """Async iterator for streaming data."""

    def __init__(self, source: str, batch_size: int = 10):
        self.source = source
        self.batch_size = batch_size
        self.position = 0
        self.finished = False

    def __aiter__(self):
        """Return self as async iterator."""
        return self

    async def __anext__(self) -> List[dict]:
        """Fetch next batch of data."""
        if self.finished:
            raise StopAsyncIteration

        # Simulate fetching batch
        await asyncio.sleep(0.1)

        batch = [
            {"id": self.position + i, "data": f"item_{self.position + i}"}
            for i in range(self.batch_size)
        ]

        self.position += self.batch_size

        # Stop after 5 batches
        if self.position >= 50:
            self.finished = True

        return batch

# Usage
async def consume_stream():
    stream = AsyncDataStream("data_source")

    async for batch in stream:
        print(f"Processing batch of {len(batch)} items")
        # Process batch concurrently
        await asyncio.gather(*[process_item(item) for item in batch])

async def process_item(item: dict):
    await asyncio.sleep(0.01)
    return item

asyncio.run(consume_stream())
```

## Concurrent Execution Patterns

### gather() with Error Handling
```python
import asyncio
from typing import List, Optional

async def fetch_with_retry(url: str, retries: int = 3) -> Optional[str]:
    """Fetch URL with retries."""
    for attempt in range(retries):
        try:
            await asyncio.sleep(0.1)
            if "error" in url:
                raise ValueError(f"Failed to fetch {url}")
            return f"Data from {url}"
        except Exception as e:
            if attempt == retries - 1:
                print(f"All retries failed for {url}: {e}")
                return None
            await asyncio.sleep(0.5 * (attempt + 1))

async def fetch_all(urls: List[str]) -> List[Optional[str]]:
    """Fetch all URLs, continuing on errors."""
    # return_exceptions=True prevents one failure from canceling others
    results = await asyncio.gather(
        *[fetch_with_retry(url) for url in urls],
        return_exceptions=True
    )

    # Filter out exceptions and return successful results
    successful = []
    for i, result in enumerate(results):
        if isinstance(result, Exception):
            print(f"Error fetching {urls[i]}: {result}")
        else:
            successful.append(result)

    return successful

asyncio.run(fetch_all([
    "https://example.com/1",
    "https://example.com/error",
    "https://example.com/3"
]))
```

### TaskGroup (Python 3.11+)
```python
import asyncio

async def process_task(task_id: int):
    """Process a task."""
    await asyncio.sleep(0.5)
    if task_id == 3:
        raise ValueError(f"Task {task_id} failed")
    return f"Result {task_id}"

async def main():
    """Use TaskGroup for better task management."""
    # TaskGroup automatically cancels remaining tasks on first exception
    try:
        async with asyncio.TaskGroup() as tg:
            task1 = tg.create_task(process_task(1))
            task2 = tg.create_task(process_task(2))
            task3 = tg.create_task(process_task(3))
            task4 = tg.create_task(process_task(4))

        # This line only reached if all tasks succeed
        print("All tasks completed")
    except* ValueError as eg:
        # Exception group handling (Python 3.11+)
        print(f"Task group had {len(eg.exceptions)} failures")

# For older Python, use gather with error handling
async def main_legacy():
    tasks = [process_task(i) for i in range(1, 5)]
    try:
        results = await asyncio.gather(*tasks, return_exceptions=True)
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                print(f"Task {i+1} failed: {result}")
    except Exception as e:
        print(f"Unexpected error: {e}")

asyncio.run(main())
```

### Semaphores for Rate Limiting
```python
import asyncio
from typing import List

async def rate_limited_request(
    url: str,
    semaphore: asyncio.Semaphore
) -> dict:
    """Make request with rate limiting."""
    async with semaphore:
        # Only N concurrent requests allowed
        print(f"Fetching {url}")
        await asyncio.sleep(0.5)
        return {"url": url, "status": 200}

async def fetch_many(urls: List[str], max_concurrent: int = 5) -> List[dict]:
    """Fetch many URLs with concurrency limit."""
    semaphore = asyncio.Semaphore(max_concurrent)

    tasks = [rate_limited_request(url, semaphore) for url in urls]
    results = await asyncio.gather(*tasks)

    return results

# Fetch 20 URLs but only 5 concurrent requests
urls = [f"https://api.example.com/item/{i}" for i in range(20)]
asyncio.run(fetch_many(urls, max_concurrent=5))
```

## Event Loops and Tasks

### Custom Event Loop Handling
```python
import asyncio
from typing import List

async def background_task():
    """Long-running background task."""
    try:
        while True:
            print("Background task running...")
            await asyncio.sleep(2)
    except asyncio.CancelledError:
        print("Background task cancelled")
        raise

async def main():
    """Main application with background tasks."""
    # Get current event loop
    loop = asyncio.get_event_loop()

    # Create background task
    bg_task = asyncio.create_task(background_task())

    # Main work
    await asyncio.sleep(5)

    # Cancel background task
    bg_task.cancel()
    try:
        await bg_task
    except asyncio.CancelledError:
        print("Cleanup completed")

asyncio.run(main())
```

### Task Scheduling
```python
import asyncio
from datetime import datetime, timedelta
from typing import Callable

class TaskScheduler:
    """Schedule tasks to run at specific times."""

    def __init__(self):
        self.tasks: List[asyncio.Task] = []

    async def schedule_at(self, coro: Callable, run_at: datetime):
        """Schedule coroutine to run at specific time."""
        delay = (run_at - datetime.now()).total_seconds()
        if delay > 0:
            await asyncio.sleep(delay)
        return await coro()

    async def schedule_every(self, coro: Callable, interval: float, times: int = None):
        """Schedule coroutine to run periodically."""
        count = 0
        while times is None or count < times:
            await coro()
            await asyncio.sleep(interval)
            count += 1

    def add_task(self, task: asyncio.Task):
        """Track task."""
        self.tasks.append(task)

    async def cancel_all(self):
        """Cancel all scheduled tasks."""
        for task in self.tasks:
            task.cancel()
        await asyncio.gather(*self.tasks, return_exceptions=True)

# Usage
async def scheduled_job():
    print(f"Job executed at {datetime.now()}")

async def main():
    scheduler = TaskScheduler()

    # Schedule job in 2 seconds
    future_time = datetime.now() + timedelta(seconds=2)
    task1 = asyncio.create_task(scheduler.schedule_at(scheduled_job, future_time))

    # Schedule job every second, 5 times
    task2 = asyncio.create_task(scheduler.schedule_every(scheduled_job, 1.0, 5))

    scheduler.add_task(task1)
    scheduler.add_task(task2)

    await asyncio.gather(task1, task2)

asyncio.run(main())
```

## Async File I/O

### Using aiofiles
```python
import asyncio
import aiofiles
from pathlib import Path
from typing import List

async def read_file_async(filepath: Path) -> str:
    """Read file asynchronously."""
    async with aiofiles.open(filepath, mode='r') as f:
        content = await f.read()
    return content

async def write_file_async(filepath: Path, content: str):
    """Write file asynchronously."""
    async with aiofiles.open(filepath, mode='w') as f:
        await f.write(content)

async def read_file_lines(filepath: Path) -> List[str]:
    """Read file line by line."""
    lines = []
    async with aiofiles.open(filepath, mode='r') as f:
        async for line in f:
            lines.append(line.strip())
    return lines

async def process_multiple_files(filepaths: List[Path]) -> dict[Path, str]:
    """Read multiple files concurrently."""
    tasks = [read_file_async(fp) for fp in filepaths]
    contents = await asyncio.gather(*tasks)
    return dict(zip(filepaths, contents))

# Usage
async def main():
    # Write multiple files concurrently
    files = [Path(f"file_{i}.txt") for i in range(5)]
    await asyncio.gather(*[
        write_file_async(fp, f"Content for {fp.name}")
        for fp in files
    ])

    # Read them back concurrently
    contents = await process_multiple_files(files)
    print(f"Read {len(contents)} files")

asyncio.run(main())
```

### Async File Processing Pipeline
```python
import asyncio
import aiofiles
from pathlib import Path
from typing import AsyncIterator

async def read_large_file_chunks(
    filepath: Path,
    chunk_size: int = 1024
) -> AsyncIterator[bytes]:
    """Read large file in chunks."""
    async with aiofiles.open(filepath, mode='rb') as f:
        while True:
            chunk = await f.read(chunk_size)
            if not chunk:
                break
            yield chunk

async def process_chunk(chunk: bytes) -> str:
    """Process a chunk of data."""
    await asyncio.sleep(0.01)  # Simulate processing
    return chunk.decode('utf-8').upper()

async def process_file_pipeline(input_path: Path, output_path: Path):
    """Process file in pipeline."""
    async with aiofiles.open(output_path, mode='w') as out_file:
        async for chunk in read_large_file_chunks(input_path):
            processed = await process_chunk(chunk)
            await out_file.write(processed)

asyncio.run(process_file_pipeline(Path("input.txt"), Path("output.txt")))
```

## Async HTTP Clients

### Using httpx
```python
import asyncio
import httpx
from typing import List, Optional

async def fetch_url(client: httpx.AsyncClient, url: str) -> dict:
    """Fetch URL using shared client."""
    try:
        response = await client.get(url, timeout=5.0)
        response.raise_for_status()
        return {
            "url": url,
            "status": response.status_code,
            "data": response.json()
        }
    except httpx.HTTPError as e:
        return {"url": url, "error": str(e)}

async def fetch_all_urls(urls: List[str]) -> List[dict]:
    """Fetch all URLs with shared client."""
    async with httpx.AsyncClient() as client:
        tasks = [fetch_url(client, url) for url in urls]
        results = await asyncio.gather(*tasks)
    return results

# With retry logic
async def fetch_with_backoff(
    url: str,
    max_retries: int = 3,
    backoff_factor: float = 1.5
) -> Optional[dict]:
    """Fetch with exponential backoff."""
    async with httpx.AsyncClient() as client:
        for attempt in range(max_retries):
            try:
                response = await client.get(url, timeout=10.0)
                response.raise_for_status()
                return response.json()
            except httpx.HTTPError as e:
                if attempt == max_retries - 1:
                    print(f"Failed after {max_retries} attempts: {e}")
                    return None

                wait_time = backoff_factor ** attempt
                print(f"Attempt {attempt + 1} failed, retrying in {wait_time}s")
                await asyncio.sleep(wait_time)

# Usage
asyncio.run(fetch_all_urls([
    "https://api.github.com/users/octocat",
    "https://api.github.com/users/torvalds"
]))
```

### Using aiohttp
```python
import asyncio
import aiohttp
from typing import List, Dict

async def fetch_json(session: aiohttp.ClientSession, url: str) -> Dict:
    """Fetch JSON data."""
    async with session.get(url) as response:
        return await response.json()

async def post_data(session: aiohttp.ClientSession, url: str, data: dict) -> Dict:
    """POST data to endpoint."""
    async with session.post(url, json=data) as response:
        return await response.json()

async def streaming_download(url: str, filepath: Path):
    """Download large file with streaming."""
    async with aiohttp.ClientSession() as session:
        async with session.get(url) as response:
            with open(filepath, 'wb') as f:
                async for chunk in response.content.iter_chunked(8192):
                    f.write(chunk)

class APIClient:
    """Reusable async API client."""

    def __init__(self, base_url: str, api_key: Optional[str] = None):
        self.base_url = base_url
        self.api_key = api_key
        self._session: Optional[aiohttp.ClientSession] = None

    async def __aenter__(self):
        headers = {}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        self._session = aiohttp.ClientSession(
            base_url=self.base_url,
            headers=headers,
            timeout=aiohttp.ClientTimeout(total=30)
        )
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self._session:
            await self._session.close()

    async def get(self, endpoint: str) -> Dict:
        """GET request."""
        async with self._session.get(endpoint) as response:
            response.raise_for_status()
            return await response.json()

    async def post(self, endpoint: str, data: Dict) -> Dict:
        """POST request."""
        async with self._session.post(endpoint, json=data) as response:
            response.raise_for_status()
            return await response.json()

# Usage
async def main():
    async with APIClient("https://api.example.com", "api_key_123") as client:
        user = await client.get("/users/1")
        result = await client.post("/users", {"name": "John"})
        print(user, result)

asyncio.run(main())
```

## Error Handling

### Exception Handling Patterns
```python
import asyncio
from typing import Optional, TypeVar, Callable

T = TypeVar('T')

async def safe_execute(
    coro: Callable[..., T],
    *args,
    default: Optional[T] = None,
    **kwargs
) -> Optional[T]:
    """Execute coroutine with error handling."""
    try:
        return await coro(*args, **kwargs)
    except asyncio.CancelledError:
        print("Operation cancelled")
        raise  # Always re-raise CancelledError
    except asyncio.TimeoutError:
        print("Operation timed out")
        return default
    except Exception as e:
        print(f"Error in {coro.__name__}: {e}")
        return default

async def with_timeout(coro, timeout: float, default=None):
    """Execute coroutine with timeout."""
    try:
        return await asyncio.wait_for(coro, timeout=timeout)
    except asyncio.TimeoutError:
        print(f"Operation timed out after {timeout}s")
        return default

# Usage
async def slow_operation():
    await asyncio.sleep(10)
    return "Done"

async def main():
    # This will timeout after 2 seconds
    result = await with_timeout(slow_operation(), timeout=2.0, default="Failed")
    print(result)  # "Failed"

asyncio.run(main())
```

### Graceful Shutdown
```python
import asyncio
import signal
from typing import Set

class AsyncApplication:
    """Application with graceful shutdown."""

    def __init__(self):
        self.shutdown_event = asyncio.Event()
        self.tasks: Set[asyncio.Task] = set()

    def setup_signals(self):
        """Setup signal handlers for graceful shutdown."""
        loop = asyncio.get_event_loop()

        for sig in (signal.SIGTERM, signal.SIGINT):
            loop.add_signal_handler(
                sig,
                lambda: asyncio.create_task(self.shutdown())
            )

    async def shutdown(self):
        """Graceful shutdown."""
        print("Shutting down gracefully...")
        self.shutdown_event.set()

        # Cancel all tasks
        for task in self.tasks:
            task.cancel()

        # Wait for tasks to complete
        await asyncio.gather(*self.tasks, return_exceptions=True)
        print("Shutdown complete")

    async def worker(self, worker_id: int):
        """Background worker."""
        try:
            while not self.shutdown_event.is_set():
                print(f"Worker {worker_id} processing...")
                await asyncio.sleep(1)
        except asyncio.CancelledError:
            print(f"Worker {worker_id} cancelled")

    async def run(self):
        """Run application."""
        self.setup_signals()

        # Start workers
        for i in range(3):
            task = asyncio.create_task(self.worker(i))
            self.tasks.add(task)

        # Wait for shutdown
        await self.shutdown_event.wait()

# Run application
app = AsyncApplication()
asyncio.run(app.run())
```

## Testing Async Code

### Using pytest-asyncio
```python
import pytest
import asyncio
from typing import AsyncIterator

# Mark tests as async
@pytest.mark.asyncio
async def test_async_function():
    result = await async_operation()
    assert result == "expected"

async def async_operation():
    await asyncio.sleep(0.1)
    return "expected"

# Async fixtures
@pytest.fixture
async def async_client():
    """Create async client."""
    client = AsyncAPIClient()
    await client.connect()
    yield client
    await client.disconnect()

@pytest.mark.asyncio
async def test_with_async_fixture(async_client):
    result = await async_client.get("/endpoint")
    assert result["status"] == "ok"

# Testing concurrent operations
@pytest.mark.asyncio
async def test_concurrent_requests():
    results = await asyncio.gather(
        make_request(1),
        make_request(2),
        make_request(3)
    )
    assert len(results) == 3
    assert all(r["success"] for r in results)

async def make_request(id: int):
    await asyncio.sleep(0.1)
    return {"id": id, "success": True}
```

### Mocking Async Functions
```python
import pytest
from unittest.mock import AsyncMock, patch

@pytest.mark.asyncio
async def test_with_async_mock():
    """Test with async mock."""
    mock_api = AsyncMock()
    mock_api.fetch_data.return_value = {"data": "mocked"}

    result = await mock_api.fetch_data("test")
    assert result == {"data": "mocked"}
    mock_api.fetch_data.assert_called_once_with("test")

@pytest.mark.asyncio
async def test_with_patch():
    """Test with patching."""
    with patch('module.async_function', new_callable=AsyncMock) as mock:
        mock.return_value = "mocked_result"

        result = await module.async_function()
        assert result == "mocked_result"

# Testing timeouts
@pytest.mark.asyncio
async def test_timeout():
    """Test that operation times out."""
    with pytest.raises(asyncio.TimeoutError):
        await asyncio.wait_for(slow_operation(), timeout=0.1)

async def slow_operation():
    await asyncio.sleep(10)
```

## Common Pitfalls

### Bad: Blocking the Event Loop
```python
# BAD - blocks event loop
async def bad_function():
    import time
    time.sleep(5)  # Blocks entire event loop!
    return "done"

# GOOD - use async sleep
async def good_function():
    await asyncio.sleep(5)  # Non-blocking
    return "done"
```

### Bad: Not Awaiting Coroutines
```python
# BAD - coroutine not awaited
async def bad_usage():
    result = fetch_data()  # Returns coroutine object, not result!
    print(result)  # <coroutine object>

# GOOD - await the coroutine
async def good_usage():
    result = await fetch_data()
    print(result)  # Actual result
```

### Bad: Creating New Event Loops
```python
# BAD - creating new event loop
async def bad_nested():
    loop = asyncio.new_event_loop()
    result = loop.run_until_complete(some_coro())  # Wrong!
    return result

# GOOD - use await
async def good_nested():
    result = await some_coro()
    return result
```

### Bad: Not Handling CancelledError
```python
# BAD - swallowing CancelledError
async def bad_handler():
    try:
        await long_operation()
    except Exception:  # Catches CancelledError!
        pass

# GOOD - re-raise CancelledError
async def good_handler():
    try:
        await long_operation()
    except asyncio.CancelledError:
        # Cleanup if needed
        raise  # Always re-raise
    except Exception as e:
        print(f"Error: {e}")
```

## Best Practices

1. **Use Async Libraries**: Always use async versions (httpx, aiofiles, asyncpg) instead of blocking calls
2. **Limit Concurrency**: Use Semaphore to prevent overwhelming resources
3. **Timeout Everything**: Always use `asyncio.wait_for()` for operations that might hang
4. **Handle CancelledError**: Always re-raise `CancelledError` after cleanup
5. **Share Resources**: Use single session/client for multiple requests
6. **Avoid Mixing**: Don't mix sync and async code without proper handling
7. **Use gather() Wisely**: Use `return_exceptions=True` when you don't want one failure to cancel all
8. **Context Managers**: Use async context managers for resource management
9. **Structured Concurrency**: Use TaskGroup (3.11+) or create_task with proper cleanup
10. **Test Async Code**: Use pytest-asyncio and proper async fixtures

This guide provides comprehensive patterns for building high-performance async applications in Python.
