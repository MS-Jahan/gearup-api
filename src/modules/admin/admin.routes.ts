import { Router, Response } from "express";
import { prisma } from "../../config/database";
import { AppError, sendSuccess } from "../../utils/apiResponse";
import { excludePassword, getParam } from "../../utils/helpers";
import { authenticate, authorize, asyncHandler } from "../../middleware/auth";
import { updateUserStatusSchema } from "../../middleware/validate";
import { AuthRequest } from "../../utils/helpers";

const router = Router();

router.use(authenticate, authorize("ADMIN"));

/**
 * @swagger
 * /api/admin/users:
 *   get:
 *     tags: [Admin]
 *     summary: List all users
 */
router.get(
  "/users",
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const role = req.query.role as string | undefined;
    const where = role ? { role: role as "CUSTOMER" | "PROVIDER" | "ADMIN" } : {};

    const users = await prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    sendSuccess(res, users.map(excludePassword));
  })
);

/**
 * @swagger
 * /api/admin/users/{id}:
 *   patch:
 *     tags: [Admin]
 *     summary: Update user status (suspend or activate)
 */
router.patch(
  "/users/:id",
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { status } = updateUserStatusSchema.parse(req.body);

    const userId = getParam(req.params.id);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new AppError("User not found", 404);
    }
    if (user.role === "ADMIN") {
      throw new AppError("Cannot modify admin account", 403);
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { status },
    });

    sendSuccess(res, excludePassword(updated), "User status updated");
  })
);

/**
 * @swagger
 * /api/admin/gear:
 *   get:
 *     tags: [Admin]
 *     summary: List all gear listings
 */
router.get(
  "/gear",
  asyncHandler(async (_req: AuthRequest, res: Response) => {
    const gear = await prisma.gearItem.findMany({
      include: {
        category: true,
        provider: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    sendSuccess(res, gear);
  })
);

/**
 * @swagger
 * /api/admin/rentals:
 *   get:
 *     tags: [Admin]
 *     summary: List all rental orders
 */
router.get(
  "/rentals",
  asyncHandler(async (_req: AuthRequest, res: Response) => {
    const rentals = await prisma.rentalOrder.findMany({
      include: {
        customer: { select: { id: true, name: true, email: true } },
        provider: { select: { id: true, name: true } },
        items: { include: { gearItem: true } },
        payment: true,
      },
      orderBy: { createdAt: "desc" },
    });
    sendSuccess(res, rentals);
  })
);

export default router;
