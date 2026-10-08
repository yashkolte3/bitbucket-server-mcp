import { describe, it, expect } from 'vitest';
import axios, { InternalAxiosRequestConfig } from 'axios';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import {
  ToolValidationError,
  ToolExecutionError,
  formatToolError,
  toolSuccessResult,
} from '../errors.js';

function getText(result: { content: Array<{ type: string; text?: string }> }): string {
  const item = result.content[0];
  if (item && item.type === 'text' && typeof item.text === 'string') {
    return item.text;
  }
  throw new Error('Expected text content');
}

describe('SEP-1303 Tool Error Formatting', () => {
  describe('ToolValidationError', () => {
    it('should format validation errors as Tool Execution Errors with isError: true', () => {
      const error = new ToolValidationError("Missing required parameter 'project'.");
      const result = formatToolError(error);

      expect(result.isError).toBe(true);
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      expect(getText(result)).toBe(
        "Input validation error: Missing required parameter 'project'."
      );
    });
  });

  describe('ToolExecutionError', () => {
    it('should format domain/execution errors with isError: true', () => {
      const error = new ToolExecutionError('Search API endpoint not available on this Bitbucket instance');
      const result = formatToolError(error);

      expect(result.isError).toBe(true);
      expect(result.content).toHaveLength(1);
      expect(getText(result)).toBe(
        'Tool execution error: Search API endpoint not available on this Bitbucket instance'
      );
    });
  });

  describe('Axios Bitbucket API Errors', () => {
    it('should format HTTP errors with status and error message', () => {
      const axiosError = new axios.AxiosError('Request failed with status code 404');
      axiosError.response = {
        status: 404,
        statusText: 'Not Found',
        headers: {},
        config: {} as unknown as InternalAxiosRequestConfig,
        data: { message: 'Repository not found' },
      };

      const result = formatToolError(axiosError);
      expect(result.isError).toBe(true);
      expect(getText(result)).toBe(
        'Bitbucket API error (404): Repository not found'
      );
    });

    it('should extract error from errors array in response data', () => {
      const axiosError = new axios.AxiosError('Bad Request');
      axiosError.response = {
        status: 400,
        statusText: 'Bad Request',
        headers: {},
        config: {} as unknown as InternalAxiosRequestConfig,
        data: {
          errors: [
            {
              context: 'branch',
              message: 'Branch name is already in use',
            },
          ],
        },
      };

      const result = formatToolError(axiosError);
      expect(result.isError).toBe(true);
      expect(getText(result)).toBe(
        'Bitbucket API error (400): Branch name is already in use'
      );
    });

    it('should format network error when no response is present', () => {
      const axiosError = new axios.AxiosError('connect ECONNREFUSED 127.0.0.1:7990');
      // No response property

      const result = formatToolError(axiosError);
      expect(result.isError).toBe(true);
      expect(getText(result)).toBe(
        'Bitbucket API network error: connect ECONNREFUSED 127.0.0.1:7990'
      );
    });
  });

  describe('McpError and generic Errors', () => {
    it('should format McpError message into CallToolResult with isError: true', () => {
      const mcpError = new McpError(ErrorCode.InvalidParams, 'Invalid parameters supplied');
      const result = formatToolError(mcpError);

      expect(result.isError).toBe(true);
      expect(getText(result)).toContain('Invalid parameters supplied');
    });

    it('should format standard Error instance', () => {
      const error = new Error('Unexpected disk read failure');
      const result = formatToolError(error);

      expect(result.isError).toBe(true);
      expect(getText(result)).toBe('Unexpected disk read failure');
    });

    it('should format non-error string or primitive', () => {
      const result = formatToolError('string failure message');
      expect(result.isError).toBe(true);
      expect(getText(result)).toBe('string failure message');
    });
  });

  describe('toolSuccessResult', () => {
    it('should wrap JSON payload without isError', () => {
      const data = { id: 123, status: 'OPEN' };
      const result = toolSuccessResult(data);

      expect(result.isError).toBeUndefined();
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      expect(JSON.parse(getText(result))).toEqual(data);
    });

    it('should wrap string payload directly', () => {
      const text = 'diff --git a/foo b/foo';
      const result = toolSuccessResult(text);

      expect(result.isError).toBeUndefined();
      expect(getText(result)).toBe(text);
    });
  });
});
