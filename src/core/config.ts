import fs from 'fs-extra';
import path from 'path';

export interface AgentConfig {
    promptPath: string;
    outputFile: string;
}

export interface AutoModeConfig {
    enabled: boolean;
    injectPlanContext: boolean;
    singleTaskFocus: boolean;
    requireExplicitPaths: boolean;
}

export interface LimitsConfig {
    maxIterationsPerTask: number;
    maxTotalIterations: number;
}

export interface RelayConfig {
    planPath: string;   // REQUIRED
    tasksPath: string;  // REQUIRED
    agents: {
        architect: AgentConfig;
        engineer: AgentConfig;
    };
    autoMode: AutoModeConfig;
    limits: LimitsConfig;
}

export interface TaskFile {
    id: string;         // e.g., "001"
    filename: string;   // e.g., "001-project-setup.md"
    title: string;      // Extracted from # Task NNN: Title
    status: 'pending' | 'in_progress' | 'complete';
    content: string;
    path: string;
}

const DEFAULT_CONFIG: Omit<RelayConfig, 'planPath' | 'tasksPath'> = {
    agents: {
        architect: {
            promptPath: './prompts/architect.md',
            outputFile: 'architect_directive.md'
        },
        engineer: {
            promptPath: './prompts/engineer.md',
            outputFile: 'engineer_report.md'
        }
    },
    autoMode: {
        enabled: true,
        injectPlanContext: true,
        singleTaskFocus: true,
        requireExplicitPaths: true
    },
    limits: {
        maxIterationsPerTask: 10,
        maxTotalIterations: 100
    }
};

export class ConfigLoader {
    private configPath: string;
    private workDir: string;

    constructor(workDir: string) {
        this.workDir = workDir;
        const jsoncPath = path.join(workDir, 'relay.config.jsonc');
        const jsonPath = path.join(workDir, 'relay.config.json');

        if (fs.existsSync(jsoncPath)) {
            this.configPath = jsoncPath;
        } else {
            this.configPath = jsonPath;
        }
    }

    async load(): Promise<RelayConfig> {
        // Check if config exists
        if (!await fs.pathExists(this.configPath)) {
            throw new Error(
                `Config file not found.\n` +
                `Create relay.config.json with:\n` +
                `{\n  "planPath": "./plan.md",\n  "tasksPath": "./tasks"\n}`
            );
        }

        // Load and parse (strip comments for jsonc)
        let content = await fs.readFile(this.configPath, 'utf-8');
        content = this.stripJsonComments(content);

        let userConfig: Partial<RelayConfig>;
        try {
            userConfig = JSON.parse(content);
        } catch (e: any) {
            throw new Error(`Invalid config JSON: ${e.message}`);
        }

        // Validate REQUIRED: planPath
        if (!userConfig.planPath) {
            throw new Error(
                `REQUIRED: "planPath" must be specified in config.\n` +
                `This is the architectural plan that guides all agent work.`
            );
        }

        // Validate REQUIRED: tasksPath
        if (!userConfig.tasksPath) {
            throw new Error(
                `REQUIRED: "tasksPath" must be specified in config.\n` +
                `This is the directory containing individual task files.`
            );
        }

        // Verify plan file exists
        const planFullPath = path.resolve(this.workDir, userConfig.planPath);
        if (!await fs.pathExists(planFullPath)) {
            throw new Error(
                `Plan file not found: ${planFullPath}\n` +
                `The architectural plan is REQUIRED before running Relay.\n` +
                `Use PLAN_TEMPLATE.md as a starting point.`
            );
        }

        // Verify tasks directory exists
        const tasksFullPath = path.resolve(this.workDir, userConfig.tasksPath);
        if (!await fs.pathExists(tasksFullPath)) {
            throw new Error(
                `Tasks directory not found: ${tasksFullPath}\n` +
                `Create the tasks directory with individual task files.`
            );
        }

        // Merge with defaults
        const config: RelayConfig = {
            planPath: userConfig.planPath,
            tasksPath: userConfig.tasksPath,
            agents: { ...DEFAULT_CONFIG.agents, ...userConfig.agents },
            autoMode: { ...DEFAULT_CONFIG.autoMode, ...userConfig.autoMode },
            limits: { ...DEFAULT_CONFIG.limits, ...userConfig.limits }
        };

        return config;
    }

    async loadPlan(): Promise<string> {
        const config = await this.load();
        const planPath = path.resolve(this.workDir, config.planPath);
        return fs.readFile(planPath, 'utf-8');
    }

    async listTasks(): Promise<TaskFile[]> {
        const config = await this.load();
        const tasksDir = path.resolve(this.workDir, config.tasksPath);

        const files = await fs.readdir(tasksDir);
        const taskFiles = files
            .filter(f => f.match(/^\d{3}-.*\.md$/) && f !== 'TEMPLATE.md')
            .sort();

        const tasks: TaskFile[] = [];

        for (const filename of taskFiles) {
            const filePath = path.join(tasksDir, filename);
            const content = await fs.readFile(filePath, 'utf-8');

            // Extract ID from filename
            const id = filename.substring(0, 3);

            // Extract title from content
            const titleMatch = content.match(/^# Task \d+:\s*(.+)$/m);
            const title = titleMatch ? titleMatch[1].trim() : filename;

            // Extract status
            let status: TaskFile['status'] = 'pending';
            if (content.includes('[x]') && content.match(/## Status\s*\n\[x\]/)) {
                status = 'complete';
            } else if (content.includes('[/]') && content.match(/## Status\s*\n\[\/\]/)) {
                status = 'in_progress';
            }

            tasks.push({ id, filename, title, status, content, path: filePath });
        }

        return tasks;
    }

    async getCurrentTask(): Promise<TaskFile | null> {
        const tasks = await this.listTasks();

        // Find first in-progress task
        const inProgress = tasks.find(t => t.status === 'in_progress');
        if (inProgress) return inProgress;

        // Otherwise, find first pending task
        const pending = tasks.find(t => t.status === 'pending');
        return pending || null;
    }

    async getTaskById(id: string): Promise<TaskFile | null> {
        const tasks = await this.listTasks();
        return tasks.find(t => t.id === id) || null;
    }

    private stripJsonComments(content: string): string {
        return content.replace(/\/\/.*$/gm, '');
    }
}
