import { RelayState, StatePersistence } from '../types'
import { createEmptyState } from '../helpers'
import path from 'path'
import fs from 'fs'

/**
 * File-based persistence using synchronous I/O.
 * Synchronous writes guarantee state is committed to disk
 * before the tool response is returned to the MCP client.
 */
export class FilePersistence implements StatePersistence {
  private filePath: string

  constructor(filePath: string) {
    this.filePath = path.resolve(filePath)
  }

  setFilePath(newPath: string): void {
    this.filePath = path.resolve(newPath)
  }

  save(state: RelayState): void {
    const dir = path.dirname(this.filePath)
    fs.mkdirSync(dir, { recursive: true })
    const data = JSON.stringify(state, null, 2)
    fs.writeFileSync(this.filePath, data, 'utf-8')
  }

  load(): RelayState {
    try {
      const data = fs.readFileSync(this.filePath, 'utf-8')
      return JSON.parse(data) as RelayState
    } catch {
      return createEmptyState()
    }
  }
}
