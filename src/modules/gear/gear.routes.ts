import { Router, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/database";
import { AppError, sendSuccess } from "../../utils/apiResponse";
import { asyncHandler } from "../../middleware/auth";
import { gearQuerySchema } from "../../middleware/validate";
import { AuthRequest, getParam } from "../../utils/helpers";

const router = Router();

/**
 * @swagger
 * /api/gear:
 *   get:
 *     tags: [Gear]
 *     summary: Browse gear with filters
 */
router.get(
  "/",
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const query = gearQuerySchema.parse(req.query);
    const where: Prisma.GearItemWhereInput = {};

    if (query.category) {
      where.category = { slug: query.category };
    }
    if (query.brand) {
      where.brand = { contains: query.brand, mode: "insensitive" };
    }
    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      where.pricePerDay = {};
      if (query.minPrice !== undefined) where.pricePerDay.gte = query.minPrice;
      if (query.maxPrice !== undefined) where.pricePerDay.lte = query.maxPrice;
    }
    if (query.available === true) {
      where.status = "AVAILABLE";
      where.stock = { gt: 0 };
    }

    let orderBy: Prisma.GearItemOrderByWithRelationInput = { createdAt: "desc" };
    if (query.sort === "price_asc") orderBy = { pricePerDay: "asc" };
    if (query.sort === "price_desc") orderBy = { pricePerDay: "desc" };

    const skip = (query.page - 1) * query.limit;

    const [items, total] = await Promise.all([
      prisma.gearItem.findMany({
        where,
        orderBy,
        skip,
        take: query.limit,
        include: {
          category: { select: { id: true, name: true, slug: true } },
          provider: { select: { id: true, name: true } },
          _count: { select: { reviews: true } },
        },
      }),
      prisma.gearItem.count({ where }),
    ]);

    sendSuccess(res, {
      items,
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      },
    });
  })
);

/**
 * @swagger
 * /api/gear/{id}:
 *   get:
 *     tags: [Gear]
 *     summary: Get gear details
 */
router.get(
  "/:id",
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const gear = await prisma.gearItem.findUnique({
      where: { id: getParam(req.params.id) },
      include: {
        category: true,
        provider: { select: { id: true, name: true, email: true } },
        reviews: {
          include: {
            customer: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    });

    if (!gear) {
      throw new AppError("Gear not found", 404);
    }

    sendSuccess(res, gear);
  })
);

export default router;
