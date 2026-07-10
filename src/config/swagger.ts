import baseSpec from "./swagger.json";
import { config } from "./index";

const getServerUrl = (): string => {
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return `http://localhost:${config.port}`;
};

export const getSwaggerSpec = () => ({
  ...baseSpec,
  servers: [{ url: getServerUrl(), description: "API server" }],
});
