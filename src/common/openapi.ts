import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
  extendZodWithOpenApi,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { SKILLS } from "./schemas";

extendZodWithOpenApi(z);

const registry = new OpenAPIRegistry();

// ─── Shared primitives ───────────────────────────────────────────────────────

const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1).openapi({ example: 1 }),
  limit: z.coerce.number().int().min(1).max(100).default(20).openapi({ example: 20 }),
});

const PaginationMetaSchema = z.object({
  page: z.number().openapi({ example: 1 }),
  limit: z.number().openapi({ example: 20 }),
  total: z.number().openapi({ example: 42 }),
  totalPages: z.number().openapi({ example: 3 }),
  hasNext: z.boolean().openapi({ example: true }),
  hasPrev: z.boolean().openapi({ example: false }),
});

const ObjectId = z.string().openapi({ example: "507f1f77bcf86cd799439011" });

const Timestamps = z.object({
  createdAt: z.string().openapi({ example: "2026-10-01T09:00:00.000Z" }),
  updatedAt: z.string().openapi({ example: "2026-10-01T09:00:00.000Z" }),
});

const ErrorSchema = registry.register(
  "Error",
  z.object({
    error: z.string().openapi({ example: "NotFound" }),
    message: z.string().openapi({ example: "Resource not found" }),
  })
);

const errorResponse = (description: string) => ({
  description,
  content: { "application/json": { schema: ErrorSchema } },
});

const COMMON_ERRORS = {
  400: errorResponse("Bad request / validation error"),
  404: errorResponse("Resource not found"),
  409: errorResponse("Conflict"),
};

// ─── Entity schemas ───────────────────────────────────────────────────────────

const LocationResponse = registry.register(
  "Location",
  z
    .object({
      _id: ObjectId,
      name: z.string().openapi({ example: "Main Hall" }),
      description: z.string().optional().openapi({ example: "Primary event space" }),
      building: z.string().optional().openapi({ example: "Engineering Hall" }),
      capacity: z.number().optional().openapi({ example: 200 }),
    })
    .merge(Timestamps)
);

const EventResponse = registry.register(
  "Event",
  z
    .object({
      _id: ObjectId,
      name: z.string().openapi({ example: "Fall Food Drive" }),
      description: z.string().optional(),
      startDate: z.string().openapi({ example: "2026-10-01T00:00:00.000Z" }),
      endDate: z.string().openapi({ example: "2026-10-31T23:59:59.000Z" }),
      status: z.enum(["draft", "published", "cancelled"]).openapi({ example: "published" }),
      createdBy: z.string().openapi({ example: "admin" }),
      updatedBy: z.string().optional(),
    })
    .merge(Timestamps)
);

const VolunteerResponse = registry.register(
  "Volunteer",
  z
    .object({
      _id: ObjectId,
      firstName: z.string().openapi({ example: "Jane" }),
      lastName: z.string().openapi({ example: "Doe" }),
      email: z.string().openapi({ example: "jane@example.com" }),
      phone: z.string().optional().openapi({ example: "555-1234" }),
      skills: z
        .array(z.enum(SKILLS))
        .optional()
        .openapi({ example: ["first-aid"] }),
      emergencyContact: z
        .object({
          name: z.string().openapi({ example: "John Doe" }),
          phone: z.string().openapi({ example: "555-5678" }),
          relationship: z.string().openapi({ example: "spouse" }),
        })
        .optional(),
    })
    .merge(Timestamps)
);

const ShiftResponse = registry.register(
  "Shift",
  z
    .object({
      _id: ObjectId,
      title: z.string().openapi({ example: "Registration Desk" }),
      description: z.string().optional(),
      locationId: ObjectId,
      eventId: ObjectId.optional(),
      templateId: ObjectId.optional(),
      startTime: z.string().openapi({ example: "2026-10-10T09:00:00.000Z" }),
      endTime: z.string().openapi({ example: "2026-10-10T12:00:00.000Z" }),
      maxVolunteers: z.number().openapi({ example: 5 }),
      requiredSkills: z.array(z.enum(SKILLS)).optional(),
      status: z.enum(["draft", "published", "cancelled"]).openapi({ example: "published" }),
      createdBy: z.string().openapi({ example: "admin" }),
      updatedBy: z.string().optional(),
    })
    .merge(Timestamps)
);

