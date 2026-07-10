import { Router, Response } from "express";
import { prisma } from "../../config/database";
import { AppError, sendSuccess } from "../../utils/apiResponse";
import { slugify, AuthRequest, getParam, paginatedResponse } from "../../utils/helpers";
import { authenticate, authorize, asyncHandler } from "../../middleware/auth";
import { categorySchema, paginationQuerySchema } from "../../middleware/validate";

const router = Router();

/**
 * @swagger
 * /api/categories:
 *   get:
 *     tags: [Categories]
 *     summary: List all gear categories (paginated)
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
  "/",
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const query = paginationQuerySchema.parse(req.query);
    const skip = (query.page - 1) * query.limit;

    const [items, total] = await Promise.all([
      prisma.category.findMany({
        orderBy: { name: "asc" },
        include: { _count: { select: { gearItems: true } } },
        skip,
        take: query.limit,
      }),
      prisma.category.count(),
    ]);

    sendSuccess(res, paginatedResponse(items, total, query.page, query.limit));
  })
);

/**
 * @swagger
 * /api/categories:
 *   post:
 *     tags: [Categories]
 *     summary: Create a gear category (admin only)
 */
router.post(
  "/",
  authenticate,
  authorize("ADMIN"),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = categorySchema.parse(req.body);
    const slug = slugify(data.name);

    const category = await prisma.category.create({
      data: {
        name: data.name,
        slug,
        description: data.description,
      },
    });
    sendSuccess(res, category, "Category created", 201);
  })
);

/**
 * @swagger
 * /api/categories/{id}:
 *   patch:
 *     tags: [Categories]
 *     summary: Update a gear category (admin only)
 */
router.patch(
  "/:id",
  authenticate,
  authorize("ADMIN"),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = categorySchema.partial().parse(req.body);
    const updateData: Record<string, unknown> = { ...data };
    if (data.name) {
      updateData.slug = slugify(data.name);
    }

    const category = await prisma.category.update({
      where: { id: getParam(req.params.id) },
      data: updateData,
    });
    sendSuccess(res, category, "Category updated");
  })
);

/**
 * @swagger
 * /api/categories/{id}:
 *   delete:
 *     tags: [Categories]
 *     summary: Delete an empty gear category (admin only)
 */
router.delete(
  "/:id",
  authenticate,
  authorize("ADMIN"),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const count = await prisma.gearItem.count({
      where: { categoryId: getParam(req.params.id) },
    });
    if (count > 0) {
      throw new AppError("Cannot delete category with gear items", 400);
    }
    await prisma.category.delete({ where: { id: getParam(req.params.id) } });
    sendSuccess(res, null, "Category deleted");
  })
);

export default router;
