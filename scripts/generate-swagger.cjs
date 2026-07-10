const swaggerJsdoc = require("swagger-jsdoc");
const { writeFileSync } = require("fs");
const { join } = require("path");

const root = join(__dirname, "..");
process.chdir(root);

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "GearUp API",
      version: "1.0.0",
      description: "Sports and outdoor gear rental service backend API",
    },
    servers: [{ url: "/", description: "Current host" }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: ["./src/modules/**/*.ts"],
};

const spec = swaggerJsdoc(options);
const outPath = join(root, "src/config/swagger.json");

writeFileSync(outPath, JSON.stringify(spec, null, 2));
console.log(`wrote ${outPath} (${Object.keys(spec.paths || {}).length} paths)`);
