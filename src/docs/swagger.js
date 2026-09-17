const swaggerJsdoc = require("swagger-jsdoc");
const env = require("../config/env");
const ROLES = require("../common/constants/roles");
const CODES = require("../common/errors/errorCodes");
const { STATUSES } = require("../modules/recruitment/applications/application.model");
const { STAGES } = require("../modules/investment/startups/startup.model");
const { DEFAULT_LIMIT, MAX_LIMIT } = require("../common/utils/pagination");

const id = (description) => ({ type: "string", description, example: "507f1f77bcf86cd799439011" });
const timestamps = {
  createdAt: { type: "string", format: "date-time" },
  updatedAt: { type: "string", format: "date-time" },
};

// ---------------------------------------------------------------------------
// Entities — what the API actually returns (see the Mongoose models).
// ---------------------------------------------------------------------------
const entities = {
  User: {
    type: "object",
    description: "The authenticated user's own account. `password` and `tokenVersion` are never serialized.",
    properties: {
      _id: id(),
      firstName: { type: "string" },
      lastName: { type: "string" },
      email: { type: "string", format: "email" },
      role: { type: "string", enum: Object.values(ROLES) },
      phone: { type: "string" },
      nationality: { type: "string" },
      birthdate: { type: "string", format: "date-time", nullable: true },
      location: { type: "object", properties: { country: { type: "string" }, city: { type: "string" } } },
      cvUrl: { type: "string", nullable: true },
      isActive: { type: "boolean" },
      emailVerified: { type: "boolean" },
      emailVerifiedAt: { type: "string", format: "date-time", nullable: true },
      ...timestamps,
    },
  },
  PublicUserProfile: {
    type: "object",
    description: "What one user may see of another: no email, phone, birthdate or location.",
    properties: {
      _id: id(),
      firstName: { type: "string" },
      lastName: { type: "string" },
      role: { type: "string", enum: Object.values(ROLES) },
      createdAt: timestamps.createdAt,
    },
  },
  Job: {
    type: "object",
    properties: {
      _id: id(),
      recruiter: id("The owning recruiter's user id"),
      title: { type: "string" },
      role: { type: "string", description: "Job category, unrelated to the user role enum" },
      description: { type: "string" },
      responsibilities: { type: "string" },
      minSalary: { type: "number" },
      maxSalary: { type: "number" },
      salaryType: { type: "string", enum: ["hourly", "monthly", "yearly"] },
      applyMethod: { type: "string", enum: ["platform", "external"] },
      applyLink: { type: "string" },
      applyEmail: { type: "string" },
      tags: { type: "array", items: { type: "string" } },
      vacancies: { type: "integer" },
      location: { type: "string" },
      expirationDate: { type: "string", format: "date-time" },
      status: { type: "string", enum: ["open", "closed"] },
      ...timestamps,
    },
  },
  Application: {
    type: "object",
    properties: {
      _id: id(),
      job: {
        oneOf: [id("Job id"), { $ref: "#/components/schemas/Job" }],
        description: "Populated when listing your own applications",
      },
      applicant: {
        oneOf: [id("Applicant user id"), { $ref: "#/components/schemas/PublicUserProfile" }],
        description: "Populated (with email) when the owning recruiter lists a job's applications",
      },
      coverLetter: { type: "string" },
      resumeUrl: { type: "string" },
      status: { type: "string", enum: STATUSES },
      ...timestamps,
    },
  },
  Startup: {
    type: "object",
    properties: {
      _id: id(),
      owner: id("Owning user id"),
      name: { type: "string" },
      pitchTitle: { type: "string" },
      description: { type: "string" },
      website: { type: "string" },
      location: { type: "string" },
      industries: { type: "array", items: { type: "string" } },
      stage: { type: "string", enum: STAGES },
      idealInvestorRole: { type: "string" },
      previousRaised: { type: "number" },
      totalRaising: { type: "number" },
      raisedSoFar: { type: "number", description: "Server-maintained; only a succeeded payment webhook changes it" },
      minInvestment: { type: "number" },
      ...timestamps,
    },
  },
  Investor: {
    type: "object",
    description: "The investor's own profile, including their private deal criteria.",
    properties: {
      _id: id(),
      owner: id("Owning user id"),
      investorType: { type: "string" },
      aboutMe: { type: "string" },
      linkedIn: { type: "string" },
      twitter: { type: "string" },
      facebook: { type: "string" },
      website: { type: "string" },
      areasOfExpertise: { type: "array", items: { type: "string" } },
      numberOfInvestments: { type: "number" },
      companies: { type: "array", items: { type: "string" } },
      criteria: {
        type: "object",
        properties: {
          minInvestment: { type: "number" },
          maxInvestment: { type: "number" },
          industries: { type: "array", items: { type: "string" } },
          stages: { type: "array", items: { type: "string", enum: STAGES } },
          locations: { type: "array", items: { type: "string" } },
        },
      },
      ...timestamps,
    },
  },
  PublicInvestorProfile: {
    type: "object",
    description: "Another user's view of an investor: `criteria` is private to the owner.",
    properties: {
      _id: id(),
      owner: id(),
      investorType: { type: "string" },
      aboutMe: { type: "string" },
      linkedIn: { type: "string" },
      twitter: { type: "string" },
      facebook: { type: "string" },
      website: { type: "string" },
      areasOfExpertise: { type: "array", items: { type: "string" } },
      numberOfInvestments: { type: "number" },
      companies: { type: "array", items: { type: "string" } },
      ...timestamps,
    },
  },
  Investment: {
    type: "object",
    properties: {
      _id: id(),
      investor: { oneOf: [id("Investor user id"), { $ref: "#/components/schemas/PublicUserProfile" }] },
      startup: { oneOf: [id("Startup id"), { $ref: "#/components/schemas/Startup" }] },
      amount: { type: "number" },
      currency: { type: "string", example: "usd" },
      status: {
        type: "string",
        enum: ["pending", "paid", "failed", "refunded"],
        description: "Only a signature-verified Stripe webhook moves this past `pending`",
      },
      stripePaymentIntentId: { type: "string" },
      ...timestamps,
    },
  },
  InvestmentCreated: {
    type: "object",
    properties: {
      investment: { $ref: "#/components/schemas/Investment" },
      clientSecret: { type: "string", description: "Confirm this PaymentIntent client-side with Stripe.js" },
    },
  },
  Notification: {
    type: "object",
    properties: {
      _id: id(),
      message: { type: "string" },
      user: { ...id("Recipient; null for a role broadcast"), nullable: true },
      targetRole: { type: "string", enum: Object.values(ROLES), nullable: true },
      read: {
        type: "boolean",
        description: "For role broadcasts this is per-user; other recipients' state is not exposed",
      },
      ...timestamps,
    },
  },
  Message: {
    type: "object",
    properties: {
      _id: id(),
      sender: id(),
      receiver: id(),
      roomId: { type: "string", description: "Derived from both user ids; never accepted from a client" },
      body: { type: "string" },
      delivered: { type: "boolean" },
      ...timestamps,
    },
  },
  Conversation: {
    type: "object",
    properties: {
      userId: id("The other participant"),
      name: { type: "string" },
      lastMessage: { type: "string" },
      timestamp: { type: "string", format: "date-time" },
      isOnline: { type: "boolean" },
    },
  },
  Experience: {
    type: "object",
    properties: {
      _id: id(),
      user: id(),
      jobTitle: { type: "string" },
      companyName: { type: "string" },
      jobCategory: { type: "string" },
      experienceType: { type: "string" },
      startDate: { type: "string", format: "date-time" },
      endDate: { type: "string", format: "date-time", nullable: true },
      currentlyWorking: { type: "boolean" },
      ...timestamps,
    },
  },
  Contact: {
    type: "object",
    properties: {
      _id: id(),
      firstName: { type: "string" },
      lastName: { type: "string" },
      email: { type: "string", format: "email" },
      phoneNumber: { type: "string" },
      country: { type: "string" },
      city: { type: "string" },
      profileImageUrl: { type: "string", nullable: true },
      ...timestamps,
    },
  },
  SuccessAssessment: {
    type: "object",
    properties: {
      prediction: { type: "string", enum: ["likely_to_succeed", "unlikely_to_succeed"] },
      method: { type: "string", example: "rule_based_heuristic" },
      factorsConsidered: { type: "object" },
    },
  },
  TokenPair: {
    type: "object",
    properties: {
      accessToken: { type: "string", description: "JWT, 15 min by default" },
      refreshToken: { type: "string", description: "Opaque, single use, 7 days by default" },
    },
  },
  AuthSession: {
    type: "object",
    properties: {
      user: { $ref: "#/components/schemas/User" },
      accessToken: { type: "string" },
      refreshToken: { type: "string" },
    },
  },
  Health: {
    type: "object",
    properties: { status: { type: "string", example: "ok" }, uptimeSeconds: { type: "integer" } },
  },
  Readiness: {
    type: "object",
    properties: {
      status: { type: "string", enum: ["ready", "not_ready", "shutting_down"] },
      checks: { type: "object", properties: { mongodb: { type: "string", enum: ["up", "down"] } } },
    },
  },
};

