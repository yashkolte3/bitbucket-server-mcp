import axios, { type AxiosError } from 'axios';
import { McpError, type CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * Error raised when input parameters fail validation against schema or requirements.
 */
export class ToolValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolValidationError';
  }
}

/**
 * Error raised when a business or domain rule violation occurs during tool execution.
 */
export class ToolExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolExecutionError';
  }
}

/**
 * Wraps successful tool payload into standard MCP CallToolResult.
 */
export function toolSuccessResult(data: unknown): CallToolResult {
  return {
    content: [
      {
        type: 'text',
        text: typeof data === 'string' ? data : JSON.stringify(data, null, 2),
      },
    ],
  };
}

function isAxiosError(error: unknown): error is AxiosError {
  if (typeof axios.isAxiosError === 'function') {
    return axios.isAxiosError(error);
  }
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { isAxiosError?: boolean }).isAxiosError === true
  );
}

/**
 * Formats any tool execution or input validation failure into an SEP-1303 compliant
 * Tool Execution Error result with `isError: true`.
 */
export function formatToolError(error: unknown): CallToolResult {
  let errorMessage: string;

  if (isAxiosError(error)) {
    const status = error.response?.status;
    const responseData = error.response?.data as Record<string, unknown> | string | undefined;

    let apiDetail = '';
    if (typeof responseData === 'object' && responseData !== null) {
      if (typeof responseData.message === 'string') {
        apiDetail = responseData.message;
      } else if (Array.isArray(responseData.errors) && responseData.errors.length > 0) {
        const firstErr = responseData.errors[0] as Record<string, unknown>;
        apiDetail = typeof firstErr.message === 'string' ? firstErr.message : JSON.stringify(firstErr);
      }
    } else if (typeof responseData === 'string' && responseData.trim()) {
      apiDetail = responseData.trim();
    }

    if (!apiDetail) {
      apiDetail = error.message;
    }

    if (status) {
      errorMessage = `Bitbucket API error (${status}): ${apiDetail}`;
    } else if (error.response) {
      errorMessage = `Bitbucket API error: ${apiDetail}`;
    } else {
      errorMessage = `Bitbucket API network error: ${apiDetail}`;
    }
  } else if (error instanceof ToolValidationError) {
    errorMessage = `Input validation error: ${error.message}`;
  } else if (error instanceof ToolExecutionError) {
    errorMessage = `Tool execution error: ${error.message}`;
  } else if (error instanceof McpError) {
    errorMessage = error.message;
  } else if (error instanceof Error) {
    errorMessage = error.message;
  } else {
    errorMessage = String(error);
  }

  return {
    content: [
      {
        type: 'text',
        text: errorMessage,
      },
    ],
    isError: true,
  };
}
