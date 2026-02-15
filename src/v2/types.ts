import { z } from 'zod/index'
import { ApprovalSchema, CreateTaskSchema, DirectiveSchema, EngineerReportSchema, RejectionSchema } from './schema'

export type Phase =
  | 'INITIAL'
  | 'AWAITING_DIRECTIVE'
  | 'AWAITING_IMPLEMENTATION_REPORT'
  | 'AWAITING_REVIEW'
  | 'AWAITING_COMMENTS_RESOLUTION'
  | 'COMPLETED'

export type TaskState = {
  phase: Phase
  spec: any
  handoff: any
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

export type Approval = z.infer<typeof ApprovalSchema>
export type CreateTask = z.infer<typeof CreateTaskSchema>
export type Directive = z.infer<typeof DirectiveSchema>
export type EngineerReport = z.infer<typeof EngineerReportSchema>
export type Rejection = z.infer<typeof RejectionSchema>
