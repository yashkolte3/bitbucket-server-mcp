import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import https from 'node:https';
import http from 'node:http';
import { IAuthenticationResolver } from './auth.js';

export interface BitbucketClientConfig {
  baseUrl: string;
  customHeaders?: Record<string, string>;
  timeoutMs?: number;
  httpAgent?: http.Agent;
  httpsAgent?: https.Agent;
}

export interface IBitbucketClient {
  get<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>>;
  post<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<AxiosResponse<T>>;
  put<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<AxiosResponse<T>>;
  delete<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>>;
}

/**
 * Creates connection-pooled HTTP and HTTPS agents with keepAlive enabled.
 */
export function createConnectionPoolAgents(): { httpAgent: http.Agent; httpsAgent: https.Agent } {
  const agentOptions = {
    keepAlive: true,
    maxSockets: 100,
    maxFreeSockets: 10,
    timeout: 60000,
    keepAliveMsecs: 1000,
  };
  return {
    httpAgent: new http.Agent(agentOptions),
    httpsAgent: new https.Agent(agentOptions),
  };
}

export class BitbucketHttpClient implements IBitbucketClient {
  readonly api: AxiosInstance;

  constructor(
    config: BitbucketClientConfig,
    private readonly authResolver: IAuthenticationResolver
  ) {
    const { httpAgent, httpsAgent } = createConnectionPoolAgents();

    this.api = axios.create({
      baseURL: `${config.baseUrl}/rest/api/1.0`,
      timeout: config.timeoutMs ?? 60000,
      httpAgent: config.httpAgent ?? httpAgent,
      httpsAgent: config.httpsAgent ?? httpsAgent,
      headers: {
        ...config.customHeaders,
      },
    });

    // Dynamic per-request credential resolution via Axios interceptor
    if (this.api.interceptors?.request?.use) {
      this.api.interceptors.request.use((reqConfig) => {
        const creds = this.authResolver.resolve();

        if (creds.type === 'bearer' && creds.token) {
          if (!reqConfig.headers) {
            reqConfig.headers = new axios.AxiosHeaders();
          }
          if (typeof reqConfig.headers.set === 'function') {
            reqConfig.headers.set('Authorization', `Bearer ${creds.token}`);
          } else {
            (reqConfig.headers as Record<string, string>)['Authorization'] = `Bearer ${creds.token}`;
          }
        } else if (creds.type === 'basic' && creds.username && creds.password) {
          reqConfig.auth = { username: creds.username, password: creds.password };
        }

        return reqConfig;
      });
    }
  }

  async get<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.api.get<T>(url, config);
  }

  async post<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.api.post<T>(url, data, config);
  }

  async put<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.api.put<T>(url, data, config);
  }

  async delete<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.api.delete<T>(url, config);
  }
}

