import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server as HttpServer } from 'node:http';
import type { Request } from 'express';
import {
  extractClientToken,
  checkIsInitializeRequest,
  createHttpApp,
  sessions,
} from '../http.js';

// Mock axios so BitbucketServer can be constructed without real network calls
vi.mock('axios', () => {
  const mockInstance = {
    get: vi.fn().mockResolvedValue({ data: {} }),
    post: vi.fn().mockResolvedValue({ data: {} }),
    put: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
  };
  return {
    default: {
      create: vi.fn(() => mockInstance),
      isAxiosError: vi.fn(),
    },
  };
});

describe('HTTP Module Unit Tests', () => {
  describe('extractClientToken', () => {
    test('extracts token with Bearer prefix', () => {
      const req = {
        headers: { authorization: 'Bearer my-pat-token-123' },
      } as unknown as Request;
      expect(extractClientToken(req)).toBe('my-pat-token-123');
    });

    test('extracts token with lowercase bearer prefix and extra spaces', () => {
      const req = {
        headers: { authorization: 'bearer   my-pat-token-456   ' },
      } as unknown as Request;
      expect(extractClientToken(req)).toBe('my-pat-token-456');
    });

    test('extracts token without Bearer prefix', () => {
      const req = {
        headers: { authorization: 'direct-pat-token-789' },
      } as unknown as Request;
      expect(extractClientToken(req)).toBe('direct-pat-token-789');
    });

    test('extracts token from x-bitbucket-token header', () => {
      const req = {
        headers: { 'x-bitbucket-token': 'custom-pat-token' },
      } as unknown as Request;
      expect(extractClientToken(req)).toBe('custom-pat-token');
    });

    test('prefers Authorization over x-bitbucket-token', () => {
      const req = {
        headers: {
          authorization: 'Bearer primary-token',
          'x-bitbucket-token': 'secondary-token',
        },
      } as unknown as Request;
      expect(extractClientToken(req)).toBe('primary-token');
    });

    test('returns undefined when no token header exists', () => {
      const req = { headers: {} } as unknown as Request;
      expect(extractClientToken(req)).toBeUndefined();
    });

    test('returns undefined for empty token header', () => {
      const req = {
        headers: { authorization: '   ' },
      } as unknown as Request;
      expect(extractClientToken(req)).toBeUndefined();
    });
  });

  describe('checkIsInitializeRequest', () => {
    test('identifies single initialize request', () => {
      const body = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0' },
        },
      };
      expect(checkIsInitializeRequest(body)).toBe(true);
    });

    test('identifies batch request containing initialize', () => {
      const body = [
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-03-26',
            capabilities: {},
            clientInfo: { name: 'test', version: '1.0' },
          },
        },
      ];
      expect(checkIsInitializeRequest(body)).toBe(true);
    });

    test('returns false for tools/list request', () => {
      const body = {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {},
      };
      expect(checkIsInitializeRequest(body)).toBe(false);
    });

    test('returns false for null / non-object', () => {
      expect(checkIsInitializeRequest(null)).toBe(false);
      expect(checkIsInitializeRequest(undefined)).toBe(false);
      expect(checkIsInitializeRequest('string')).toBe(false);
    });
  });

  describe('HTTP Server Endpoints', () => {
    let server: HttpServer;
    let baseUrl: string;
    const originalEnv = { ...process.env };

    beforeEach(async () => {
      sessions.clear();
      process.env.BITBUCKET_URL = 'https://bitbucket.example.com';
      delete process.env.BITBUCKET_TOKEN;
      delete process.env.BITBUCKET_USERNAME;
      delete process.env.BITBUCKET_PASSWORD;

      const app = createHttpApp();
      await new Promise<void>((resolve) => {
        server = app.listen(0, '127.0.0.1', () => {
          const addr = server.address() as AddressInfo;
          baseUrl = `http://127.0.0.1:${addr.port}`;
          resolve();
        });
      });
    });

    afterEach(async () => {
      process.env = { ...originalEnv };
      sessions.clear();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    });

    test('GET /health returns server health and metadata', async () => {
      const res = await fetch(`${baseUrl}/health`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe('ok');
      expect(data.transport).toBe('streamable-http');
      expect(data.activeSessions).toBe(0);
      expect(data.bitbucketUrl).toBe('https://bitbucket.example.com');
    });

    test('POST /mcp without credentials returns 401 Unauthorized', async () => {
      const initMessage = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' },
        },
      };

      const res = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify(initMessage),
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error.code).toBe(-32000);
      expect(data.error.message).toContain('Unauthorized');
    });

    test('POST /mcp with client Authorization header succeeds and initializes session', async () => {
      const initMessage = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' },
        },
      };

      const res = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          Authorization: 'Bearer client-pat-999',
        },
        body: JSON.stringify(initMessage),
      });

      expect(res.status).toBe(200);
      const sessionId = res.headers.get('mcp-session-id');
      expect(sessionId).toBeTruthy();
      expect(sessions.size).toBe(1);
      expect(sessions.get(sessionId!)?.token).toBe('client-pat-999');
    });

    test('POST /mcp falls back to default BITBUCKET_TOKEN when no header is provided', async () => {
      process.env.BITBUCKET_TOKEN = 'default-fallback-pat';

      const initMessage = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' },
        },
      };

      const res = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify(initMessage),
      });

      expect(res.status).toBe(200);
      const sessionId = res.headers.get('mcp-session-id');
      expect(sessionId).toBeTruthy();
      expect(sessions.size).toBe(1);
      expect(sessions.get(sessionId!)?.token).toBe('default-fallback-pat');
    });

    test('POST /mcp client header overrides default BITBUCKET_TOKEN', async () => {
      process.env.BITBUCKET_TOKEN = 'default-fallback-pat';

      const initMessage = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' },
        },
      };

      const res = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          Authorization: 'Bearer override-pat',
        },
        body: JSON.stringify(initMessage),
      });

      expect(res.status).toBe(200);
      const sessionId = res.headers.get('mcp-session-id');
      expect(sessionId).toBeTruthy();
      expect(sessions.get(sessionId!)?.token).toBe('override-pat');
    });

    test('POST /mcp returns 400 for non-initialize request without session id', async () => {
      const nonInitMessage = {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {},
      };

      const res = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify(nonInitMessage),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.message).toContain('Mcp-Session-Id');
    });

    test('POST /mcp returns 404 for unknown session id', async () => {
      const message = {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {},
      };

      const res = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          'mcp-session-id': 'non-existent-session',
        },
        body: JSON.stringify(message),
      });

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error.message).toContain('Session not found');
    });

    test('DELETE /mcp cleans up session', async () => {
      process.env.BITBUCKET_TOKEN = 'test-token';

      // Initialize session first
      const initRes = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-03-26',
            capabilities: {},
            clientInfo: { name: 'test-client', version: '1.0.0' },
          },
        }),
      });

      const sessionId = initRes.headers.get('mcp-session-id');
      expect(sessionId).toBeTruthy();
      expect(sessions.has(sessionId!)).toBe(true);

      // Now DELETE the session
      const deleteRes = await fetch(`${baseUrl}/mcp`, {
        method: 'DELETE',
        headers: {
          'mcp-session-id': sessionId!,
        },
      });

      expect(deleteRes.status).toBe(200);
      expect(sessions.has(sessionId!)).toBe(false);
    });
  });
});
