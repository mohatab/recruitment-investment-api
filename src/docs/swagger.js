const swaggerJsdoc = require("swagger-jsdoc");
const env = require("../config/env");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Recruitment & Investment Platform API",
      version: "2.0.0",
      description:
        "Authorization: 401 means no valid session; 403 means authenticated but not allowed (wrong role, not the resource owner, or unverified email). Roles are read from the stored user, never from the token or request. Protected operations list their roles in x-required-roles. Every response carries an X-Request-Id header. Malformed JSON bodies return 400 INVALID_JSON, oversized bodies 413 PAYLOAD_TOO_LARGE, and rate-limited requests 429 TOO_MANY_REQUESTS, all using the Error schema. Job recruitment (postings, applications, CVs) combined with an investor/startup investment platform, real-time notifications, and messaging.",
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
            isActive: { type: "boolean" },
            emailVerified: { type: "boolean" },
            emailVerifiedAt: { type: "string", format: "date-time", nullable: true },
          },
        },
        RegisterInput: {
          type: "object",
          required: ["firstName", "lastName", "email", "password"],
          properties: {
            firstName: { type: "string" },
            lastName: { type: "string" },
            email: { type: "string", format: "email" },
            password: {
              type: "string",
              minLength: 8,
              description: "At least 8 characters and at most 72 bytes (bcrypt's input limit)",
            },
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
        TokenPairResponse: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            data: {
              type: "object",
              properties: {
                accessToken: { type: "string", description: "JWT, 15 min by default" },
                refreshToken: { type: "string", description: "Opaque, single use, 7 days by default" },
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
              properties: {
                code: {
                  type: "string",
                  description:
                    "Machine-readable code, e.g. VALIDATION_ERROR, INVALID_JSON, INVALID_ID, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, CONFLICT, DUPLICATE_KEY, UPLOAD_ERROR, PAYLOAD_TOO_LARGE, TOO_MANY_REQUESTS, INTERNAL_ERROR",
                },
                message: { type: "string" },
                details: { type: "array", items: { type: "string" } },
              },
            },
            requestId: { type: "string", description: "Same value as the X-Request-Id response header" },
          },
        },
      },
      responses: {
        ValidationError: {
          description: "Validation failed",
          content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
        },
        Unauthorized: {
          description:
            "UNAUTHORIZED — no session: missing, malformed, expired or revoked access token, or a deactivated account",
          content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
        },
        Forbidden: {
          description:
            "Authenticated but not allowed: FORBIDDEN (role not in x-required-roles, or not the owner of the resource) or EMAIL_NOT_VERIFIED",
          content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
        },
        NotFound: {
          description: "Resource not found",
          content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
        },
        PayloadTooLarge: {
          description: "Request body over the limit (1mb JSON) — PAYLOAD_TOO_LARGE",
          content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
        },
        TooManyRequests: {
          description: "Rate limit exceeded — TOO_MANY_REQUESTS",
          content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
        },
      },
    },
    // No global default: every operation declares `security` explicitly
    // (enforced by test/unit/swagger-contract.test.js).
  },
  apis: ["./src/modules/**/*.routes.js", "./src/modules/health/*.js"],
};

module.exports = swaggerJsdoc(options);
