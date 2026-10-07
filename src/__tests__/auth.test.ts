import { describe, test, expect } from 'vitest';
import { HierarchicalAuthResolver } from '../auth.js';
import { requestContextScope } from '../context.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

describe('HierarchicalAuthResolver', () => {
  test('priority 1: uses request context token over session, server env, and basic auth', async () => {
    const resolver = new HierarchicalAuthResolver(
      'server-token',
      'server-user',
      'server-pass'
    );

    await requestContextScope.run(
      { token: 'client-request-token', requestId: '1', timestamp: Date.now() },
      async () => {
        const creds = resolver.resolve('session-fallback-token');
        expect(creds.type).toBe('bearer');
        expect(creds.token).toBe('client-request-token');
      }
    );
  });

  test('priority 2: uses session fallback token when request context has no token', async () => {
    const resolver = new HierarchicalAuthResolver(
      'server-token',
      'server-user',
      'server-pass'
    );

    await requestContextScope.run(
      { requestId: '1', timestamp: Date.now() }, // no token in context
      async () => {
        const creds = resolver.resolve('session-fallback-token');
        expect(creds.type).toBe('bearer');
        expect(creds.token).toBe('session-fallback-token');
      }
    );
  });

  test('priority 3: uses server default token when context and session tokens are absent', () => {
    const resolver = new HierarchicalAuthResolver(
      'server-token',
      'server-user',
      'server-pass'
    );

    const creds = resolver.resolve();
    expect(creds.type).toBe('bearer');
    expect(creds.token).toBe('server-token');
  });

  test('priority 4: uses basic auth when no tokens are configured', () => {
    const resolver = new HierarchicalAuthResolver(
      undefined,
      'my-user',
      'my-pass'
    );

    const creds = resolver.resolve();
    expect(creds.type).toBe('basic');
    expect(creds.username).toBe('my-user');
    expect(creds.password).toBe('my-pass');
  });

  test('priority 5: throws McpError(InvalidRequest) when no credentials exist anywhere', () => {
    const resolver = new HierarchicalAuthResolver();

    expect(() => resolver.resolve()).toThrowError(McpError);
    try {
      resolver.resolve();
    } catch (err) {
      const mcpErr = err as McpError;
      expect(mcpErr.code).toBe(ErrorCode.InvalidRequest);
      expect(mcpErr.message).toContain('Authentication required');
    }
  });
});