// ---------------------------------------------------------------------------
// Envelopes — every JSON body is { success, data, message }, plus `pagination`
// for lists. Generated so a schema and its response can't drift apart.
// ---------------------------------------------------------------------------
const Pagination = {
  type: "object",
  properties: {
    page: { type: "integer", example: 1 },
    limit: { type: "integer", example: DEFAULT_LIMIT },
    total: { type: "integer", example: 42 },
    totalPages: { type: "integer", example: 3 },
  },
};

const envelope = (data) => ({
  type: "object",
  required: ["success", "data", "message"],
  properties: { success: { type: "boolean", example: true }, data, message: { type: "string" } },
});

const listEnvelope = (ref) => ({
  type: "object",
  required: ["success", "data", "pagination", "message"],
  properties: {
    success: { type: "boolean", example: true },
    data: { type: "array", items: { $ref: ref } },
    pagination: { $ref: "#/components/schemas/Pagination" },
    message: { type: "string" },
  },
});

const jsonResponse = (schema, description) => ({ description, content: { "application/json": { schema } } });

// Which entities are returned singly, and which as paginated lists. Only what
// the API actually serves, so the spec has no unused schemas.
const SINGLE = Object.keys(entities).filter((name) => name !== "Conversation");
const LISTED = [
  "User",
  "Job",
  "Application",
  "Startup",
  "Investment",
  "Notification",
  "Message",
  "Conversation",
  "Experience",
];

