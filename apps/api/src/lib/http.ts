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
  // Unbounded, `?page=999999999` was a deep-`OFFSET` scan available to anyone
  // who could call a list endpoint (L-8 in AUDIT_REPORT.md). Bounded in impact
  // even so — `pageSize`'s own cap of 200 means a full sweep of the ceiling
  // below is still finite work — but there is no legitimate reason this app's
  // own lists need more than 100,000 pages, so nothing real is lost by capping it.
  page: z.coerce.number().int().min(1).max(100_000).default(1),
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
