import { Router, Response } from "express";
import { prisma } from "../../config/database";
import { AppError, sendSuccess } from "../../utils/apiResponse";
import { excludePassword, getParam, paginatedResponse } from "../../utils/helpers";
import { authenticate, authorize, asyncHandler } from "../../middleware/auth";
import { adminUsersQuerySchema, paginationQuerySchema, updateUserStatusSchema } from "../../middleware/validate";
import { AuthRequest } from "../../utils/helpers";

const router = Router();

router.use(authenticate, authorize("ADMIN"));

/**
 * @swagger
 * /api/admin/users:
 *   get:
 *     tags: [Admin]
 *     summary: List all users (paginated)
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 10
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [CUSTOMER, PROVIDER, ADMIN]
 */
router.get(
  "/users",
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const query = adminUsersQuerySchema.parse(req.query);
    const where = query.role ? { role: query.role } : {};
    const skip = (query.page - 1) * query.limit;

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: query.limit,
      }),
      prisma.user.count({ where }),
    ]);

    sendSuccess(
      res,
      paginatedResponse(users.map(excludePassword), total, query.page, query.limit)
    );
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
 *     summary: List all gear listings (paginated)
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 10
 */
router.get(
  "/gear",
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const query = paginationQuerySchema.parse(req.query);
    const skip = (query.page - 1) * query.limit;

    const [gear, total] = await Promise.all([
      prisma.gearItem.findMany({
        include: {
          category: true,
          provider: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: query.limit,
      }),
      prisma.gearItem.count(),
    ]);

    sendSuccess(res, paginatedResponse(gear, total, query.page, query.limit));
  })
);

/**
 * @swagger
 * /api/admin/rentals:
 *   get:
 *     tags: [Admin]
 *     summary: List all rental orders (paginated)
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 10
 */
router.get(
  "/rentals",
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const query = paginationQuerySchema.parse(req.query);
    const skip = (query.page - 1) * query.limit;

    const [rentals, total] = await Promise.all([
      prisma.rentalOrder.findMany({
        include: {
          customer: { select: { id: true, name: true, email: true } },
          provider: { select: { id: true, name: true } },
          items: { include: { gearItem: true } },
          payment: true,
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: query.limit,
      }),
      prisma.rentalOrder.count(),
    ]);

    sendSuccess(res, paginatedResponse(rentals, total, query.page, query.limit));
  })
);

export default router;
