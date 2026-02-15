import { z } from 'zod/index'
import { ApprovalSchema, CreateTaskSchema, DirectiveSchema, EngineerReportSchema, RejectionSchema } from './schema'

export type Phase =
  | 'AWAITING_DIRECTIVE'
  | 'AWAITING_IMPLEMENTATION_REPORT'
  | 'AWAITING_REVIEW'
  | 'AWAITING_COMMENTS_RESOLUTION'
  | 'COMPLETED'

export type TaskState = {
  featureId: string
  taskId: string
  phase: Phase
  handoff: Handoff
  spec: {
    objective: string
    requirements: string[]
    constraints: string[]
  }
}

export type FeatureState = {
  tasks: {
    [taskId: string]: TaskState
  }
}

export type RelayState = {
  features: {
    [featureId: string]: FeatureState
  }
  currentContext: {
    featureId: string;
    taskId: string;
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
  | { type: 'rejection'; data: Rejection }
  | null;

export type Briefing = {
  featureId: string
  taskId: string
  phase: Phase
  task: TaskState
  handoff: Handoff
  instructions: string
}
