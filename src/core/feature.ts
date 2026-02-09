import fs from 'fs-extra';
import path from 'path';
import { getFeaturesDir, getFeatureDir, getArchiveDir } from './resolver';

export interface FeatureConfig {
    expectations?: string[];
    constraints?: string[];
}

export interface FeatureState {
    currentTask: string;              // "001"
    currentTaskSlug: string;          // "login-form"
    iteration: number;                // 1, 2, 3...
    lastAuthor: 'architect' | 'engineer' | null;
    status: 'pending' | 'in_progress' | 'approved' | 'rejected';
    createdAt: number;
    updatedAt: number;
}

export interface TaskFile {
    id: string;           // "001"
    slug: string;         // "login-form"
    filename: string;     // "001-login-form.md"
    title: string;        // "Login Form"
    content: string;
    path: string;
}

export interface Feature {
    name: string;
    path: string;
    plan: string | null;
    config: FeatureConfig | null;
    state: FeatureState;
    tasks: TaskFile[];
}

/**
 * List all active features
 */
export async function listFeatures(projectRoot: string): Promise<string[]> {
    const featuresDir = getFeaturesDir(projectRoot);

    if (!await fs.pathExists(featuresDir)) {
        return [];
    }

    const entries = await fs.readdir(featuresDir, { withFileTypes: true });
    return entries
        .filter(e => e.isDirectory())
        .map(e => e.name)
        .sort();
}

/**
 * Check if a feature exists
 */
export async function featureExists(projectRoot: string, name: string): Promise<boolean> {
    const featureDir = getFeatureDir(projectRoot, name);
    return fs.pathExists(featureDir);
}

/**
 * Get feature details
 */
export async function getFeature(projectRoot: string, name: string): Promise<Feature> {
    const featureDir = getFeatureDir(projectRoot, name);

    if (!await fs.pathExists(featureDir)) {
        throw new Error(`Feature '${name}' not found`);
    }

    // Load plan
    const planPath = path.join(featureDir, 'plan.md');
    const plan = await fs.pathExists(planPath)
        ? await fs.readFile(planPath, 'utf-8')
        : null;

    // Load config
    const configPath = path.join(featureDir, 'config.json');
    let config: FeatureConfig | null = null;
    if (await fs.pathExists(configPath)) {
        config = await fs.readJson(configPath);
    }

    // Load state
    const state = await loadFeatureState(projectRoot, name);

    // Load tasks
    const tasks = await loadFeatureTasks(projectRoot, name);

    return {
        name,
        path: featureDir,
        plan,
        config,
        state,
        tasks
    };
}

/**
 * Load feature state
 */
export async function loadFeatureState(projectRoot: string, name: string): Promise<FeatureState> {
    const statePath = path.join(getFeatureDir(projectRoot, name), 'state.json');

    if (await fs.pathExists(statePath)) {
        return fs.readJson(statePath);
    }

    // Default state
    return {
        currentTask: '',
        currentTaskSlug: '',
        iteration: 0,
        lastAuthor: null,
        status: 'pending',
        createdAt: Date.now(),
        updatedAt: Date.now()
    };
}

/**
 * Save feature state
 */
export async function saveFeatureState(
    projectRoot: string,
    name: string,
    state: FeatureState
): Promise<void> {
    const statePath = path.join(getFeatureDir(projectRoot, name), 'state.json');
    state.updatedAt = Date.now();
    await fs.writeJson(statePath, state, { spaces: 2 });
}

/**
 * Load feature tasks
 */
export async function loadFeatureTasks(projectRoot: string, name: string): Promise<TaskFile[]> {
    const tasksDir = path.join(getFeatureDir(projectRoot, name), 'tasks');

    if (!await fs.pathExists(tasksDir)) {
        return [];
    }

    const files = await fs.readdir(tasksDir);
    const taskFiles = files
        .filter(f => f.match(/^\d{3}-.*\.md$/))
        .sort();

    const tasks: TaskFile[] = [];

    for (const filename of taskFiles) {
        const filePath = path.join(tasksDir, filename);
        const content = await fs.readFile(filePath, 'utf-8');

        // Extract ID and slug from filename
        const match = filename.match(/^(\d{3})-(.+)\.md$/);
        if (!match) continue;

        const id = match[1];
        const slug = match[2];

        // Extract title from content
        const titleMatch = content.match(/^# Task \d+:\s*(.+)$/m);
        const title = titleMatch ? titleMatch[1].trim() : slug.replace(/-/g, ' ');

        tasks.push({
            id,
            slug,
            filename,
            title,
            content,
            path: filePath
        });
    }

    return tasks;
}

/**
 * Create a new feature scaffold
 */
export async function createFeature(projectRoot: string, name: string): Promise<void> {
    const featureDir = getFeatureDir(projectRoot, name);

    if (await fs.pathExists(featureDir)) {
        throw new Error(`Feature '${name}' already exists`);
    }

    // Create directories
    await fs.ensureDir(path.join(featureDir, 'tasks'));
    await fs.ensureDir(path.join(featureDir, 'exchange'));

    // Create plan.md template
    const planTemplate = `# ${name.charAt(0).toUpperCase() + name.slice(1)} Plan

> **Created:** ${new Date().toISOString().split('T')[0]}
> **Status:** Draft

## Overview

[Describe what this feature accomplishes]

## Architecture

[Key design decisions and structure]

## Task Breakdown

| # | Task | Description |
|---|------|-------------|
| 001 | [First task] | [Description] |

## Constraints

- [List constraints]

## Success Criteria

- [ ] [Criterion 1]
- [ ] [Criterion 2]
`;

    await fs.writeFile(path.join(featureDir, 'plan.md'), planTemplate);

    // Create initial state
    const state: FeatureState = {
        currentTask: '',
        currentTaskSlug: '',
        iteration: 0,
        lastAuthor: null,
        status: 'pending',
        createdAt: Date.now(),
        updatedAt: Date.now()
    };

    await fs.writeJson(path.join(featureDir, 'state.json'), state, { spaces: 2 });
}

/**
 * Archive a feature
 */
export async function archiveFeature(projectRoot: string, name: string): Promise<void> {
    const featureDir = getFeatureDir(projectRoot, name);
    const archiveDir = getArchiveDir(projectRoot);

    if (!await fs.pathExists(featureDir)) {
        throw new Error(`Feature '${name}' not found`);
    }

    await fs.ensureDir(archiveDir);

    const archiveName = `${name}-${Date.now()}`;
    const archivePath = path.join(archiveDir, archiveName);

    await fs.move(featureDir, archivePath);
}
