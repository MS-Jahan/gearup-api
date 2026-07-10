import { Request } from "express";
import jwt from "jsonwebtoken";
import { Role } from "@prisma/client";
import { config } from "../config";
import { AppError } from "./apiResponse";

export interface JwtPayload {
  userId: string;
  email: string;
  role: Role;
}

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

export const signToken = (payload: JwtPayload): string => {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn as jwt.SignOptions["expiresIn"],
  });
};

export const verifyToken = (token: string): JwtPayload => {
  try {
    return jwt.verify(token, config.jwt.secret) as JwtPayload;
  } catch {
    throw new AppError("Invalid or expired token", 401);
  }
};

export const excludePassword = <T extends { password?: string }>(
  user: T
): Omit<T, "password"> => {
  const { password: _, ...rest } = user;
  return rest;
};

export const calculateRentalDays = (start: Date, end: Date): number => {
  const diff = end.getTime() - start.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

export const slugify = (text: string): string => {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

export const getParam = (value: string | string[]): string => {
  return Array.isArray(value) ? value[0] : value;
};

export const buildPaginationMeta = (
  total: number,
  page: number,
  limit: number
) => ({
  total,
  page,
  limit,
  totalPages: Math.ceil(total / limit) || 1,
});

export const paginatedResponse = <T>(
  items: T[],
  total: number,
  page: number,
  limit: number
) => ({
  items,
  meta: buildPaginationMeta(total, page, limit),
});
