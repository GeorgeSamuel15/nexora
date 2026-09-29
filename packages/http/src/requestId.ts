import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId: string;
      startTime: number;
    }
  }
}

export function requestId(req: Request, res: Response, next: NextFunction): void {
  req.requestId = req.header("x-request-id") ?? randomUUID();
  req.startTime = Date.now();
  res.setHeader("x-request-id", req.requestId);
  next();
}
