import { pgTable, text, serial, integer, boolean, timestamp, json, varchar, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Sessions table
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// Users table
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  username: text("username").notNull().unique(),
  password: text("password"),
  displayName: text("display_name"),
  avatar: text("avatar"),
  provider: text("provider").default("local"),
  providerId: text("provider_id"),
  refreshToken: text("refresh_token"),
  level: integer("level").default(1),
  xp: integer("xp").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Memes table
export const memes = pgTable("memes", {
  id: serial("id").primaryKey(),
  authorId: integer("author_id").references(() => users.id),
  imageUrl: text("image_url").notNull(),
  caption: text("caption"),
  upvotes: integer("upvotes").default(0),
  downvotes: integer("downvotes").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// Comments table
export const comments = pgTable("comments", {
  id: serial("id").primaryKey(),
  memeId: integer("meme_id").references(() => memes.id),
  authorId: integer("author_id").references(() => users.id),
  body: text("body").notNull(),
  parentId: integer("parent_id"),
  upvotes: integer("upvotes").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// Game session table
export const gameSessions = pgTable("game_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  score: integer("score"),
  sanityLeft: integer("sanity_left"),
  choices: json("choices").default([]),
  endedAt: timestamp("ended_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Resources table
export const resources = pgTable("resources", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  category: text("category"),
  markdown: text("markdown"),
  downloadUrl: text("download_url"),
  votes: integer("votes").default(0),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// Insert schemas
export const insertUserSchema = createInsertSchema(users);

export const insertMemeSchema = createInsertSchema(memes).pick({
  authorId: true,
  imageUrl: true,
  caption: true,
});

export const insertCommentSchema = createInsertSchema(comments).pick({
  memeId: true,
  authorId: true,
  body: true,
  parentId: true,
});

export const insertGameSessionSchema = createInsertSchema(gameSessions).pick({
  userId: true,
  score: true,
  sanityLeft: true,
  choices: true,
});

export const insertResourceSchema = createInsertSchema(resources).pick({
  title: true,
  category: true,
  markdown: true,
  downloadUrl: true,
  createdBy: true,
});

// Type definitions
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Meme = typeof memes.$inferSelect;
export type InsertMeme = z.infer<typeof insertMemeSchema>;

export type Comment = typeof comments.$inferSelect;
export type InsertComment = z.infer<typeof insertCommentSchema>;

export type GameSession = typeof gameSessions.$inferSelect;
export type InsertGameSession = z.infer<typeof insertGameSessionSchema>;

export type Resource = typeof resources.$inferSelect;
export type InsertResource = z.infer<typeof insertResourceSchema>;
