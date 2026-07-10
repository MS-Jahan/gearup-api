import { Router, Response } from "express";
import { prisma } from "../../config/database";
import { AppError, sendSuccess } from "../../utils/apiResponse";
import { authenticate, authorize, asyncHandler } from "../../middleware/auth";
import { reviewSchema, paginationQuerySchema } from "../../middleware/validate";
import { AuthRequest, getParam, buildPaginationMeta } from "../../utils/helpers";

const router = Router();

/**
 * @swagger
 * /api/reviews:
 *   post:
 *     tags: [Reviews]
 *     summary: Leave a review after gear is returned
 */
router.post(
  "/",
  authenticate,
  authorize("CUSTOMER"),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = reviewSchema.parse(req.body);

    const order = await prisma.rentalOrder.findFirst({
      where: {
        id: data.rentalOrderId,
        customerId: req.user!.userId,
        status: "RETURNED",
      },
      include: { items: true, review: true },
    });

    if (!order) {
      throw new AppError("Returned rental order not found", 404);
    }

    if (order.review) {
      throw new AppError("Review already submitted for this order", 409);
    }

    const hasGear = order.items.some((i) => i.gearItemId === data.gearItemId);
    if (!hasGear) {
      throw new AppError("Gear item was not part of this rental", 400);
    }

    const review = await prisma.review.create({
      data: {
        customerId: req.user!.userId,
        gearItemId: data.gearItemId,
        rentalOrderId: data.rentalOrderId,
        rating: data.rating,
        comment: data.comment,
      },
      include: {
        customer: { select: { id: true, name: true } },
        gearItem: { select: { id: true, name: true } },
      },
    });

    sendSuccess(res, review, "Review submitted", 201);
  })
);

/**
 * @swagger
 * /api/reviews/gear/{gearId}:
 *   get:
 *     tags: [Reviews]
 *     summary: Get reviews for a gear item (paginated)
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
  "/gear/:gearId",
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const query = paginationQuerySchema.parse(req.query);
    const gearItemId = getParam(req.params.gearId);
    const where = { gearItemId };
    const skip = (query.page - 1) * query.limit;

    const [items, total, aggregate] = await Promise.all([
      prisma.review.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: query.limit,
      }),
      prisma.review.count({ where }),
      prisma.review.aggregate({
        where,
        _avg: { rating: true },
      }),
    ]);

    sendSuccess(res, {
      items,
      averageRating:
        Math.round((aggregate._avg.rating ?? 0) * 10) / 10,
      meta: buildPaginationMeta(total, query.page, query.limit),
    });
  })
);

export default router;
