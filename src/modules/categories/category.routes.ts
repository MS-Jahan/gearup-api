import { Router, Response } from "express";
import { prisma } from "../../config/database";
import { AppError, sendSuccess } from "../../utils/apiResponse";
import { slugify, AuthRequest, getParam } from "../../utils/helpers";
import { authenticate, authorize, asyncHandler } from "../../middleware/auth";
import { categorySchema } from "../../middleware/validate";

const router = Router();

/**
 * @swagger
 * /api/categories:
 *   get:
 *     tags: [Categories]
 *     summary: List all gear categories
 */
router.get(
  "/",
  asyncHandler(async (_req: AuthRequest, res: Response) => {
    const categories = await prisma.category.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { gearItems: true } } },
    });
    sendSuccess(res, categories);
  })
);

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