const ShiftWithCountsResponse = registry.register(
  "ShiftWithCounts",
  ShiftResponse.extend({
    confirmedCount: z.number().openapi({ example: 3 }),
    waitlistCount: z.number().openapi({ example: 1 }),
    spotsAvailable: z.number().openapi({ example: 2 }),
  })
);

const ShiftTemplateResponse = registry.register(
  "ShiftTemplate",
  z
    .object({
      _id: ObjectId,
      title: z.string().openapi({ example: "Weekly Desk" }),
      description: z.string().optional(),
      locationId: ObjectId,
      eventId: ObjectId.optional(),
      startDate: z.string().openapi({ example: "2026-10-06T00:00:00.000Z" }),
      startTimeOfDay: z.string().openapi({ example: "09:00" }),
      durationMinutes: z.number().openapi({ example: 180 }),
      maxVolunteers: z.number().openapi({ example: 3 }),
      requiredSkills: z.array(z.enum(SKILLS)).optional(),
      recurrenceRule: z.object({
        frequency: z.enum(["daily", "weekly", "monthly"]),
        interval: z.number().openapi({ example: 1 }),
        daysOfWeek: z
          .array(z.number())
          .optional()
          .openapi({ example: [1, 3] }),
        endDate: z.string().optional(),
        occurrences: z.number().optional().openapi({ example: 8 }),
      }),
      createdBy: z.string().openapi({ example: "admin" }),
      updatedBy: z.string().optional(),
    })
    .merge(Timestamps)
);

const SignupResponse = registry.register(
  "Signup",
  z
    .object({
      _id: ObjectId,
      volunteerId: ObjectId,
      shiftId: ObjectId,
      status: z
        .enum(["confirmed", "waitlisted", "cancelled", "no-show", "completed"])
        .openapi({ example: "confirmed" }),
      checkedInAt: z.string().optional(),
      checkedOutAt: z.string().optional(),
      cancelledAt: z.string().optional(),
      cancellationReason: z.string().optional(),
    })
    .merge(Timestamps)
);

// ─── Location routes ──────────────────────────────────────────────────────────

registry.registerPath({
  method: "get",
  path: "/locations",
  tags: ["Locations"],
  summary: "List all locations",
  request: { query: PaginationQuerySchema },
  responses: {
    200: {
      description: "List of locations",
      content: {
        "application/json": {
          schema: z.object({
            locations: z.array(LocationResponse),
            pagination: PaginationMetaSchema,
          }),
        },
      },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/locations",
  tags: ["Locations"],
  summary: "Create a location",
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            name: z.string().openapi({ example: "Main Hall" }),
            description: z.string().optional(),
            building: z.string().optional().openapi({ example: "Engineering Hall" }),
            capacity: z.number().optional().openapi({ example: 200 }),
          }),
        },
      },
    },
  },
  responses: {
    201: { description: "Created", content: { "application/json": { schema: LocationResponse } } },
    ...COMMON_ERRORS,
  },
});

registry.registerPath({
  method: "get",
  path: "/locations/{id}",
  tags: ["Locations"],
  summary: "Get a location by ID",
  request: { params: z.object({ id: ObjectId }) },
  responses: {
    200: { description: "Location", content: { "application/json": { schema: LocationResponse } } },
    404: COMMON_ERRORS[404],
  },
});

