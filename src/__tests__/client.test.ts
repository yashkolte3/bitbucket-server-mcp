import { describe, test, expect } from 'vitest';
import { createConnectionPoolAgents, BitbucketHttpClient } from '../client.js';
import { HierarchicalAuthResolver } from '../auth.js';

interface AgentWithOptions {
  keepAlive?: boolean;
  options?: { keepAlive?: boolean };
}

describe('BitbucketHttpClient and Agent Pooling', () => {
  test('createConnectionPoolAgents configures keepAlive and maxSockets', () => {
    const { httpAgent, httpsAgent } = createConnectionPoolAgents();
    const httpWithOpts = httpAgent as unknown as AgentWithOptions;
    const httpsWithOpts = httpsAgent as unknown as AgentWithOptions;

    expect(httpWithOpts.keepAlive || httpWithOpts.options?.keepAlive).toBeTruthy();
    expect(httpAgent.maxSockets).toBe(100);
    expect(httpAgent.maxFreeSockets).toBe(10);

    expect(httpsWithOpts.keepAlive || httpsWithOpts.options?.keepAlive).toBeTruthy();
    expect(httpsAgent.maxSockets).toBe(100);
    expect(httpsAgent.maxFreeSockets).toBe(10);
  });

  test('BitbucketHttpClient creates instance with custom headers', () => {
    const resolver = new HierarchicalAuthResolver('tok');
    const client = new BitbucketHttpClient(
      {
        baseUrl: 'https://bitbucket.example.com',
        customHeaders: { 'X-Custom-Header': 'custom-val' },
      },
      resolver
    );

    expect(client.api.defaults.baseURL).toBe('https://bitbucket.example.com/rest/api/1.0');
    expect(client.api.defaults.headers['X-Custom-Header']).toBe('custom-val');
  });
});
