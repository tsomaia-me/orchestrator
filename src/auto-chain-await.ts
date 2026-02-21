import { TemplateManager } from './template-manager'
import { Phase } from './types'

export type HandleAwaitFn = (
  activePhases: readonly Phase[],
  thisToolName: string,
) => Promise<{ content: Array<{ type: 'text'; text: string }> }>

export interface AutoChainAwaitDeps {
  awaitInFlight: Map<string, boolean>
  handleAwait: HandleAwaitFn
  templateManager: TemplateManager
  getProjectRoot: () => string
  timeoutMs: number
}

export async function autoChainAwait(
  templateName: string,
  baseContext: Record<string, unknown>,
  role: 'reviewer' | 'engineer',
  activePhases: readonly Phase[],
  awaitToolName: string,
  deps: AutoChainAwaitDeps,
): Promise<{ content: [{ type: 'text'; text: string }] }> {
  const { awaitInFlight, handleAwait, templateManager, getProjectRoot } = deps
  templateManager.initialize(getProjectRoot())

  if (awaitInFlight.get(role)) {
    const text = templateManager.render(templateName, {
      ...baseContext,
      state: 'already_waiting',
      awaitToolName,
    })
    return { content: [{ type: 'text' as const, text }] }
  }

  awaitInFlight.set(role, true)
  try {
    const result = await handleAwait(activePhases, awaitToolName)

    if (result.content[0].text.includes('⏳ WAITING:')) {
      const text = templateManager.render(templateName, {
        ...baseContext,
        state: 'timeout',
        awaitToolName,
      })
      return { content: [{ type: 'text' as const, text }] }
    }

    const text = templateManager.render(templateName, {
      ...baseContext,
      state: 'success',
      briefingText: result.content[0].text,
    })
    return { content: [{ type: 'text' as const, text }] }
  } finally {
    awaitInFlight.set(role, false)
  }
}