registry.registerPath({
  method: "put",
  path: "/locations/{id}",
  tags: ["Locations"],
  summary: "Update a location",
  request: {
    params: z.object({ id: ObjectId }),
    body: {
      content: {
        "application/json": {
          schema: z.object({
            name: z.string().optional(),
            description: z.string().optional(),
            building: z.string().optional(),
            capacity: z.number().optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: { description: "Updated", content: { "application/json": { schema: LocationResponse } } },
    ...COMMON_ERRORS,
  },
});

registry.registerPath({
  method: "delete",
  path: "/locations/{id}",
  tags: ["Locations"],
  summary: "Delete a location",
  request: { params: z.object({ id: ObjectId }) },
  responses: {
    204: { description: "Deleted" },
    404: COMMON_ERRORS[404],
  },
});

// ─── Event routes ─────────────────────────────────────────────────────────────

registry.registerPath({
  method: "get",
  path: "/events",
  tags: ["Events"],
  summary: "List all events",
  request: {
    query: PaginationQuerySchema.extend({
      status: z.enum(["draft", "published", "cancelled"]).optional(),
    }),
  },
  responses: {
    200: {
      description: "List of events",
      content: {
        "application/json": {
          schema: z.object({ events: z.array(EventResponse), pagination: PaginationMetaSchema }),
        },
      },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/events",
  tags: ["Events"],
  summary: "Create an event",
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            name: z.string().openapi({ example: "Fall Food Drive" }),
            description: z.string().optional(),
            startDate: z.string().openapi({ example: "2026-10-01T00:00:00Z" }),
            endDate: z.string().openapi({ example: "2026-10-31T23:59:59Z" }),
            status: z.enum(["draft", "published", "cancelled"]).optional(),
            createdBy: z.string().openapi({ example: "admin" }),
          }),
        },
      },
    },
  },
  responses: {
    201: { description: "Created", content: { "application/json": { schema: EventResponse } } },
    ...COMMON_ERRORS,
  },
});

registry.registerPath({
  method: "get",
  path: "/events/{id}",
  tags: ["Events"],
  summary: "Get an event by ID",
  request: { params: z.object({ id: ObjectId }) },
  responses: {
    200: { description: "Event", content: { "application/json": { schema: EventResponse } } },
    404: COMMON_ERRORS[404],
  },
});

registry.registerPath({
  method: "put",
  path: "/events/{id}",
  tags: ["Events"],
  summary: "Update an event",
  request: {
    params: z.object({ id: ObjectId }),
    body: {
      content: {
        "application/json": {
          schema: z.object({
            name: z.string().optional(),
            description: z.string().optional(),
            startDate: z.string().optional(),
            endDate: z.string().optional(),
            updatedBy: z.string().optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: { description: "Updated", content: { "application/json": { schema: EventResponse } } },
    ...COMMON_ERRORS,
  },
});

registry.registerPath({
  method: "put",
  path: "/events/{id}/cancel",
  tags: ["Events"],
  summary: "Cancel an event",
  request: { params: z.object({ id: ObjectId }) },
  responses: {
    200: { description: "Cancelled", content: { "application/json": { schema: EventResponse } } },
    400: COMMON_ERRORS[400],
    404: COMMON_ERRORS[404],
  },
});

registry.registerPath({
  method: "get",
  path: "/events/{id}/summary",
  tags: ["Events"],
  summary: "Get aggregate stats for an event",
  description:
    "Returns total shifts, capacity, fill rate, signup counts by status, and total volunteer hours logged.",
  request: { params: z.object({ id: ObjectId }) },
  responses: {
    200: {
      description: "Event summary",
      content: {
        "application/json": {
          schema: z.object({
            eventId: ObjectId,
            totalShifts: z.number().openapi({ example: 8 }),
            totalCapacity: z.number().openapi({ example: 40 }),
            fillRate: z.number().openapi({ example: 0.75, description: "confirmed / totalCapacity" }),
            signups: z.object({
              confirmed: z.number().openapi({ example: 30 }),
              waitlisted: z.number().openapi({ example: 5 }),
              cancelled: z.number().openapi({ example: 2 }),
              noShow: z.number().openapi({ example: 1 }),
              completed: z.number().openapi({ example: 28 }),
            }),
            totalVolunteerHours: z.number().openapi({ example: 84.5 }),
          }),
        },
      },
    },
    404: COMMON_ERRORS[404],
  },
});

registry.registerPath({
  method: "get",
  path: "/events/{id}/shifts",
  tags: ["Events"],
  summary: "List all shifts belonging to an event",
  request: {
    params: z.object({ id: ObjectId }),
    query: PaginationQuerySchema.extend({
      status: z.enum(["draft", "published", "cancelled"]).optional(),
    }),
  },
  responses: {
    200: {
      description: "Shifts for the event",
      content: {
        "application/json": {
          schema: z.object({ shifts: z.array(ShiftResponse), pagination: PaginationMetaSchema }),
        },
      },
    },
    404: COMMON_ERRORS[404],
  },
});

registry.registerPath({
  method: "delete",
  path: "/events/{id}",
  tags: ["Events"],
  summary: "Delete an event",
  request: { params: z.object({ id: ObjectId }) },
  responses: { 204: { description: "Deleted" }, 404: COMMON_ERRORS[404] },
});

// ─── Volunteer routes ─────────────────────────────────────────────────────────

registry.registerPath({
  method: "get",
  path: "/volunteers",
  tags: ["Volunteers"],
  summary: "List all volunteers",
  request: { query: PaginationQuerySchema },
  responses: {
    200: {
      description: "List of volunteers",
      content: {
        "application/json": {
          schema: z.object({
            volunteers: z.array(VolunteerResponse),
            pagination: PaginationMetaSchema,
          }),
        },
      },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/volunteers",
  tags: ["Volunteers"],
  summary: "Create a volunteer",
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            firstName: z.string().openapi({ example: "Jane" }),
            lastName: z.string().openapi({ example: "Doe" }),
            email: z.string().openapi({ example: "jane@example.com" }),
            phone: z.string().optional(),
            skills: z.array(z.enum(SKILLS)).optional(),
            emergencyContact: z
              .object({ name: z.string(), phone: z.string(), relationship: z.string() })
              .optional(),
          }),
        },
      },
    },
  },
  responses: {
    201: { description: "Created", content: { "application/json": { schema: VolunteerResponse } } },
    ...COMMON_ERRORS,
  },
});

registry.registerPath({
  method: "get",
  path: "/volunteers/{id}",
  tags: ["Volunteers"],
  summary: "Get a volunteer by ID",
  request: { params: z.object({ id: ObjectId }) },
  responses: {
    200: {
      description: "Volunteer",
      content: { "application/json": { schema: VolunteerResponse } },
    },
    404: COMMON_ERRORS[404],
  },
});

registry.registerPath({
  method: "put",
  path: "/volunteers/{id}",
  tags: ["Volunteers"],
  summary: "Update a volunteer",
  request: {
    params: z.object({ id: ObjectId }),
    body: {
      content: {
        "application/json": {
          schema: z.object({
            firstName: z.string().optional(),
            lastName: z.string().optional(),
            email: z.string().optional(),
            phone: z.string().optional(),
            skills: z.array(z.enum(SKILLS)).optional(),
            emergencyContact: z
              .object({ name: z.string(), phone: z.string(), relationship: z.string() })
              .optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: { description: "Updated", content: { "application/json": { schema: VolunteerResponse } } },
    ...COMMON_ERRORS,
  },
});

registry.registerPath({
  method: "delete",
  path: "/volunteers/{id}",
  tags: ["Volunteers"],
  summary: "Delete a volunteer",
  request: { params: z.object({ id: ObjectId }) },
  responses: { 204: { description: "Deleted" }, 404: COMMON_ERRORS[404] },
});

registry.registerPath({
  method: "get",
  path: "/volunteers/{id}/signups",
  tags: ["Volunteers"],
  summary: "Get all signups for a volunteer",
  request: { params: z.object({ id: ObjectId }) },
  responses: {
    200: {
      description: "Volunteer signups",
      content: { "application/json": { schema: z.object({ signups: z.array(SignupResponse) }) } },
    },
    404: COMMON_ERRORS[404],
  },
});

registry.registerPath({
  method: "get",
  path: "/volunteers/{id}/hours",
  tags: ["Volunteers"],
  summary: "Get total volunteered hours (from completed signups with checkin/checkout)",
  request: { params: z.object({ id: ObjectId }) },
  responses: {
    200: {
      description: "Total hours",
      content: {
        "application/json": {
          schema: z.object({
            volunteerId: ObjectId,
            totalHours: z.number().openapi({ example: 7.5 }),
          }),
        },
      },
    },
    404: COMMON_ERRORS[404],
  },
});

registry.registerPath({
  method: "get",
  path: "/volunteers/leaderboard",
  tags: ["Volunteers"],
  summary: "Top volunteers ranked by total hours completed",
  request: {
    query: z.object({
      limit: z.coerce
        .number()
        .int()
        .min(1)
        .max(100)
        .default(10)
        .optional()
        .openapi({ example: 10, description: "Max results to return (default 10, max 100)" }),
    }),
  },
  responses: {
    200: {
      description: "Leaderboard",
      content: {
        "application/json": {
          schema: z.object({
            leaderboard: z.array(
              z.object({
                volunteerId: ObjectId,
                firstName: z.string().openapi({ example: "Jane" }),
                lastName: z.string().openapi({ example: "Doe" }),
                email: z.string().openapi({ example: "jane@example.com" }),
                totalHours: z.number().openapi({ example: 12.5 }),
                shiftsCompleted: z.number().openapi({ example: 4 }),
              })
            ),
          }),
        },
      },
    },
  },
});

// ─── Shift routes ─────────────────────────────────────────────────────────────

registry.registerPath({
  method: "get",
  path: "/shifts",
  tags: ["Shifts"],
  summary: "List shifts with optional filters",
  request: {
    query: PaginationQuerySchema.extend({
      status: z.enum(["draft", "published", "cancelled"]).optional(),
      eventId: ObjectId.optional(),
      locationId: ObjectId.optional(),
      skill: z.enum(SKILLS).optional().openapi({ description: "Filter by required skill" }),
      from: z.string().optional().openapi({ example: "2026-10-01T00:00:00Z" }),
      to: z.string().optional().openapi({ example: "2026-10-31T23:59:59Z" }),
    }),
  },
  responses: {
    200: {
      description: "List of shifts",
      content: {
        "application/json": {
          schema: z.object({ shifts: z.array(ShiftResponse), pagination: PaginationMetaSchema }),
        },
      },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/shifts",
  tags: ["Shifts"],
  summary: "Create a shift",
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            title: z.string().openapi({ example: "Registration Desk" }),
            description: z.string().optional(),
            locationId: ObjectId,
            eventId: ObjectId.optional(),
            startTime: z.string().openapi({ example: "2026-10-10T09:00:00Z" }),
            endTime: z.string().openapi({ example: "2026-10-10T12:00:00Z" }),
            maxVolunteers: z.number().openapi({ example: 5 }),
            requiredSkills: z.array(z.enum(SKILLS)).optional(),
            status: z.enum(["draft", "published", "cancelled"]).optional(),
            createdBy: z.string().openapi({ example: "admin" }),
          }),
        },
      },
    },
  },
  responses: {
    201: { description: "Created", content: { "application/json": { schema: ShiftResponse } } },
    ...COMMON_ERRORS,
  },
});

registry.registerPath({
  method: "get",
  path: "/shifts/{id}",
  tags: ["Shifts"],
  summary: "Get a shift by ID (includes confirmed count, waitlist count, spots available)",
  request: { params: z.object({ id: ObjectId }) },
  responses: {
    200: {
      description: "Shift with counts",
      content: { "application/json": { schema: ShiftWithCountsResponse } },
    },
    404: COMMON_ERRORS[404],
  },
});

registry.registerPath({
  method: "put",
  path: "/shifts/{id}",
  tags: ["Shifts"],
  summary: "Update a shift",
  request: {
    params: z.object({ id: ObjectId }),
    body: {
      content: {
        "application/json": {
          schema: z.object({
            title: z.string().optional(),
            description: z.string().optional(),
            locationId: ObjectId.optional(),
            eventId: ObjectId.optional(),
            startTime: z.string().optional(),
            endTime: z.string().optional(),
            maxVolunteers: z.number().optional(),
            requiredSkills: z.array(z.enum(SKILLS)).optional(),
            updatedBy: z.string().optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: { description: "Updated", content: { "application/json": { schema: ShiftResponse } } },
    ...COMMON_ERRORS,
  },
});

registry.registerPath({
  method: "put",
  path: "/shifts/{id}/cancel",
  tags: ["Shifts"],
  summary: "Cancel a shift — cascades cancellation to all confirmed and waitlisted signups",
  request: { params: z.object({ id: ObjectId }) },
  responses: {
    200: { description: "Cancelled", content: { "application/json": { schema: ShiftResponse } } },
    400: COMMON_ERRORS[400],
    404: COMMON_ERRORS[404],
  },
});

registry.registerPath({
  method: "put",
  path: "/shifts/{id}/mark-noshows",
  tags: ["Shifts"],
  summary: "Bulk-mark no-shows — requires shift to have ended",
  description:
    "Marks all confirmed signups without a check-in as 'no-show'. The shift's endTime must be in the past.",
  request: { params: z.object({ id: ObjectId }) },
  responses: {
    200: {
      description: "No-shows marked",
      content: {
        "application/json": {
          schema: z.object({ markedCount: z.number().openapi({ example: 3 }) }),
        },
      },
    },
    400: COMMON_ERRORS[400],
    404: COMMON_ERRORS[404],
  },
});

registry.registerPath({
  method: "get",
  path: "/shifts/{id}/signups",
  tags: ["Shifts"],
  summary: "Get all signups for a shift",
  request: { params: z.object({ id: ObjectId }) },
  responses: {
    200: {
      description: "Shift signups",
      content: { "application/json": { schema: z.object({ signups: z.array(SignupResponse) }) } },
    },
    404: COMMON_ERRORS[404],
  },
});

registry.registerPath({
  method: "delete",
  path: "/shifts/{id}",
  tags: ["Shifts"],
  summary: "Delete a shift",
  request: { params: z.object({ id: ObjectId }) },
  responses: { 204: { description: "Deleted" }, 404: COMMON_ERRORS[404] },
});

// ─── Shift template routes ────────────────────────────────────────────────────

registry.registerPath({
  method: "get",
  path: "/shift-templates",
  tags: ["Shift Templates"],
  summary: "List all shift templates",
  request: { query: PaginationQuerySchema },
  responses: {
    200: {
      description: "List of templates",
      content: {
        "application/json": {
          schema: z.object({
            templates: z.array(ShiftTemplateResponse),
            pagination: PaginationMetaSchema,
          }),
        },
      },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/shift-templates",
  tags: ["Shift Templates"],
  summary: "Create a shift template and auto-generate recurring shift instances",
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            title: z.string().openapi({ example: "Weekly Desk" }),
            description: z.string().optional(),
            locationId: ObjectId,
            eventId: ObjectId.optional(),
            startDate: z.string().openapi({ example: "2026-10-06T00:00:00Z" }),
            startTimeOfDay: z.string().openapi({ example: "09:00", description: "HH:MM format" }),
            durationMinutes: z.number().openapi({ example: 180 }),
            maxVolunteers: z.number().openapi({ example: 3 }),
            requiredSkills: z.array(z.enum(SKILLS)).optional(),
            recurrenceRule: z.object({
              frequency: z.enum(["daily", "weekly", "monthly"]),
              interval: z.number().optional().openapi({ example: 1 }),
              daysOfWeek: z
                .array(z.number())
                .optional()
                .openapi({ example: [1, 3], description: "0=Sun, 6=Sat" }),
              endDate: z.string().optional(),
              occurrences: z
                .number()
                .optional()
                .openapi({ example: 8, description: "endDate or occurrences required" }),
            }),
            createdBy: z.string().openapi({ example: "admin" }),
          }),
        },
      },
    },
  },
  responses: {
    201: {
      description: "Created",
      content: { "application/json": { schema: ShiftTemplateResponse } },
    },
    ...COMMON_ERRORS,
  },
});

registry.registerPath({
  method: "get",
  path: "/shift-templates/{id}",
  tags: ["Shift Templates"],
  summary: "Get a shift template by ID",
  request: { params: z.object({ id: ObjectId }) },
  responses: {
    200: {
      description: "Template",
      content: { "application/json": { schema: ShiftTemplateResponse } },
    },
    404: COMMON_ERRORS[404],
  },
});

registry.registerPath({
  method: "put",
  path: "/shift-templates/{id}",
  tags: ["Shift Templates"],
  summary: "Update a shift template (does not regenerate shifts)",
  request: {
    params: z.object({ id: ObjectId }),
    body: {
      content: {
        "application/json": {
          schema: z.object({
            title: z.string().optional(),
            description: z.string().optional(),
            locationId: ObjectId.optional(),
            eventId: ObjectId.optional(),
            maxVolunteers: z.number().optional(),
            requiredSkills: z.array(z.enum(SKILLS)).optional(),
            updatedBy: z.string().optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Updated",
      content: { "application/json": { schema: ShiftTemplateResponse } },
    },
    ...COMMON_ERRORS,
  },
});

registry.registerPath({
  method: "delete",
  path: "/shift-templates/{id}",
  tags: ["Shift Templates"],
  summary: "Delete a template — nullifies templateId on generated shifts, does not delete them",
  request: { params: z.object({ id: ObjectId }) },
  responses: { 204: { description: "Deleted" }, 404: COMMON_ERRORS[404] },
});

// ─── Signup routes ────────────────────────────────────────────────────────────

registry.registerPath({
  method: "get",
  path: "/signups",
  tags: ["Signups"],
  summary: "List signups with optional filters",
  request: {
    query: PaginationQuerySchema.extend({
      volunteerId: ObjectId.optional(),
      shiftId: ObjectId.optional(),
      status: z.enum(["confirmed", "waitlisted", "cancelled", "no-show", "completed"]).optional(),
    }),
  },
  responses: {
    200: {
      description: "List of signups",
      content: {
        "application/json": {
          schema: z.object({ signups: z.array(SignupResponse), pagination: PaginationMetaSchema }),
        },
      },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/signups",
  tags: ["Signups"],
  summary: "Sign a volunteer up for a shift",
  description:
    "Enforces: shift must be published, no duplicate signup, volunteer must have required skills, no overlapping confirmed shifts. Status is 'confirmed' if spots available, 'waitlisted' if at capacity.",
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            volunteerId: ObjectId,
            shiftId: ObjectId,
          }),
        },
      },
    },
  },
  responses: {
    201: { description: "Created", content: { "application/json": { schema: SignupResponse } } },
    ...COMMON_ERRORS,
  },
});

registry.registerPath({
  method: "get",
  path: "/signups/{id}",
  tags: ["Signups"],
  summary: "Get a signup by ID",
  request: { params: z.object({ id: ObjectId }) },
  responses: {
    200: { description: "Signup", content: { "application/json": { schema: SignupResponse } } },
    404: COMMON_ERRORS[404],
  },
});

registry.registerPath({
  method: "put",
  path: "/signups/{id}/cancel",
  tags: ["Signups"],
  summary: "Cancel a signup — auto-promotes the earliest eligible waitlisted volunteer",
  request: {
    params: z.object({ id: ObjectId }),
    body: {
      content: {
        "application/json": {
          schema: z.object({ cancellationReason: z.string().optional() }),
        },
      },
    },
  },
  responses: {
    200: { description: "Cancelled", content: { "application/json": { schema: SignupResponse } } },
    400: COMMON_ERRORS[400],
    404: COMMON_ERRORS[404],
  },
});

registry.registerPath({
  method: "put",
  path: "/signups/{id}/checkin",
  tags: ["Signups"],
  summary: "Check in a volunteer (sets checkedInAt)",
  request: { params: z.object({ id: ObjectId }) },
  responses: {
    200: { description: "Checked in", content: { "application/json": { schema: SignupResponse } } },
    400: COMMON_ERRORS[400],
    404: COMMON_ERRORS[404],
  },
});

registry.registerPath({
  method: "put",
  path: "/signups/{id}/checkout",
  tags: ["Signups"],
  summary: "Check out a volunteer (sets checkedOutAt, marks completed) — requires prior checkin",
  request: { params: z.object({ id: ObjectId }) },
  responses: {
    200: {
      description: "Checked out",
      content: { "application/json": { schema: SignupResponse } },
    },
    400: COMMON_ERRORS[400],
    404: COMMON_ERRORS[404],
  },
});

registry.registerPath({
  method: "put",
  path: "/signups/{id}/status",
  tags: ["Signups"],
  summary: "Update signup status",
  description:
    "Valid transitions: confirmed→cancelled/no-show/completed, waitlisted→confirmed/cancelled",
  request: {
    params: z.object({ id: ObjectId }),
    body: {
      content: {
        "application/json": {
          schema: z.object({
            status: z.enum(["confirmed", "waitlisted", "cancelled", "no-show", "completed"]),
          }),
        },
      },
    },
  },
  responses: {
    200: { description: "Updated", content: { "application/json": { schema: SignupResponse } } },
    400: COMMON_ERRORS[400],
    404: COMMON_ERRORS[404],
  },
});

// ─── Generator ────────────────────────────────────────────────────────────────

export function generateOpenAPIDocument() {
  const generator = new OpenApiGeneratorV3(registry.definitions);
  return generator.generateDocument({
    openapi: "3.0.0",
    info: {
      title: "Volunteer Shift Signup API",
      version: "1.0.0",
      description:
        "Backend API for creating and managing volunteer shift signups. Supports recurring shifts, waitlists, skill matching, and attendance tracking.",
    },
    servers: [{ url: "http://localhost:3000" }],
  });
}
