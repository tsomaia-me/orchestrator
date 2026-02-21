/**
 * Relay Custom Template Engine
 * 
 * Syntax:
 * @if (condition) ... @else if (cond) ... @else ... @endif
 * @for (item of list) ... @endfor
 * @const name = expression
 * {{ variable.path }}
 * {{ variable | pipe }}
 */

export type Context = Record<string, any>
export type PipeFunction = (value: any, ...args: string[]) => any
export type PipeRegistry = Record<string, PipeFunction>

// ── AST Nodes ─────────────────────────────────────────────────────────────

export type ASTNode =
    | { type: 'TEXT'; content: string }
    | { type: 'INTERPOLATION'; expression: string }
    | { type: 'CONST'; name: string; expression: string }
    | { type: 'IF'; condition: string; consequence: ASTNode[]; alternate: ASTNode[] | null }
    | { type: 'FOR'; itemName: string; listExpression: string; body: ASTNode[] }

// ── Lexer (Tokenizer) ─────────────────────────────────────────────────────

type Token =
    | { type: 'TEXT'; value: string }
    | { type: 'INTERPOLATION'; value: string }
    | { type: 'TAG'; value: string }

export function tokenize(source: string): Token[] {
    const tokens: Token[] = []
    let cursor = 0
    const length = source.length

    while (cursor < length) {
        // Look for {{ or @
        const nextInterp = source.indexOf('{{', cursor)
        const nextTag = source.indexOf('@', cursor)

        let nextMatch = -1
        let isTag = false

        if (nextInterp !== -1 && nextTag !== -1) {
            if (nextTag < nextInterp) {
                nextMatch = nextTag
                isTag = true
            } else {
                nextMatch = nextInterp
            }
        } else if (nextInterp !== -1) {
            nextMatch = nextInterp
        } else if (nextTag !== -1) {
            nextMatch = nextTag
            isTag = true
        }

        if (nextMatch === -1) {
            // End of string is just text
            if (cursor < length) {
                tokens.push({ type: 'TEXT', value: source.slice(cursor) })
            }
            break
        }

        // Push text before the match
        if (nextMatch > cursor) {
            tokens.push({ type: 'TEXT', value: source.slice(cursor, nextMatch) })
        }

        if (isTag) {
            // Find the end of the tag line (newline or EOF)
            const newlineIdx = source.indexOf('\n', nextMatch)
            const endIdx = newlineIdx !== -1 ? newlineIdx : length
            const tagLine = source.slice(nextMatch, endIdx).trim()

            // Some tags like @if(X) are followed tightly, others are full lines.
            // We push the whole line as a TAG token. 
            // If there's extra text on the line, we'll keep it simple: assume tags claim the whole line.
            tokens.push({ type: 'TAG', value: tagLine })
            cursor = endIdx + 1 // skip the newline
        } else {
            // Interpolation {{ ... }}
            const endInterp = source.indexOf('}}', nextMatch)
            if (endInterp === -1) {
                throw new Error(`Unclosed interpolation starting at index ${nextMatch}`)
            }
            tokens.push({ type: 'INTERPOLATION', value: source.slice(nextMatch + 2, endInterp).trim() })
            cursor = endInterp + 2
        }
    }

    return tokens
}

// ── Parser ───────────────────────────────────────────────────────────────

export function parse(tokens: Token[]): ASTNode[] {
    let pos = 0

    function parseBlock(stopTags: string[]): ASTNode[] {
        const nodes: ASTNode[] = []

        while (pos < tokens.length) {
            const token = tokens[pos]

            if (token.type === 'TAG' && stopTags.some(tag => token.value.startsWith(tag))) {
                break
            }

            pos++

            if (token.type === 'TEXT') {
                nodes.push({ type: 'TEXT', content: token.value })
            } else if (token.type === 'INTERPOLATION') {
                nodes.push({ type: 'INTERPOLATION', expression: token.value })
            } else if (token.type === 'TAG') {
                nodes.push(parseTag(token.value))
            }
        }

        return nodes
    }

    function parseTag(tagStr: string): ASTNode {
        if (tagStr.startsWith('@if')) {
            return parseIf(tagStr)
        }
        if (tagStr.startsWith('@for')) {
            return parseFor(tagStr)
        }
        if (tagStr.startsWith('@const')) {
            return parseConst(tagStr)
        }
        throw new Error(`Unknown tag: ${tagStr}`)
    }

    function parseIf(initialTag: string): ASTNode {
        const conditionMatch = initialTag.match(/@if\s*\((.*)\)/)
        if (!conditionMatch) throw new Error(`Malformed @if: ${initialTag}`)
        const condition = conditionMatch[1].trim()

        const consequence = parseBlock(['@else', '@endif'])
        let alternate: ASTNode[] | null = null

        if (pos < tokens.length) {
            const stopToken = tokens[pos].value
            if (stopToken.startsWith('@else if')) {
                // recursively parse else if as the alternate block
                pos++ // consume the @else if (but wait, we need to pass the tag back to parseIf)
                const elseIfTag = stopToken.replace('@else if', '@if')
                alternate = [parseIf(elseIfTag)]
            } else if (stopToken.startsWith('@else')) {
                pos++ // consume @else
                alternate = parseBlock(['@endif'])
                pos++ // consume @endif
            } else if (stopToken.startsWith('@endif')) {
                pos++ // consume @endif
            }
        }

        return { type: 'IF', condition, consequence, alternate }
    }

    function parseFor(tagStr: string): ASTNode {
        const match = tagStr.match(/@for\s*\(\s*(\w+)\s+of\s+(.*?)\s*\)/)
        if (!match) throw new Error(`Malformed @for: ${tagStr}`)

        const itemName = match[1]
        const listExpression = match[2]

        const body = parseBlock(['@endfor'])
        pos++ // consume @endfor

        return { type: 'FOR', itemName, listExpression, body }
    }

    function parseConst(tagStr: string): ASTNode {
        const match = tagStr.match(/@const\s+(\w+)\s*=\s*(.*)/)
        if (!match) throw new Error(`Malformed @const: ${tagStr}`)
        return { type: 'CONST', name: match[1], expression: match[2] }
    }

    return parseBlock([])
}

