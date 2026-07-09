import { Router, Response } from "express";
import { prisma } from "../../config/database";
import { AppError, sendSuccess } from "../../utils/apiResponse";
import { authenticate, authorize, asyncHandler } from "../../middleware/auth";
import { reviewSchema } from "../../middleware/validate";
import { AuthRequest, getParam } from "../../utils/helpers";

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

router.get(
  "/gear/:gearId",
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const reviews = await prisma.review.findMany({
      where: { gearItemId: getParam(req.params.gearId) },
      include: {
        customer: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const avg =
      reviews.length > 0
        ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
        : 0;

    sendSuccess(res, { reviews, averageRating: Math.round(avg * 10) / 10 });
  })
);

export default router;
