import express, { Request, Response, Express } from 'express';
import cors from 'cors';
import { createServer, Server as HttpServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { BitbucketServer, BitbucketServerOptions, logger } from './index.js';

export interface SessionContext {
  transport: StreamableHTTPServerTransport;
  server: BitbucketServer;
  token?: string;
  createdAt: Date;
}

export interface HttpServerOptions {
  defaultProject?: string;
  readOnly?: boolean;
  corsOrigin?: string | string[];
}

/**
 * Registry of active MCP sessions mapped by session ID.
 */
export const sessions = new Map<string, SessionContext>();

/**
 * Extract personal access token from Authorization header or X-Bitbucket-Token.
 * Accepts:
 *   - "Bearer <token>"
 *   - "<token>"
 *   - X-Bitbucket-Token header
 */
export function extractClientToken(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const trimmed = authHeader.trim();
    if (trimmed.toLowerCase().startsWith('bearer ')) {
      const token = trimmed.substring(7).trim();
      return token || undefined;
    }
    return trimmed || undefined;
  }

  const customHeader = req.headers['x-bitbucket-token'];
  if (typeof customHeader === 'string' && customHeader.trim()) {
    return customHeader.trim();
  }

  return undefined;
}

/**
 * Check whether the parsed JSON-RPC payload is an initialize request.
 */
export function checkIsInitializeRequest(body: unknown): boolean {
  if (!body || typeof body !== 'object') {
    return false;
  }
  if (Array.isArray(body)) {
    return body.some((msg) => isInitializeRequest(msg));
  }
  return isInitializeRequest(body);
}

/**
 * Creates and configures the Express application for MCP Streamable HTTP.
 */