const schemas = { ...entities, Pagination };
const generatedResponses = {};
for (const name of SINGLE) {
  schemas[`${name}Envelope`] = envelope({ $ref: `#/components/schemas/${name}` });
  generatedResponses[`${name}Response`] = jsonResponse({ $ref: `#/components/schemas/${name}Envelope` }, "OK");
}
for (const name of LISTED) {
  schemas[`${name}ListEnvelope`] = listEnvelope(`#/components/schemas/${name}`);
  generatedResponses[`${name}ListResponse`] = jsonResponse(
    { $ref: `#/components/schemas/${name}ListEnvelope` },
    "OK — paginated list"
  );
}

schemas.Empty = envelope({ type: "object", nullable: true, example: null });
// Stripe's webhook acknowledgement: Stripe defines this shape, not our envelope.
schemas.StripeWebhookAck = { type: "object", properties: { received: { type: "boolean", example: true } } };
schemas.Error = {
  type: "object",
  required: ["success", "error", "requestId"],
  properties: {
    success: { type: "boolean", example: false },
    error: {
      type: "object",
      required: ["code", "message"],
      properties: {
        code: { type: "string", enum: Object.values(CODES), description: "Stable, machine-readable error code" },
        message: { type: "string", description: "Safe to show a user; never contains internal detail" },
        details: {
          type: "array",
          description: "Field-level problems, on validation errors only",
          items: {
            type: "object",
            properties: { field: { type: "string" }, message: { type: "string" } },
          },
        },
      },
    },
    requestId: { type: "string", description: "Same value as the X-Request-Id response header" },
  },
};

