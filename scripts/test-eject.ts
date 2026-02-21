import { templateManager } from '../src/template-manager'
import * as path from 'node:path'
import * as fs from 'node:fs'

const projectRoot = path.resolve('.')

// 1. Initialize manager (simulating mcp.ts `initialize`)
templateManager.initialize(projectRoot)

// 2. Try rendering reviewer protocol (should lazy eject)
const reviewerText = templateManager.render('reviewer_protocol.mx', {})
console.log('--- Reviewer Protocol Rendered ---')
console.log(reviewerText.substring(0, 100) + '...')

// 3. Try rendering briefing (with context)
const briefingText = templateManager.render('briefing_awaiting_implementation_report.mx', {
    task: {
        featureId: 'testing',
        taskId: '123',
        phase: 'AWAITING_IMPLEMENTATION_REPORT',
        spec: {
            objective: 'test the template engine',
            requirements: ['req1', 'req2'],
            constraints: ['constraint1'],
        },
        handoff: null,
    },
})
console.log('\n--- Briefing Rendered ---')
console.log(briefingText.substring(0, 200) + '...')

console.log('\nChecking directory contents:')
const files = fs.readdirSync(path.join(projectRoot, '.relay', 'templates'))
console.log(files)
