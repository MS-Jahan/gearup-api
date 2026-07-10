import express, { Request, Response } from "express";
import cors from "cors";
import { getSwaggerSpec } from "./config/swagger";
import { errorHandler, notFoundHandler } from "./utils/apiResponse";
import { stripeWebhookHandler } from "./modules/payments/payment.webhook";

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

app.post(
  "/api/payments/webhook",
  express.raw({ type: "application/json" }),
  stripeWebhookHandler
);

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ success: true, message: "GearUp API is running" });
});

app.get("/", (_req, res) => {
  res.json({
    success: true,
    message: "GearUp API — sports gear rental backend",
    data: {
      docs: "/api/docs",
      openApi: "/api/docs.json",
      health: "/health",
      apiPrefix: "/api",
    },
  });
});

const renderSwaggerPage = (specUrl: string) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>GearUp API Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.ui = SwaggerUIBundle({
      url: "${specUrl}",
      dom_id: "#swagger-ui",
      presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
      layout: "BaseLayout",
      persistAuthorization: true,
    });
  </script>
</body>
</html>`;

app.get(["/api/docs", "/api/docs/"], (req: Request, res: Response) => {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const specUrl = `${proto}://${host}/api/docs.json`;
  res.type("html").send(renderSwaggerPage(specUrl));
});

app.get("/api/docs.json", (req: Request, res: Response) => {
  res.json(getSwaggerSpec(req));
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
