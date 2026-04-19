import { sql } from "drizzle-orm";
import {
  pgTable,
  varchar,
  timestamp,
  boolean,
  integer,
  text,
  serial,
  index,
  numeric,
} from "drizzle-orm/pg-core";

// System table - DO NOT DELETE
export const healthCheck = pgTable("health_check", {
  id: serial().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow(),
});

// Users table
export const users = pgTable(
  "users",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    email: varchar("email", { length: 255 }).notNull().unique(),
    name: varchar("name", { length: 128 }),
    passwordHash: varchar("password_hash", { length: 255 }),
    role: varchar("role", { length: 20 }).notNull().default("user"),
    googleId: varchar("google_id", { length: 255 }),
    avatarUrl: varchar("avatar_url", { length: 500 }),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("users_email_idx").on(table.email),
    index("users_google_id_idx").on(table.googleId),
    index("users_role_idx").on(table.role),
  ]
);

// Credits table - Point system
export const credits = pgTable(
  "credits",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    balance: integer("balance").notNull().default(300),
    lastResetAt: timestamp("last_reset_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("credits_user_id_idx").on(table.userId),
    index("credits_last_reset_at_idx").on(table.lastResetAt),
  ]
);

// Videos table - Original long videos
export const videos = pgTable(
  "videos",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    originalUrl: varchar("original_url", { length: 1000 }).notNull(),
    sourceType: varchar("source_type", { length: 20 }).notNull(), // youtube, bilibili, local
    title: varchar("title", { length: 500 }),
    duration: integer("duration"), // in seconds
    status: varchar("status", { length: 20 }).notNull().default("pending"), // pending, processing, completed, failed
    highlights: text("highlights"), // JSON string of highlights analysis
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("videos_user_id_idx").on(table.userId),
    index("videos_status_idx").on(table.status),
    index("videos_created_at_idx").on(table.createdAt),
  ]
);

// Short videos table - Generated short clips
export const shortVideos = pgTable(
  "short_videos",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    videoId: varchar("video_id", { length: 36 })
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    url: varchar("url", { length: 1000 }).notNull(),
    startTime: numeric("start_time", { precision: 10, scale: 2 }).notNull(), // in seconds
    endTime: numeric("end_time", { precision: 10, scale: 2 }).notNull(), // in seconds
    duration: integer("duration").notNull(), // in seconds
    highlightTitle: varchar("highlight_title", { length: 255 }),
    highlightSummary: text("highlight_summary"),
    thumbnailUrl: varchar("thumbnail_url", { length: 1000 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("short_videos_video_id_idx").on(table.videoId),
    index("short_videos_user_id_idx").on(table.userId),
    index("short_videos_created_at_idx").on(table.createdAt),
  ]
);

// Blogs table
export const blogs = pgTable(
  "blogs",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    title: varchar("title", { length: 255 }).notNull(),
    category: varchar("category", { length: 100 }).notNull(),
    content: text("content").notNull(), // Rich text content (HTML)
    coverImage: varchar("cover_image", { length: 1000 }),
    authorId: varchar("author_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    isPublished: boolean("is_published").default(false).notNull(),
    viewCount: integer("view_count").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("blogs_author_id_idx").on(table.authorId),
    index("blogs_category_idx").on(table.category),
    index("blogs_is_published_idx").on(table.isPublished),
    index("blogs_created_at_idx").on(table.createdAt),
  ]
);

// Subscriptions table - User subscription plans
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    planType: varchar("plan_type", { length: 20 }).notNull().default("free"), // free, basic, pro
    status: varchar("status", { length: 20 }).notNull().default("active"), // active, cancelled, expired
    stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 }),
    stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
    currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("subscriptions_user_id_idx").on(table.userId),
    index("subscriptions_plan_type_idx").on(table.planType),
    index("subscriptions_status_idx").on(table.status),
    index("subscriptions_stripe_subscription_id_idx").on(table.stripeSubscriptionId),
  ]
);

// Credit transactions table - Track credit usage
export const creditTransactions = pgTable(
  "credit_transactions",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    amount: integer("amount").notNull(), // positive for credit, negative for debit
    type: varchar("type", { length: 50 }).notNull(), // daily_reset, video_process, purchase, etc.
    description: varchar("description", { length: 500 }),
    relatedId: varchar("related_id", { length: 36 }), // Related video or transaction ID
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("credit_transactions_user_id_idx").on(table.userId),
    index("credit_transactions_type_idx").on(table.type),
    index("credit_transactions_created_at_idx").on(table.createdAt),
  ]
);

// Type exports
export type User = typeof users.$inferSelect;
export type Credit = typeof credits.$inferSelect;
export type Video = typeof videos.$inferSelect;
export type ShortVideo = typeof shortVideos.$inferSelect;
export type Blog = typeof blogs.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type CreditTransaction = typeof creditTransactions.$inferSelect;
