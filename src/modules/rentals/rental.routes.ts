import { Router, Response } from "express";
import { prisma } from "../../config/database";
import { AppError, sendSuccess } from "../../utils/apiResponse";
import { calculateRentalDays, AuthRequest, getParam } from "../../utils/helpers";
import { authenticate, authorize, asyncHandler } from "../../middleware/auth";
import { createRentalSchema } from "../../middleware/validate";

const router = Router();

router.use(authenticate, authorize("CUSTOMER"));

/**
 * @swagger
 * /api/rentals:
 *   post:
 *     tags: [Rentals]
 *     summary: Create a rental order
 */
router.post(
  "/",
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = createRentalSchema.parse(req.body);
    const startDate = new Date(data.startDate);
    const endDate = new Date(data.endDate);
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    if (startDate < now) {
      throw new AppError("Start date cannot be in the past", 400);
    }
    if (endDate <= startDate) {
      throw new AppError("End date must be after start date", 400);
    }

    const days = calculateRentalDays(startDate, endDate);
    if (days < 1) {
      throw new AppError("Rental must be at least 1 day", 400);
    }

    const gearIds = data.items.map((i) => i.gearItemId);
    const gearItems = await prisma.gearItem.findMany({
      where: { id: { in: gearIds } },
    });

    if (gearItems.length !== gearIds.length) {
      throw new AppError("One or more gear items not found", 404);
    }

    // all items must belong to same provider
    const providerIds = [...new Set(gearItems.map((g) => g.providerId))];
    if (providerIds.length > 1) {
      throw new AppError("All items must be from the same provider", 400);
    }

    let totalAmount = 0;
    const orderItems: {
      gearItemId: string;
      quantity: number;
      pricePerDay: number;
    }[] = [];

    for (const item of data.items) {
      const gear = gearItems.find((g) => g.id === item.gearItemId)!;
      if (gear.status !== "AVAILABLE" || gear.stock < item.quantity) {
        throw new AppError(
          `Insufficient stock for ${gear.name}`,
          400,
          { gearId: gear.id, available: gear.stock }
        );
      }
      const price = Number(gear.pricePerDay);
      totalAmount += price * item.quantity * days;
      orderItems.push({
        gearItemId: gear.id,
        quantity: item.quantity,
        pricePerDay: price,
      });
    }

    const order = await prisma.$transaction(async (tx) => {
      for (const item of data.items) {
        await tx.gearItem.update({
          where: { id: item.gearItemId },
          data: { stock: { decrement: item.quantity } },
        });
      }

      return tx.rentalOrder.create({
        data: {
          customerId: req.user!.userId,
          providerId: providerIds[0],
          startDate,
          endDate,
          totalAmount,
          items: { create: orderItems },
        },
        include: {
          items: { include: { gearItem: true } },
          provider: { select: { id: true, name: true } },
        },
      });
    });

    sendSuccess(res, order, "Rental order placed", 201);
  })
);

/**
 * @swagger
 * /api/rentals:
 *   get:
 *     tags: [Rentals]
 *     summary: List current customer's rental orders
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         description: Max number of recent orders to return (newest first)
 */
router.get(
  "/",
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const rawLimit = req.query.limit;
    const limit =
      rawLimit !== undefined ? parseInt(String(rawLimit), 10) : undefined;
    if (limit !== undefined && (Number.isNaN(limit) || limit < 1 || limit > 100)) {
      throw new AppError("limit must be between 1 and 100", 400);
    }

    const orders = await prisma.rentalOrder.findMany({
      where: { customerId: req.user!.userId },
      include: {
        items: { include: { gearItem: true } },
        payment: true,
        provider: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      ...(limit !== undefined ? { take: limit } : {}),
    });
    sendSuccess(res, orders);
  })
);

/**
 * @swagger
 * /api/rentals/{id}:
 *   get:
 *     tags: [Rentals]
 *     summary: Get rental order details
 */
router.get(
  "/:id",
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const orderId = getParam(req.params.id);
    const order = await prisma.rentalOrder.findFirst({
      where: {
        id: orderId,
        OR: [
          { customerId: req.user!.userId },
          { providerId: req.user!.userId },
        ],
      },
      include: {
        items: { include: { gearItem: true } },
        payment: true,
        review: true,
        customer: { select: { id: true, name: true } },
        provider: { select: { id: true, name: true } },
      },
    });

    if (!order) {
      throw new AppError("Rental order not found", 404);
    }

    sendSuccess(res, order);
  })
);

/**
 * @swagger
 * /api/rentals/{id}/cancel:
 *   patch:
 *     tags: [Rentals]
 *     summary: Cancel a rental order (PLACED or CONFIRMED only)
 */
router.patch(
  "/:id/cancel",
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const orderId = getParam(req.params.id);
    const order = await prisma.rentalOrder.findFirst({
      where: { id: orderId, customerId: req.user!.userId },
      include: { items: true },
    });

    if (!order) {
      throw new AppError("Order not found", 404);
    }

    if (!["PLACED", "CONFIRMED"].includes(order.status)) {
      throw new AppError("Order cannot be cancelled at this stage", 400);
    }

    const updated = await prisma.$transaction(async (tx) => {
      for (const item of order.items) {
        await tx.gearItem.update({
          where: { id: item.gearItemId },
          data: { stock: { increment: item.quantity } },
        });
      }
      return tx.rentalOrder.update({
        where: { id: order.id },
        data: { status: "CANCELLED" },
      });
    });

    sendSuccess(res, updated, "Order cancelled");
  })
);

export default router;
