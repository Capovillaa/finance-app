import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { z } from 'zod/v4';

/**
 * Wraps an async handler so a rejected promise reaches Express's error
 * middleware instead of becoming an unhandled rejection.
 */
export function asyncHandler<T>(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<T>,
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export type Pagination = z.infer<typeof paginationSchema>;

export function buildPage<T>(items: T[], total: number, { page, pageSize }: Pagination): Page<T> {
  const totalPages = pageSize > 0 ? Math.ceil(total / pageSize) : 0;
  return {
    items,
    page,
    pageSize,
    total,
    totalPages,
    hasMore: page < totalPages,
  };
}

export const offsetOf = ({ page, pageSize }: Pagination): number => (page - 1) * pageSize;

export const sortDirectionSchema = z.enum(['asc', 'desc']).default('desc');