const error = (description) => jsonResponse({ $ref: "#/components/schemas/Error" }, description);

const options = {
  definition: {
    openapi: "3.0.3",
    info: {
      title: "Recruitment & Investment Platform API",
      version: "1.0.0",
      description: [
        "Job recruitment (postings, applications, CVs) combined with an investor/startup investment platform, real-time notifications and messaging.",
        "",
        "**Versioning** — every endpoint lives under `/api/v1`. The health probes (`/health`, `/health/ready`) sit outside the version prefix: they are infrastructure endpoints, not part of the product API.",
        "",
        `**Responses** — JSON bodies are \`{ success, data, message }\`; list endpoints add \`pagination\` ({page, limit, total, totalPages}, limit max ${MAX_LIMIT}). \`204\` responses have no body. The Stripe webhook answers in Stripe's own format, not this envelope.`,
        "",
        "**Errors** — `{ success: false, error: { code, message, details? }, requestId }`. `requestId` also travels in the `X-Request-Id` header. 400 malformed request · 401 no valid session · 403 authenticated but not allowed · 404 unknown route or resource · 409 conflict · 413 body too large · 422 a business rule refused a well-formed request · 429 rate limited · 500 unexpected.",
        "",
        "**Authorization** — roles come from the stored user, never from the token or request body. Protected operations list their roles in `x-required-roles`; `x-requires-verified-email` marks the ones that also need a verified email.",
      ].join("\n"),
    },
    servers: [{ url: env.baseUrl, description: "Current environment" }],
    components: {
      securitySchemes: { BearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } },
      schemas: {
        ...schemas,
        RegisterInput: {
          type: "object",
          required: ["firstName", "lastName", "email", "password"],
          properties: {
            firstName: { type: "string", minLength: 1, maxLength: 80 },
            lastName: { type: "string", minLength: 1, maxLength: 80 },
            email: { type: "string", format: "email", maxLength: 254 },
            password: {
              type: "string",
              minLength: 8,
              description: "At least 8 characters and at most 72 bytes (bcrypt's input limit)",
            },
            role: { type: "string", enum: ["candidate", "recruiter", "investor", "startup"], default: "candidate" },
            phone: { type: "string", maxLength: 30 },
          },
        },
        LoginInput: {
          type: "object",
          required: ["email", "password"],
          properties: { email: { type: "string", format: "email" }, password: { type: "string", maxLength: 1024 } },
        },
        UpdateProfileInput: {
          type: "object",
          minProperties: 1,
          description: "Only these fields are accepted; role, email, password and account state are not writable here.",
          properties: {
            firstName: { type: "string", minLength: 1, maxLength: 80 },
            lastName: { type: "string", minLength: 1, maxLength: 80 },
            phone: { type: "string", maxLength: 30 },
            nationality: { type: "string", maxLength: 80 },
            birthdate: { type: "string", format: "date" },
            location: {
              type: "object",
              properties: { country: { type: "string", maxLength: 80 }, city: { type: "string", maxLength: 80 } },
            },
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
            minSalary: { type: "number", minimum: 0 },
            maxSalary: { type: "number", minimum: 0, description: "Must be greater than or equal to minSalary" },
            salaryType: { type: "string", enum: ["hourly", "monthly", "yearly"] },
            applyMethod: { type: "string", enum: ["platform", "external"], default: "platform" },
            applyLink: { type: "string", format: "uri" },
            applyEmail: { type: "string", format: "email" },
            tags: { type: "array", items: { type: "string" } },
            vacancies: { type: "integer", minimum: 1, default: 1 },
            location: { type: "string" },
            expirationDate: { type: "string", format: "date-time", description: "Must be in the future" },
          },
        },
        StartupInput: {
          type: "object",
          required: ["name", "description", "totalRaising", "minInvestment"],
          description: "`owner` and `raisedSoFar` are server-controlled and ignored if sent.",
          properties: {
            name: { type: "string" },
            description: { type: "string" },
            pitchTitle: { type: "string" },
            website: { type: "string", format: "uri" },
            location: { type: "string" },
            industries: { type: "array", items: { type: "string" } },
            stage: { type: "string", enum: STAGES, default: "idea" },
            idealInvestorRole: { type: "string" },
            previousRaised: { type: "number", minimum: 0 },
            totalRaising: { type: "number", minimum: 0 },
            minInvestment: { type: "number", minimum: 0 },
          },
        },
        InvestorInput: {
          type: "object",
          description: "`owner` is server-controlled and ignored if sent.",
          properties: {
            investorType: { type: "string" },
            aboutMe: { type: "string" },
            linkedIn: { type: "string", format: "uri" },
            twitter: { type: "string", format: "uri" },
            facebook: { type: "string", format: "uri" },
            website: { type: "string", format: "uri" },
            areasOfExpertise: { type: "array", items: { type: "string" } },
            numberOfInvestments: { type: "number", minimum: 0 },
            companies: { type: "array", items: { type: "string" } },
            criteria: {
              type: "object",
              properties: {
                minInvestment: { type: "number", minimum: 0 },
                maxInvestment: { type: "number", minimum: 0 },
                industries: { type: "array", items: { type: "string" } },
                stages: { type: "array", items: { type: "string", enum: STAGES } },
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
            totalFunding: { type: "number", minimum: 0 },
          },
        },
        ExperienceInput: {
          type: "object",
          required: ["jobTitle", "companyName", "startDate"],
          properties: {
            jobTitle: { type: "string" },
            companyName: { type: "string" },
            jobCategory: { type: "string" },
            experienceType: { type: "string" },
            startDate: { type: "string", format: "date" },
            endDate: { type: "string", format: "date", description: "Required unless currentlyWorking is true" },
            currentlyWorking: { type: "boolean", default: false },
          },
        },
      },
      parameters: {
        Page: { in: "query", name: "page", schema: { type: "integer", minimum: 1, default: 1 } },
        Limit: {
          in: "query",
          name: "limit",
          schema: { type: "integer", minimum: 1, maximum: MAX_LIMIT, default: DEFAULT_LIMIT },
        },
        Sort: {
          in: "query",
          name: "sort",
          description: "Comma-separated field list from the endpoint's allowlist; `-` prefix sorts descending.",
          schema: { type: "string", example: "-createdAt" },
        },
      },
      responses: {
        ...generatedResponses,
        EmptyResponse: jsonResponse({ $ref: "#/components/schemas/Empty" }, "OK — no payload"),
        StripeWebhookAck: jsonResponse(
          { $ref: "#/components/schemas/StripeWebhookAck" },
          "Event processed. Stripe's own response shape, not the API envelope."
        ),
        NoContent: { description: "Deleted — no content" },
        ValidationError: error("VALIDATION_ERROR — the request body, query or path failed its schema"),
        Unauthorized: error(
          "UNAUTHORIZED — no session: missing, malformed, expired or revoked access token, or a deactivated account"
        ),
        Forbidden: error(
          "Authenticated but not allowed: FORBIDDEN (role not in x-required-roles, or not the owner of the resource) or EMAIL_NOT_VERIFIED"
        ),
        NotFound: error("NOT_FOUND — no such resource"),
        Conflict: error("CONFLICT / DUPLICATE_KEY — the resource already exists"),
        UnprocessableEntity: error("A business rule refused a well-formed request (see the error code)"),
        PayloadTooLarge: error("PAYLOAD_TOO_LARGE — body over 1mb, or an upload over 5MB"),
        TooManyRequests: error("TOO_MANY_REQUESTS — rate limit exceeded"),
      },
    },
    // No global default: every operation declares `security` explicitly
    // (enforced by test/unit/swagger-contract.test.js).
  },
  apis: ["./src/modules/**/*.routes.js", "./src/modules/health/*.js"],
};

module.exports = swaggerJsdoc(options);
