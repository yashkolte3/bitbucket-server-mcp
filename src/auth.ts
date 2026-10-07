import { requestContextScope } from './context.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

export interface ResolvedCredentials {
  readonly type: 'bearer' | 'basic';
  readonly token?: string;
  readonly username?: string;
  readonly password?: string;
}

export interface IAuthenticationResolver {
  /**
   * Resolves authentication credentials with hierarchical priority:
   * 1. Request context token (from current HTTP request headers)
   * 2. Session-level fallback (if provided during session handshake)
   * 3. Server-level environment token (BITBUCKET_TOKEN)
   * 4. Server-level Basic Auth (BITBUCKET_USERNAME / BITBUCKET_PASSWORD)
   */
  resolve(sessionFallbackToken?: string): ResolvedCredentials;
}

export class HierarchicalAuthResolver implements IAuthenticationResolver {
  constructor(
    private readonly defaultToken?: string,
    private readonly defaultUsername?: string,
    private readonly defaultPassword?: string
  ) {}

  resolve(sessionFallbackToken?: string): ResolvedCredentials {
    // 1. Highest Priority: Request-scoped token from current HTTP request
    const contextToken = requestContextScope.get()?.token;
    if (contextToken) {
      return { type: 'bearer', token: contextToken };
    }

    // 2. Session-level fallback (if established during initialize)
    if (sessionFallbackToken) {
      return { type: 'bearer', token: sessionFallbackToken };
    }

    // 3. Server-level environment fallback (BITBUCKET_TOKEN)
    if (this.defaultToken) {
      return { type: 'bearer', token: this.defaultToken };
    }

    // 4. Server-level Basic Auth fallback
    if (this.defaultUsername && this.defaultPassword) {
      return {
        type: 'basic',
        username: this.defaultUsername,
        password: this.defaultPassword,
      };
    }

    // 5. Fail-Safe: No credentials available anywhere
    throw new McpError(
      ErrorCode.InvalidRequest,
      'Authentication required: Please provide a Bitbucket Personal Access Token via Authorization header (Bearer <token>)'
    );
  }
}

