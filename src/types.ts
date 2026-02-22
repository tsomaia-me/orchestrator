import { z } from 'zod'
import {
  ApprovalSchema,
  CreateTaskSchema,
  EngineerReportSchema,
  LoadProtocolSchema,
  RejectionSchema,
  SetActiveFeatureSchema,
} from './schema'

export type Role = 'reviewer' | 'engineer'

export type Phase =
  | 'AWAITING_IMPLEMENTATION_REPORT'
  | 'AWAITING_REVIEW'
  | 'AWAITING_COMMENTS_RESOLUTION'
  | 'COMPLETED'

/** Phases where the Reviewer has work to do (await_engineer_update returns immediately) */
export const REVIEWER_ACTIVE_PHASES: readonly Phase[] = [
  'AWAITING_REVIEW',
  'COMPLETED',
] as const

/** Phases where the Engineer has work to do (await_reviewer_update returns immediately) */
export const ENGINEER_ACTIVE_PHASES: readonly Phase[] = [
  'AWAITING_IMPLEMENTATION_REPORT',
  'AWAITING_COMMENTS_RESOLUTION',
  'COMPLETED',
] as const

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

export type LoadProtocol = z.infer<typeof LoadProtocolSchema>
export type CreateTask = z.infer<typeof CreateTaskSchema>
export type EngineerReport = z.infer<typeof EngineerReportSchema>
export type Approval = z.infer<typeof ApprovalSchema>
export type Rejection = z.infer<typeof RejectionSchema>
export type SetActiveFeature = z.infer<typeof SetActiveFeatureSchema>

export type Handoff =
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

export type LoadResult =
  | { ok: true; state: RelayState }
  | { ok: false; error: Error }

export interface StatePersistence {
  save(state: RelayState): void
  load(): LoadResult
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

export type TaskEventName = `${TaskId}.${TaskEventType}`

export type TaskEventListener = (payload: any) => void
