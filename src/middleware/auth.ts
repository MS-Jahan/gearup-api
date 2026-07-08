import { Response, NextFunction } from "express";
import { Role } from "@prisma/client";
import { prisma } from "../config/database";
import { AppError } from "../utils/apiResponse";
import { AuthRequest, verifyToken } from "../utils/helpers";

export const authenticate = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw new AppError("Authentication required", 401);
  }

  const token = header.split(" ")[1];
  const payload = verifyToken(token);

  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!user || user.status === "SUSPENDED") {
    throw new AppError("Account suspended or not found", 403);
  }

  req.user = payload;
  next();
};

export const authorize = (...roles: Role[]) => {
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError("Authentication required", 401);
    }
    if (!roles.includes(req.user.role)) {
      throw new AppError("You do not have permission", 403);
    }
    next();
  };
};

export const asyncHandler =
  (fn: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>) =>
  (req: AuthRequest, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
