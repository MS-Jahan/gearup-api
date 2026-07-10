import { Router, Response } from "express";
import { prisma } from "../../config/database";
import { AppError, sendSuccess } from "../../utils/apiResponse";
import { authenticate, authorize, asyncHandler } from "../../middleware/auth";
import { gearSchema, updateOrderStatusSchema } from "../../middleware/validate";
import { AuthRequest, getParam } from "../../utils/helpers";

const router = Router();

router.use(authenticate, authorize("PROVIDER"));

/**
 * @swagger
 * /api/provider/gear:
 *   post:
 *     tags: [Provider]
 *     summary: Add gear to inventory
 */
router.post(
  "/gear",
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = gearSchema.parse(req.body);

    const category = await prisma.category.findUnique({
      where: { id: data.categoryId },
    });
    if (!category) {
      throw new AppError("Category not found", 404);
    }

    const gear = await prisma.gearItem.create({
      data: {
        providerId: req.user!.userId,
        categoryId: data.categoryId,
        name: data.name,
        brand: data.brand,
        description: data.description,
        pricePerDay: data.pricePerDay,
        stock: data.stock,
        specifications: (data.specifications ?? undefined) as object | undefined,
        images: data.images ?? [],
        status: data.status ?? "AVAILABLE",
      },
      include: { category: true },
    });

    sendSuccess(res, gear, "Gear added", 201);
  })
);

/**
 * @swagger
 * /api/provider/gear/{id}:
 *   put:
 *     tags: [Provider]
 *     summary: Update a gear listing
 */
router.put(
  "/gear/:id",
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = gearSchema.partial().parse(req.body);

    const gearId = getParam(req.params.id);

    const existing = await prisma.gearItem.findFirst({
      where: { id: gearId, providerId: req.user!.userId },
    });
    if (!existing) {
      throw new AppError("Gear not found or not yours", 404);
    }

    if (data.categoryId) {
      const category = await prisma.category.findUnique({
        where: { id: data.categoryId },
      });
      if (!category) throw new AppError("Category not found", 404);
    }

    const { specifications, ...rest } = data;
    const gear = await prisma.gearItem.update({
      where: { id: gearId },
      data: {
        ...rest,
        ...(specifications !== undefined
          ? { specifications: specifications as object }
          : {}),
      },
      include: { category: true },
    });

    sendSuccess(res, gear, "Gear updated");
  })
);

/**
 * @swagger
 * /api/provider/gear/{id}:
 *   delete:
 *     tags: [Provider]
 *     summary: Remove gear from inventory
 */
router.delete(
  "/gear/:id",
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const gearId = getParam(req.params.id);
    const existing = await prisma.gearItem.findFirst({
      where: { id: gearId, providerId: req.user!.userId },
    });
    if (!existing) {
      throw new AppError("Gear not found or not yours", 404);
    }

    await prisma.gearItem.delete({ where: { id: gearId } });
    sendSuccess(res, null, "Gear removed");
  })
);

/**
 * @swagger
 * /api/provider/orders:
 *   get:
 *     tags: [Provider]
 *     summary: View incoming rental orders
 */
router.get(
  "/orders",
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const orders = await prisma.rentalOrder.findMany({
      where: { providerId: req.user!.userId },
      include: {
        customer: { select: { id: true, name: true, email: true } },
        items: { include: { gearItem: true } },
        payment: true,
      },
      orderBy: { createdAt: "desc" },
    });
    sendSuccess(res, orders);
  })
);

/**
 * @swagger
 * /api/provider/orders/{id}:
 *   patch:
 *     tags: [Provider]
 *     summary: Update rental order status
 */
router.patch(
  "/orders/:id",
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { status } = updateOrderStatusSchema.parse(req.body);

    const orderId = getParam(req.params.id);
    const order = await prisma.rentalOrder.findFirst({
      where: { id: orderId, providerId: req.user!.userId },
    });
    if (!order) {
      throw new AppError("Order not found", 404);
    }

    const allowed: Record<string, string[]> = {
      PLACED: ["CONFIRMED", "CANCELLED"],
      CONFIRMED: ["PICKED_UP", "CANCELLED"],
      PAID: ["PICKED_UP"],
      PICKED_UP: ["RETURNED"],
    };

    const next = allowed[order.status];
    if (!next?.includes(status)) {
      throw new AppError(
        `Cannot change status from ${order.status} to ${status}`,
        400
      );
    }

    const updated = await prisma.rentalOrder.update({
      where: { id: order.id },
      data: { status },
      include: {
        items: { include: { gearItem: true } },
        payment: true,
      },
    });

    // restore stock when returned
    if (status === "RETURNED") {
      for (const item of updated.items) {
        await prisma.gearItem.update({
          where: { id: item.gearItemId },
          data: { stock: { increment: item.quantity } },
        });
      }
    }

    sendSuccess(res, updated, "Order status updated");
  })
);

export default router;
