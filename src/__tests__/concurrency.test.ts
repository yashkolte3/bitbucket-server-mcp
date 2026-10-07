import { describe, test, expect, vi } from 'vitest';
import { BitbucketServer } from '../index.js';
import { requestContextScope } from '../context.js';
import { HierarchicalAuthResolver } from '../auth.js';

interface InterceptorHandler {
  fulfilled?: (config: Record<string, unknown>) => Promise<Record<string, unknown>> | Record<string, unknown>;
}

interface ServerWithInternals {
  api: {
    get: unknown;
    interceptors?: {
      request?: {
        handlers: InterceptorHandler[];
      };
    };
  };
  listProjects: () => Promise<unknown>;
  authResolver: HierarchicalAuthResolver;
}

describe('High-Concurrency Stateless Request Isolation', () => {
  test('allows server instantiation with requireAuth: false without server credentials', () => {
    expect(() => {
      new BitbucketServer({
        baseUrl: 'https://bb.example.com',
        requireAuth: false,
      });
    }).not.toThrow();
  });

  test('50 concurrent requests with distinct tokens execute with exact token isolation', async () => {
    const interceptedRequests: Array<{ url: string; authHeader: string | undefined; userId: number }> = [];

    const server = new BitbucketServer({
      baseUrl: 'https://bb.example.com',
      requireAuth: false,
    });
    const serverInternals = server as unknown as ServerWithInternals;

    // Mock the internal axios get implementation to record incoming headers
    const mockGet = vi.fn().mockImplementation(async (url: string, config?: Record<string, unknown>) => {
      // Run the request interceptors if present
      let finalConfig: Record<string, unknown> = { url, headers: {} as Record<string, string>, ...config };
      const handlers = serverInternals.api.interceptors?.request?.handlers || [];
      for (const h of handlers) {
        if (h && typeof h.fulfilled === 'function') {
          finalConfig = await h.fulfilled(finalConfig);
        }
      }

      const activeContext = requestContextScope.get();
      const headers = finalConfig.headers as Record<string, string> & { get?: (key: string) => string };
      const authHeader = typeof headers?.get === 'function' ? headers.get('Authorization') : headers?.Authorization;

      interceptedRequests.push({
        url,
        authHeader,
        userId: parseInt(activeContext?.requestId.replace('req-', '') || '-1', 10),
      });

      return {
        data: {
          values: [{ key: `PROJ_${activeContext?.requestId}` }],
        },
      };
    });

    serverInternals.api.get = mockGet;

    // Simulate 50 concurrent incoming tool calls
    const concurrency = 50;
    const tasks = Array.from({ length: concurrency }, async (_, i) => {
      const userToken = `BBDC-user-token-${i}`;
      const requestId = `req-${i}`;

      return requestContextScope.run(
        { token: userToken, requestId, timestamp: Date.now() },
        async () => {
          // Add random jitter to ensure interleaved asynchronous execution
          await new Promise((r) => setTimeout(r, Math.random() * 25));

          const res = await serverInternals.listProjects();

          // Second delay before finishing
          await new Promise((r) => setTimeout(r, Math.random() * 25));

          return { i, userToken, res };
        }
      );
    });

    const results = await Promise.all(tasks);

    expect(results).toHaveLength(concurrency);
    expect(interceptedRequests).toHaveLength(concurrency);

    // Verify every single request received its own exact token
    for (const req of interceptedRequests) {
      expect(req.authHeader).toBe(`Bearer BBDC-user-token-${req.userId}`);
    }
  });

  test('throws McpError if tool is called when requireAuth: false and client provides no token', async () => {
    const server = new BitbucketServer({
      baseUrl: 'https://bb.example.com',
      requireAuth: false,
    });
    const serverInternals = server as unknown as ServerWithInternals;

    // In a scope with no token
    await requestContextScope.run(
      { requestId: 'unauthenticated-req', timestamp: Date.now() },
      async () => {
        // Calling resolver directly or executing through interceptor should reject
        const resolver = serverInternals.authResolver;
        expect(() => resolver.resolve()).toThrowError(/Authentication required/);
      }
    );
  });
});

