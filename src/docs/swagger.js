const swaggerJsdoc = require("swagger-jsdoc");
const env = require("../config/env");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Recruitment & Investment Platform API",
      version: "2.0.0",
      description:
        "Job recruitment (postings, applications, CVs) combined with an investor/startup investment platform, real-time notifications, and messaging.",
    },
    servers: [{ url: env.baseUrl, description: "Current environment" }],
    components: {
      securitySchemes: {
        BearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      },
      schemas: {
        User: {
          type: "object",
          properties: {
            _id: { type: "string" },
            firstName: { type: "string" },
            lastName: { type: "string" },
            email: { type: "string" },
            role: { type: "string", enum: ["candidate", "recruiter", "investor", "startup", "admin"] },
            phone: { type: "string" },
            cvUrl: { type: "string", nullable: true },
          },
        },
        RegisterInput: {
          type: "object",
          required: ["firstName", "lastName", "email", "password"],
          properties: {
            firstName: { type: "string" },
            lastName: { type: "string" },
            email: { type: "string", format: "email" },
            password: { type: "string", minLength: 6 },
            role: { type: "string", enum: ["candidate", "recruiter", "investor", "startup"] },
          },
        },
        LoginInput: {
          type: "object",
          required: ["email", "password"],
          properties: { email: { type: "string", format: "email" }, password: { type: "string" } },
        },
        AuthResponse: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            data: {
              type: "object",
              properties: {
                user: { $ref: "#/components/schemas/User" },
                accessToken: { type: "string" },
                refreshToken: { type: "string" },
              },
            },
          },
        },
        UpdateProfileInput: {
          type: "object",
          properties: {
            firstName: { type: "string" },
            lastName: { type: "string" },
            phone: { type: "string" },
            nationality: { type: "string" },
            birthdate: { type: "string", format: "date" },
            location: { type: "object", properties: { country: { type: "string" }, city: { type: "string" } } },
          },
        },
        JobInput: {
          type: "object",
          required: [
            "title",
            "role",
            "description",
            "responsibilities",
            "minSalary",
            "maxSalary",
            "salaryType",
            "expirationDate",
          ],
          properties: {
            title: { type: "string" },
            role: { type: "string" },
            description: { type: "string" },
            responsibilities: { type: "string" },
            minSalary: { type: "number" },
            maxSalary: { type: "number" },
            salaryType: { type: "string", enum: ["hourly", "monthly", "yearly"] },
            tags: { type: "array", items: { type: "string" } },
            vacancies: { type: "integer" },
            location: { type: "string" },
            expirationDate: { type: "string", format: "date-time" },
          },
        },
        StartupInput: {
          type: "object",
          required: ["name", "description", "totalRaising", "minInvestment"],
          properties: {
            name: { type: "string" },
            description: { type: "string" },
            pitchTitle: { type: "string" },
            website: { type: "string" },
            location: { type: "string" },
            industries: { type: "array", items: { type: "string" } },
            stage: { type: "string", enum: ["idea", "pre-seed", "seed", "series-a", "series-b", "growth"] },
            totalRaising: { type: "number" },
            minInvestment: { type: "number" },
          },
        },
        InvestorInput: {
          type: "object",
          properties: {
            investorType: { type: "string" },
            aboutMe: { type: "string" },
            linkedIn: { type: "string" },
            areasOfExpertise: { type: "array", items: { type: "string" } },
            criteria: {
              type: "object",
              properties: {
                minInvestment: { type: "number" },
                maxInvestment: { type: "number" },
                industries: { type: "array", items: { type: "string" } },
                stages: { type: "array", items: { type: "string" } },
                locations: { type: "array", items: { type: "string" } },
              },
            },
          },
        },
        SuccessAssessmentInput: {
          type: "object",
          required: ["isSoftwareBased", "hasAdCampaigns", "hasConsulting", "totalFunding"],
          properties: {
            isSoftwareBased: { type: "boolean" },
            hasAdCampaigns: { type: "boolean" },
            hasConsulting: { type: "boolean" },
            totalFunding: { type: "number" },
          },
        },
        ExperienceInput: {
          type: "object",
          required: ["jobTitle", "companyName", "startDate"],
          properties: {
            jobTitle: { type: "string" },
            companyName: { type: "string" },
            jobCategory: { type: "string" },
            startDate: { type: "string", format: "date" },
            endDate: { type: "string", format: "date" },
            currentlyWorking: { type: "boolean" },
          },
        },
        Error: {
          type: "object",
          properties: {
            success: { type: "boolean", example: false },
            error: {
              type: "object",
              properties: { code: { type: "string" }, message: { type: "string" } },
            },
          },
        },
      },
      responses: {
        ValidationError: {
          description: "Validation failed",
          content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
        },
        Unauthorized: {
          description: "Missing or invalid authentication token",
          content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
        },
        Forbidden: {
          description: "Authenticated but not permitted",
          content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
        },
        NotFound: {
          description: "Resource not found",
          content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
        },
      },
    },
    security: [{ BearerAuth: [] }],
  },
  apis: ["./src/modules/**/*.routes.js", "./src/modules/health/*.js"],
};

module.exports = swaggerJsdoc(options);
