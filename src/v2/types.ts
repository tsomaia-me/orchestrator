import { z } from 'zod/index'
import { ApprovalSchema, CreateTaskSchema, DirectiveSchema, EngineerReportSchema, RejectionSchema } from './schema'

export type Phase =
  | 'AWAITING_DIRECTIVE'
  | 'AWAITING_IMPLEMENTATION_REPORT'
  | 'AWAITING_REVIEW'
  | 'AWAITING_COMMENTS_RESOLUTION'
  | 'COMPLETED'

export type TaskState = {
  featureId: FeatureId
  taskId: TaskId
  phase: Phase
  handoff: Handoff | null
  spec: {
    objective: string
    requirements: string[]
    constraints: string[]
  }
}

export type FeatureState = {
  id: FeatureId
  tasks: TaskState[]
}

export type RelayState = {
  features: FeatureState[]
  currentContext: {
    featureId: FeatureId;
    taskId: TaskId;
  } | null
}

export type CreateTask = z.infer<typeof CreateTaskSchema>
export type Directive = z.infer<typeof DirectiveSchema>
export type EngineerReport = z.infer<typeof EngineerReportSchema>
export type Approval = z.infer<typeof ApprovalSchema>
export type Rejection = z.infer<typeof RejectionSchema>

export type Handoff =
  | { type: 'directive'; data: Directive }
  | { type: 'report'; data: EngineerReport }
  | { type: 'approval'; data: Approval }
  | { type: 'rejection'; data: Rejection };

export type Briefing = {
  featureId: string
  taskId: string
  phase: Phase
  task: TaskState
  handoff: Handoff | null
  instructions: string
}

export interface StatePersistence {
  save(state: RelayState): Promise<void>;
  load(): Promise<RelayState>;
}

export type FeatureId = string
export type TaskId = string
export type TaskEventType =
  | 'post_directive'
  | 'post_implementation_report'
  | 'post_approval'
  | 'post_rejection'
  | 'post_comments_resolution'
  | 'completed'
export type TaskEventName = `${FeatureId}.${TaskId}.${TaskEventType}`
export type TaskEventListener = (task: TaskState) => void
