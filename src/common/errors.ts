import { Request, Response, NextFunction, RequestHandler } from "express";

export class APIError extends Error {
  constructor(
    public status: number,
    public error: string,
    message: string
  ) {
    super(message);
    this.name = "APIError";
  }
}

export const asyncHandler =
  (
    fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
  ): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void => {
  if (err instanceof APIError) {
    res.status(err.status).json({ error: err.error, message: err.message });
    return;
  }
  console.error(err);
  res
    .status(500)
    .json({ error: "InternalError", message: "An unexpected error occurred" });
};
