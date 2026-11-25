import type { ErrorRequestHandler } from 'express';

export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
  };
}

export class ApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ApiError';
  }
}

export function upstreamApiError(cause?: unknown): ApiError {
  return new ApiError(
    502,
    'upstream_error',
    'The upstream service could not complete the request.',
    { cause },
  );
}

function bodyParserApiError(error: unknown): ApiError | undefined {
  if (
    typeof error !== 'object' ||
    error === null ||
    !('type' in error) ||
    typeof error.type !== 'string' ||
    !('status' in error) ||
    typeof error.status !== 'number' ||
    error.status < 400 ||
    error.status >= 500
  ) {
    return undefined;
  }

  if (error.status === 400 && error instanceof SyntaxError) {
    return new ApiError(400, 'invalid_request', 'The JSON request body is invalid.');
  }
  return new ApiError(
    error.status,
    'invalid_request',
    'The request body could not be processed.',
  );
}

export const errorHandler: ErrorRequestHandler = (
  error,
  _request,
  response,
  _next,
) => {
  const apiError =
    error instanceof ApiError
      ? error
      : (bodyParserApiError(error) ??
        new ApiError(500, 'internal_error', 'The request could not be completed.'));

  if (apiError.statusCode >= 500) {
    console.error('Request failed', apiError.cause ?? error);
  }

  const envelope: ErrorEnvelope = {
    error: {
      code: apiError.code,
      message: apiError.message,
    },
  };

  response.status(apiError.statusCode).json(envelope);
};
