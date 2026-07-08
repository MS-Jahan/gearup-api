import { Router, Response } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../../config/database";
import { AppError, sendSuccess } from "../../utils/apiResponse";
import { excludePassword, signToken, AuthRequest } from "../../utils/helpers";
import { authenticate, asyncHandler } from "../../middleware/auth";
import { loginSchema, registerSchema } from "../../middleware/validate";

const router = Router();

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new customer or provider
 */
router.post(
  "/register",
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = registerSchema.parse(req.body);

    const existing = await prisma.user.findUnique({
      where: { email: data.email },
    });
    if (existing) {
      throw new AppError("Email already registered", 409);
    }

    const hashed = await bcrypt.hash(data.password, 10);
    const user = await prisma.user.create({
      data: {
        email: data.email,
        password: hashed,
        name: data.name,
        phone: data.phone,
        role: data.role,
      },
    });

    const token = signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    sendSuccess(
      res,
      { user: excludePassword(user), token },
      "Registration successful",
      201
    );
  })
);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login and get JWT token
 */
router.post(
  "/login",
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email: data.email } });
    if (!user) {
      throw new AppError("Invalid email or password", 401);
    }

    if (user.status === "SUSPENDED") {
      throw new AppError("Your account has been suspended", 403);
    }

    const valid = await bcrypt.compare(data.password, user.password);
    if (!valid) {
      throw new AppError("Invalid email or password", 401);
    }

    const token = signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    sendSuccess(res, { user: excludePassword(user), token }, "Login successful");
  })
);

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get current authenticated user
 */
router.get(
  "/me",
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
    });
    if (!user) {
      throw new AppError("User not found", 404);
    }
    sendSuccess(res, excludePassword(user));
  })
);

export default router;
