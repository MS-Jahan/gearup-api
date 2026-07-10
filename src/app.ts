import express from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import { getSwaggerSpec } from "./config/swagger";
import { errorHandler, notFoundHandler } from "./utils/apiResponse";

import authRoutes from "./modules/auth/auth.routes";
import categoryRoutes from "./modules/categories/category.routes";
import gearRoutes from "./modules/gear/gear.routes";
import rentalRoutes from "./modules/rentals/rental.routes";
import paymentRoutes from "./modules/payments/payment.routes";
import providerRoutes from "./modules/provider/provider.routes";
import reviewRoutes from "./modules/reviews/review.routes";
import adminRoutes from "./modules/admin/admin.routes";
import profileRoutes from "./modules/profile/profile.routes";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ success: true, message: "GearUp API is running" });
});

const swaggerSetup = swaggerUi.setup(getSwaggerSpec());

app.use("/api/docs", swaggerUi.serve, swaggerSetup);
app.get("/api/docs.json", (_req, res) => {
  res.json(getSwaggerSpec());
});

app.use("/api/auth", authRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/gear", gearRoutes);
app.use("/api/rentals", rentalRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/provider", providerRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/profile", profileRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
