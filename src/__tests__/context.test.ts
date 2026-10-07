import { describe, test, expect } from 'vitest';
import { requestContextScope, RequestContext } from '../context.js';

describe('RequestContextScope (AsyncLocalStorage)', () => {
  test('returns undefined when accessed outside of a request scope', () => {
    expect(requestContextScope.get()).toBeUndefined();
  });

  test('provides context inside requestContextScope.run', async () => {
    const ctx: RequestContext = {
      token: 'test-token-123',
      requestId: 'req-1',
      clientIp: '127.0.0.1',
      timestamp: Date.now(),
    };

    await requestContextScope.run(ctx, async () => {
      const active = requestContextScope.get();
      expect(active).toBeDefined();
      expect(active?.token).toBe('test-token-123');
      expect(active?.requestId).toBe('req-1');
      expect(active?.clientIp).toBe('127.0.0.1');
    });

    // Context is cleared after run settles
    expect(requestContextScope.get()).toBeUndefined();
  });

  test('guarantees complete isolation across 50 concurrent async tasks', async () => {
    const concurrencyCount = 50;
    const tasks = Array.from({ length: concurrencyCount }, (_, i) => {
      const token = `user-token-${i}`;
      const requestId = `req-${i}`;

      return requestContextScope.run(
        { token, requestId, timestamp: Date.now() },
        async () => {
          // Introduce random async delay to interleave execution on Node event loop
          await new Promise((resolve) => setTimeout(resolve, Math.random() * 20));

          const current = requestContextScope.get();
          expect(current?.token).toBe(token);
          expect(current?.requestId).toBe(requestId);

          // Second asynchronous hop
          await new Promise((resolve) => setTimeout(resolve, Math.random() * 20));

          const currentAfterDelay = requestContextScope.get();
          expect(currentAfterDelay?.token).toBe(token);
          expect(currentAfterDelay?.requestId).toBe(requestId);

          return currentAfterDelay?.token;
        }
      );
    });

    const results = await Promise.all(tasks);
    expect(results).toHaveLength(concurrencyCount);
    results.forEach((res, i) => {
      expect(res).toBe(`user-token-${i}`);
    });
  });
});

