import { LoadResult, RelayState, StatePersistence } from '../types'
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
    const tmp = this.filePath + '.tmp'
    fs.writeFileSync(tmp, data, 'utf-8')
    fs.renameSync(tmp, this.filePath)
  }

  load(): LoadResult {
    try {
      const data = fs.readFileSync(this.filePath, 'utf-8')
      const state = JSON.parse(data) as RelayState
      return { ok: true, state }
    } catch (err) {
      return { ok: false, error: err as Error }
    }
  }
}
