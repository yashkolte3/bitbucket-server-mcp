import { describe, test, expect } from 'vitest';
import { sanitizeLogData, extractSafeErrorMeta } from '../logger.js';

describe('Logger Security Sanitization', () => {
  describe('sanitizeLogData', () => {
    test('redacts Bearer tokens in strings', () => {
      const input = 'Request failed with Bearer secret-token-xyz-12345 in header';
      const sanitized = sanitizeLogData(input);
      expect(sanitized).toBe('Request failed with Bearer [REDACTED] in header');
    });

    test('redacts BBDC Bitbucket Personal Access Tokens in strings', () => {
      const input = 'Token BBDC-MzgzNjU5MzI5MTU2Ol2VEF5Fzc1iHJcXbE4Rdw3kRLaH was provided';
      const sanitized = sanitizeLogData(input);
      expect(sanitized).toBe('Token BBDC-[REDACTED] was provided');
    });

    test('redacts sensitive object keys', () => {
      const input = {
        authorization: 'Bearer raw-secret',
        'x-bitbucket-token': 'another-secret',
        password: 'my-db-password',
        clientSecret: 'secret-val',
        user: 'alice',
      };
      const sanitized = sanitizeLogData(input) as Record<string, unknown>;
      expect(sanitized.authorization).toBe('[REDACTED]');
      expect(sanitized['x-bitbucket-token']).toBe('[REDACTED]');
      expect(sanitized.password).toBe('[REDACTED]');
      expect(sanitized.clientSecret).toBe('[REDACTED]');
      expect(sanitized.user).toBe('alice');
    });

    test('handles circular references without throwing stack overflow or JSON errors', () => {
      const circularObj: Record<string, unknown> = {
        name: 'test',
        nested: {},
      };
      (circularObj.nested as Record<string, unknown>).parent = circularObj;

      expect(() => {
        const sanitized = sanitizeLogData(circularObj) as Record<string, unknown>;
        expect(sanitized.name).toBe('test');
        expect(JSON.stringify(sanitized)).toBeDefined();
      }).not.toThrow();
    });

    test('strips headers from Axios config object', () => {
      const input = {
        config: {
          url: '/rest/api/1.0/projects',
          method: 'get',
          headers: {
            Authorization: 'Bearer super-secret',
          },
        },
      };

      const sanitized = sanitizeLogData(input) as { config: Record<string, unknown> };
      expect(sanitized.config.url).toBe('/rest/api/1.0/projects');
      expect(sanitized.config.headers).toBeUndefined();
    });
  });

  describe('extractSafeErrorMeta', () => {
    test('extracts clean error metadata without leaking headers', () => {
      const error = {
        message: 'Request failed with status code 401',
        name: 'AxiosError',
        code: 'ERR_BAD_REQUEST',
        response: {
          status: 401,
          statusText: 'Unauthorized',
          data: { message: 'Token BBDC-abcdef is expired' },
        },
        config: {
          url: '/projects',
          method: 'get',
          baseURL: 'https://bb.example.com',
          headers: {
            Authorization: 'Bearer secret-token',
          },
        },
      };

      const meta = extractSafeErrorMeta(error);
      expect(meta.message).toBe('Request failed with status code 401');
      expect(meta.status).toBe(401);
      expect(meta.url).toBe('/projects');
      expect(meta.method).toBe('get');
      expect((meta.responseData as Record<string, unknown>).message).toBe('Token BBDC-[REDACTED] is expired');
      expect(meta).not.toHaveProperty('headers');
    });
  });
});