// ── Evaluator Utils ───────────────────────────────────────────────────────

function evaluateExpression(expr: string, context: Context): any {
    expr = expr.trim()

    // Try treating it as a literal first
    if (expr === 'true') return true
    if (expr === 'false') return false
    if (expr === 'null') return null
    if (!isNaN(Number(expr))) return Number(expr)
    if (expr.startsWith('"') && expr.endsWith('"')) return expr.slice(1, -1)
    if (expr.startsWith("'") && expr.endsWith("'")) return expr.slice(1, -1)

    // Handle basic equality operators for @if (a === b)
    const equalityMatch = expr.match(/^(.*?)\s*(===|!==|==|!=|<|>|<=|>=)\s*(.*)$/)
    if (equalityMatch) {
        const left = evaluateExpression(equalityMatch[1], context)
        const op = equalityMatch[2]
        const right = evaluateExpression(equalityMatch[3], context)

        switch (op) {
            case '===': return left === right
            case '!==': return left !== right
            case '==': return left == right
            case '!=': return left != right
            case '<': return left < right
            case '>': return left > right
            case '<=': return left <= right
            case '>=': return left >= right
            default: return false
        }
    }

    // Implicit safe traversal: a.b.c or a.b[0].c
    // Convert [0] to .0 for uniform splitting
    const path = expr.replace(/\[(\w+)\]/g, '.$1').split('.')

    let current = context
    for (const segment of path) {
        if (current == null) return undefined
        current = current[segment]
    }

    return current
}

function evaluateWithPipes(expr: string, context: Context, pipes: PipeRegistry = {}): any {
    const parts = expr.split('|').map(p => p.trim())
    const baseExpr = parts[0]
    let value = evaluateExpression(baseExpr, context)

    // Apply pipes left-to-right
    for (let i = 1; i < parts.length; i++) {
        const pipeStr = parts[i]
        if (!pipeStr) continue

        // e.g. "slice: '1,5'"
        const pipeMatch = pipeStr.match(/^(\w+)(?:\s*:\s*(.*))?$/)
        if (!pipeMatch) throw new Error(`Invalid pipe syntax: ${pipeStr}`)

        const pipeName = pipeMatch[1]
        const argsStr = pipeMatch[2]

        const fn = pipes[pipeName]
        if (!fn) throw new Error(`Unknown pipe: ${pipeName}`)

        if (argsStr) {
            // Evaluates args dynamically (literals and paths)
            const args = argsStr.split(',').map(a => evaluateExpression(a.trim(), context))
            value = fn(value, ...args)
        } else {
            value = fn(value)
        }
    }

    return value
}

function processInterpolation(expr: string, context: Context, pipes: PipeRegistry): string {
    const value = evaluateWithPipes(expr, context, pipes)
    return value == null ? '' : String(value)
}

// ── Evaluator ─────────────────────────────────────────────────────────────

export function evaluate(nodes: ASTNode[], context: Context, pipes: PipeRegistry = {}): string {
    let output = ''

    // Clone context strictly for block-level lexical scoping
    // BUT we mutate this exact clone when @const is hit in this block
    const localContext = { ...context }

    for (const node of nodes) {
        switch (node.type) {
            case 'TEXT':
                output += node.content
                break
            case 'INTERPOLATION':
                output += processInterpolation(node.expression, localContext, pipes)
                break
            case 'CONST':
                if (Object.prototype.hasOwnProperty.call(localContext, node.name)) {
                    throw new Error(`TemplateError: Cannot shadow or redefine constant '${node.name}'`)
                }
                localContext[node.name] = evaluateWithPipes(node.expression, localContext, pipes)
                break
            case 'IF': {
                const condValue = evaluateWithPipes(node.condition, localContext, pipes)
                if (condValue) {
                    output += evaluate(node.consequence, localContext, pipes)
                } else if (node.alternate) {
                    output += evaluate(node.alternate, localContext, pipes)
                }
                break
            }
            case 'FOR': {
                const listValue = evaluateWithPipes(node.listExpression, localContext, pipes)
                if (Array.isArray(listValue)) {
                    for (const item of listValue) {
                        // New block scope for each loop iteration
                        const loopContext = { ...localContext, [node.itemName]: item }
                        output += evaluate(node.body, loopContext, pipes)
                    }
                }
                break
            }
        }
    }

    return output
}

/**
 * Main Template Compilation Entrypoint
 */
export function render(templateStr: string, context: Context, pipes: PipeRegistry = {}): string {
    const tokens = tokenize(templateStr)
    const ast = parse(tokens)
    return evaluate(ast, context, pipes)
}
