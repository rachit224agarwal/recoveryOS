import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string
  ) {
    super(message);
  }
}

export function success(res: Response, data: unknown, status = 200): Response {
  return res.status(status).json({ success: true, data });
}

export function fail(
  res: Response,
  statusCode: number,
  code: string,
  message: string
): Response {
  return res.status(statusCode).json({
    success: false,
    error: { code, message },
  });
}

export function notFoundHandler(req: Request, res: Response): Response {
  return fail(res, 404, "NOT_FOUND", `No route matches ${req.method} ${req.path}`);
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): Response {
  if (err instanceof ApiError) {
    return fail(res, err.statusCode, err.code, err.message);
  }
  if (err instanceof ZodError) {
    const first = err.issues[0];
    return fail(
      res,
      400,
      "VALIDATION_ERROR",
      first ? `${first.path.join(".")}: ${first.message}` : "Invalid request payload"
    );
  }
  // Log server-side with stack; never leak it to clients.
  console.error("[unhandled]", err);
  return fail(res, 500, "INTERNAL_ERROR", "Something went wrong. Please retry.");
}
