import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

/**
 * RequestIdMiddleware
 * Attaches a unique request ID to every incoming request.
 * Reads X-Request-Id header if present, otherwise generates a new UUID v4.
 */
export class RequestIdMiddleware {
  static use(req: Request, res: Response, next: NextFunction): void {
    const requestId =
      (req.headers['x-request-id'] as string | undefined) ?? uuidv4();
    req.headers['x-request-id'] = requestId;
    res.setHeader('X-Request-Id', requestId);
    next();
  }
}
