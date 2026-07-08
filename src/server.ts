import app from "./app";
import { config } from "./config";

if (!process.env.VERCEL) {
  import("./config/database").then(async ({ prisma }) => {
    try {
      await prisma.$connect();
      app.listen(config.port, () => {
        console.log(`GearUp API running on port ${config.port}`);
        console.log(`Docs: http://localhost:${config.port}/api/docs`);
      });
    } catch (err) {
      console.error("Failed to start server:", err);
      process.exit(1);
    }
  });
}

export default app;
