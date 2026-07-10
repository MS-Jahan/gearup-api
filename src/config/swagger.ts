import { Request } from "express";
import baseSpec from "./swagger.json";
import { config } from "./index";

const getServerUrl = (req?: Request): string => {
  if (req) {
    const proto = req.headers["x-forwarded-proto"] || "https";
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    if (host) return `${proto}://${host}`;
  }

  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  return `http://localhost:${config.port}`;
};

export const getSwaggerSpec = (req?: Request) => ({
  ...baseSpec,
  info: {
    ...baseSpec.info,
    description:
      "Sports and outdoor gear rental service backend API.\n\n" +
      "**Authorize (Bearer JWT):**\n" +
      "1. Call `POST /api/auth/login` (e.g. admin@gearup.com / Admin@12345).\n" +
      "2. Copy `data.token` from the response.\n" +
      "3. Click **Authorize** (top right) and paste the token only (no `Bearer ` prefix).",
  },
  servers: [{ url: getServerUrl(req), description: "API server" }],
});
