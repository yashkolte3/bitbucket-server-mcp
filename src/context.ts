import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Context associated with an individual request lifecycle.
 */
export interface RequestContext {
  /**
   * Client-provided Personal Access Token, if supplied via headers.
   */
  readonly token?: string;
  /**
   * Unique request identifier for distributed tracing.
   */
  readonly requestId: string;
  /**
   * Client IP address or gateway origin.
   */
  readonly clientIp?: string;
  /**
   * Timestamp when the request ingress occurred.
   */
  readonly timestamp: number;
}

/**
 * Single Responsibility abstraction for managing async request isolation.
 */
export interface IRequestContextScope {
  /**
   * Runs the given callback within an isolated request context scope.
   */
  run<T>(context: RequestContext, fn: () => Promise<T>): Promise<T>;

  /**
   * Retrieves the current request context if active, or undefined.
   */
  get(): RequestContext | undefined;
}

/**
 * Node.js AsyncLocalStorage implementation of IRequestContextScope.
 * Guarantees zero cross-talk between concurrent async operations.
 */
class AsyncLocalStorageContextScope implements IRequestContextScope {
  private readonly storage = new AsyncLocalStorage<RequestContext>();

  run<T>(context: RequestContext, fn: () => Promise<T>): Promise<T> {
    return this.storage.run(context, fn);
  }

  get(): RequestContext | undefined {
    return this.storage.getStore();
  }
}

/**
 * Global singleton request context scope.
 */
export const requestContextScope: IRequestContextScope = new AsyncLocalStorageContextScope();

