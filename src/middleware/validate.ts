import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  name: z.string().min(2, "Name must be at least 2 characters"),
  phone: z.string().optional(),
  role: z.enum(["CUSTOMER", "PROVIDER"], {
    message: "Role must be CUSTOMER or PROVIDER",
  }),
});

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export const updateProfileSchema = z.object({
  name: z.string().min(2).optional(),
  phone: z.string().optional(),
});

export const categorySchema = z.object({
  name: z.string().min(2, "Category name required"),
  description: z.string().optional(),
});

export const gearSchema = z.object({
  name: z.string().min(2),
  brand: z.string().min(1),
  description: z.string().min(10),
  categoryId: z.string().min(1),
  pricePerDay: z.number().positive("Price must be positive"),
  stock: z.number().int().min(0),
  specifications: z.record(z.string(), z.unknown()).optional(),
  images: z.array(z.string().url()).optional(),
  status: z.enum(["AVAILABLE", "UNAVAILABLE", "MAINTENANCE"]).optional(),
});

export const rentalItemSchema = z.object({
  gearItemId: z.string().min(1),
  quantity: z.number().int().min(1),
});

export const createRentalSchema = z.object({
  items: z.array(rentalItemSchema).min(1, "At least one item required"),
  startDate: z.string().datetime({ message: "Invalid start date" }),
  endDate: z.string().datetime({ message: "Invalid end date" }),
});

export const updateOrderStatusSchema = z.object({
  status: z.enum(["CONFIRMED", "PICKED_UP", "RETURNED", "CANCELLED"]),
});

export const createPaymentSchema = z.object({
  rentalOrderId: z.string().min(1),
});

export const confirmPaymentSchema = z
  .object({
    paymentIntentId: z.string().min(1).optional(),
    sessionId: z.string().min(1).optional(),
  })
  .refine((data) => data.paymentIntentId || data.sessionId, {
    message: "Either paymentIntentId or sessionId is required",
  });

export const reviewSchema = z.object({
  rentalOrderId: z.string().min(1),
  gearItemId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
});

export const updateUserStatusSchema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED"]),
});

export const gearQuerySchema = z.object({
  category: z.string().optional(),
  brand: z.string().optional(),
  minPrice: z.coerce
    .number({ message: "minPrice must be a valid number" })
    .optional(),
  maxPrice: z.coerce
    .number({ message: "maxPrice must be a valid number" })
    .optional(),
  available: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  sort: z.enum(["price_asc", "price_desc", "newest"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
