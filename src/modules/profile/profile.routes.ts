import { Router, Response } from "express";
import { prisma } from "../../config/database";
import { AppError, sendSuccess } from "../../utils/apiResponse";
import { excludePassword } from "../../utils/helpers";
import { authenticate, asyncHandler } from "../../middleware/auth";
import { updateProfileSchema } from "../../middleware/validate";
import { AuthRequest } from "../../utils/helpers";

const router = Router();

/**
 * @swagger
 * /api/profile:
 *   get:
 *     tags: [Profile]
 *     summary: Get current user profile
 */
router.get(
  "/",
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
    });
    if (!user) throw new AppError("User not found", 404);
    sendSuccess(res, excludePassword(user));
  })
);

/**
 * @swagger
 * /api/profile:
 *   patch:
 *     tags: [Profile]
 *     summary: Update current user profile
 */
router.patch(
  "/",
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = updateProfileSchema.parse(req.body);
    const user = await prisma.user.update({
      where: { id: req.user!.userId },
      data,
    });
    sendSuccess(res, excludePassword(user), "Profile updated");
  })
);

export default router;
