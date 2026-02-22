import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const projects = sqliteTable('projects', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    rootPath: text('root_path').notNull().unique(), // Unique to track instances easily
    purpose: text('purpose'),
    businessGoals: text('business_goals', { mode: 'json' }).$type<string[]>(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export const features = sqliteTable('features', {
    id: text('id').primaryKey(),
    projectId: text('project_id').references(() => projects.id).notNull(),
    name: text('name').notNull(),
    technicalSpecs: text('technical_specs'),
    acceptanceCriteria: text('acceptance_criteria', { mode: 'json' }).$type<string[]>(),
    status: text('status', { enum: ['PLANNING', 'DEVELOPMENT', 'REVIEW', 'COMPLETED'] }).notNull().default('PLANNING'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export const tasks = sqliteTable('tasks', {
    id: text('id').primaryKey(),
    featureId: text('feature_id').references(() => features.id).notNull(),
    objective: text('objective').notNull(),
    requirements: text('requirements', { mode: 'json' }).$type<string[]>(),
    constraints: text('constraints', { mode: 'json' }).$type<string[]>(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export const exchanges = sqliteTable('exchanges', {
    id: text('id').primaryKey(),
    taskId: text('task_id').references(() => tasks.id).notNull(),
    type: text('type').notNull(), // 'STAGE_DIRECTIVE', 'IMPLEMENTATION_REPORT', 'REJECTION', 'APPROVAL'
    author: text('author').notNull(), // 'planner', 'engineer', 'reviewer'

    // The Blockchain Mechanics
    parentHash: text('parent_hash').unique(),
    hash: text('hash').notNull(),

    // Storage for the LLM Output/Schemas
    payload: text('payload', { mode: 'json' }).$type<any>().notNull(),

    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
});
