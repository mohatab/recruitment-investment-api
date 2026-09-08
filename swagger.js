const swaggerJsdoc = require("swagger-jsdoc");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Unified Project API Documentation",
      version: "1.0.0",
      description: "API documentation for all endpoints in the unified project",
    },
    servers: [
      {
        url: "http://localhost:3000",
        description: "Development server",
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
  },
  apis: [
    "./mahmoud/routes/*.js",
    "./matrix/routes/*.js",
    "./mohamed/routes/*.js",
  ],
};

const specs = swaggerJsdoc(options);
module.exports = specs;