export function createHttpApp(options?: HttpServerOptions): Express {
  const app = express();

  // Middleware
  app.use(express.json());
  app.use(
    cors({
      origin: options?.corsOrigin || '*',
      methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'mcp-session-id',
        'mcp-protocol-version',
        'last-event-id',
        'x-bitbucket-token',
      ],
      exposedHeaders: ['mcp-session-id', 'mcp-protocol-version'],
    })
  );

  // Health check endpoint
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      transport: 'streamable-http',
      activeSessions: sessions.size,
      bitbucketUrl: process.env.BITBUCKET_URL || undefined,
      defaultProject: options?.defaultProject || process.env.BITBUCKET_DEFAULT_PROJECT,
      readOnly: options?.readOnly ?? (process.env.BITBUCKET_READ_ONLY === 'true'),
    });
  });

  // POST handler for /mcp and root /
  const handlePost = async (req: Request, res: Response): Promise<void> => {
    const sessionId = (req.headers['mcp-session-id'] as string | undefined) ||
      (req.query?.sessionId as string | undefined);

    // Case 1: Existing session continuation
    if (sessionId) {
      const session = sessions.get(sessionId);
      if (!session) {
        res.status(404).json({
          jsonrpc: '2.0',
          error: {
            code: -32001,
            message: 'Session not found or expired',
          },
          id: null,
        });
        return;
      }

      try {
        await session.transport.handleRequest(req, res, req.body);
      } catch (error) {
        logger.error('[HTTP] Error handling request for session ' + sessionId, error);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: '2.0',
            error: { code: -32603, message: 'Internal server error' },
            id: null,
          });
        }
      }
      return;
    }

    // Case 2: New session initialization
    if (checkIsInitializeRequest(req.body)) {
      const clientToken = extractClientToken(req);
      const defaultToken = process.env.BITBUCKET_TOKEN;
      const effectiveToken = clientToken || defaultToken;

      const hasUsernamePassword = Boolean(
        process.env.BITBUCKET_USERNAME && process.env.BITBUCKET_PASSWORD
      );

      // Enforce credentials presence
      if (!effectiveToken && !hasUsernamePassword) {
        res.status(401).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message:
              'Unauthorized: Bitbucket PAT is required via Authorization header (Bearer <token>) or server BITBUCKET_TOKEN configuration',
          },
          id: null,
        });
        return;
      }

      try {
        const serverOptions: BitbucketServerOptions = {
          token: effectiveToken,
          defaultProject: options?.defaultProject,
          readOnly: options?.readOnly,
        };

        const bbServer = new BitbucketServer(serverOptions);

        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (newSessionId: string) => {
            sessions.set(newSessionId, {
              transport,
              server: bbServer,
              token: effectiveToken,
              createdAt: new Date(),
            });
            logger.info(`[HTTP] Initialized MCP session: ${newSessionId} (custom PAT: ${Boolean(clientToken)})`);
          },
          onsessionclosed: (closedSessionId: string) => {
            sessions.delete(closedSessionId);
            logger.info(`[HTTP] Closed MCP session: ${closedSessionId}`);
          },
        });

        transport.onclose = () => {
          if (transport.sessionId) {
            sessions.delete(transport.sessionId);
            logger.info(`[HTTP] MCP transport closed for session: ${transport.sessionId}`);
          }
        };

        await bbServer.connect(transport);
        await transport.handleRequest(req, res, req.body);
      } catch (error) {
        logger.error('[HTTP] Error initializing MCP session', error);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: '2.0',
            error: {
              code: -32603,
              message: error instanceof Error ? error.message : 'Failed to initialize MCP session',
            },
            id: null,
          });
        }
      }
      return;
    }

    // Case 3: Missing session ID and not an initialize request
    res.status(400).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Bad Request: Mcp-Session-Id header is required for non-initialization requests',
      },
      id: null,
    });
  };

  // GET handler for SSE stream on /mcp and root /
  const handleGet = async (req: Request, res: Response): Promise<void> => {
    const sessionId = (req.headers['mcp-session-id'] as string | undefined) ||
      (req.query?.sessionId as string | undefined);

    if (!sessionId) {
      res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Bad Request: Mcp-Session-Id header is required',
        },
        id: null,
      });
      return;
    }

    const session = sessions.get(sessionId);
    if (!session) {
      res.status(404).json({
        jsonrpc: '2.0',
        error: {
          code: -32001,
          message: 'Session not found or expired',
        },
        id: null,
      });
      return;
    }

    try {
      await session.transport.handleRequest(req, res);
    } catch (error) {
      logger.error('[HTTP] Error in SSE stream for session ' + sessionId, error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    }
  };

  // DELETE handler for closing session on /mcp and root /
  const handleDelete = async (req: Request, res: Response): Promise<void> => {
    const sessionId = (req.headers['mcp-session-id'] as string | undefined) ||
      (req.query?.sessionId as string | undefined);

    if (!sessionId) {
      res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Bad Request: Mcp-Session-Id header is required',
        },
        id: null,
      });
      return;
    }

    const session = sessions.get(sessionId);
    if (!session) {
      res.status(404).json({
        jsonrpc: '2.0',
        error: {
          code: -32001,
          message: 'Session not found or expired',
        },
        id: null,
      });
      return;
    }

    try {
      await session.transport.handleRequest(req, res);
    } catch (error) {
      logger.error('[HTTP] Error terminating session ' + sessionId, error);
    } finally {
      sessions.delete(sessionId);
    }
  };

  app.post('/mcp', handlePost);
  app.get('/mcp', handleGet);
  app.delete('/mcp', handleDelete);

  // Also support root path / for clients configured without /mcp path
  app.post('/', handlePost);
  app.get('/', (req: Request, res: Response) => {
    // If Accept header is text/event-stream, route to SSE handleGet
    const accept = req.headers.accept;
    if (accept && accept.includes('text/event-stream')) {
      return handleGet(req, res);
    }
    // Otherwise show server info
    res.status(200).json({
      name: 'bitbucket-server-mcp',
      transport: 'streamable-http',
      endpoint: '/mcp',
      activeSessions: sessions.size,
    });
  });
  app.delete('/', handleDelete);

  return app;
}

/**
 * Start the HTTP Streamable server on specified port and host.
 */
export async function startHttpServer(
  port: number = parseInt(process.env.PORT || '3000', 10),
  host: string = process.env.HOST || '0.0.0.0',
  options?: HttpServerOptions
): Promise<HttpServer> {
  if (!process.env.BITBUCKET_URL) {
    const errorMsg = 'BITBUCKET_URL environment variable is required to start the MCP server';
    logger.error(`[HTTP] ${errorMsg}`);
    throw new Error(errorMsg);
  }

  const app = createHttpApp(options);
  const server = createServer(app);

  return new Promise((resolve, reject) => {
    server.on('error', (err) => {
      logger.error('[HTTP] Server listen error', err);
      reject(err);
    });

    server.listen(port, host, () => {
      const displayHost = host === '0.0.0.0' ? 'localhost' : host;
      const url = `http://${displayHost}:${port}/mcp`;
      logger.info(`[HTTP] Bitbucket MCP server running on ${url}`);
      console.log(`[HTTP] Bitbucket MCP server listening on ${url}`);
      if (process.env.BITBUCKET_TOKEN) {
        console.log('[HTTP] Default BITBUCKET_TOKEN configured (can be overridden via Authorization header)');
      } else {
        console.log('[HTTP] No default BITBUCKET_TOKEN set - clients must provide Authorization header (Bearer <PAT>)');
      }
      resolve(server);
    });
  });
}
