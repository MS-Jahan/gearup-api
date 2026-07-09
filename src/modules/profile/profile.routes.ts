import { Router, Response } from "express";
import { prisma } from "../../config/database";
import { AppError, sendSuccess } from "../../utils/apiResponse";
import { excludePassword } from "../../utils/helpers";
import { authenticate, asyncHandler } from "../../middleware/auth";
import { updateProfileSchema } from "../../middleware/validate";
import { AuthRequest } from "../../utils/helpers";

const router = Router();

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
