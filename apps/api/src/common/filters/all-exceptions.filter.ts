import { STATUS_CODES } from 'node:http';
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { ErrorResponse } from '@coursecraft/shared';

function isHealthCheckResult(value: unknown): boolean {
  return typeof value === 'object' && value !== null && 'status' in value && 'details' in value;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly adapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.adapterHost;
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<{ id?: string }>();

    const statusCode =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    let message: string | string[] = 'Internal server error';
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      if (isHealthCheckResult(response)) {
        // @nestjs/terminus failures keep their own documented shape (which dependency is down).
        httpAdapter.reply(ctx.getResponse(), response, statusCode);
        return;
      }
      message =
        typeof response === 'string'
          ? response
          : ((response as { message?: string | string[] }).message ?? exception.message);
    } else {
      // Unknown errors are logged with their stack but never leaked to clients.
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }

    const body: ErrorResponse = {
      statusCode,
      error: STATUS_CODES[statusCode] ?? 'Error',
      message,
      path: httpAdapter.getRequestUrl(ctx.getRequest()) as string,
      timestamp: new Date().toISOString(),
      requestId: req.id,
    };
    httpAdapter.reply(ctx.getResponse(), body, statusCode);
  }
}
