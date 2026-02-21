export type Context = Record<string, any>
export type PipeFunction = (value: any, ...args: any[]) => any
export type PipeRegistry = Record<string, PipeFunction>

// ── Expression Lexer ──────────────────────────────────────────────────────

export type ExprToken =
    | { type: 'Identifier'; value: string }
    | { type: 'Number'; value: number }
    | { type: 'String'; value: string }
    | { type: 'Operator'; value: string }
    | { type: 'Punctuation'; value: string }

function isWhitespace(c: string) { return c === ' ' || c === '\n' || c === '\t' || c === '\r' }
function isAlpha(c: string) { return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_' || c === '$' }
function isDigit(c: string) { return (c >= '0' && c <= '9') }

export function tokenizeExpression(source: string): ExprToken[] {
    const tokens: ExprToken[] = []
    let cursor = 0
    const length = source.length

    while (cursor < length) {
        let char = source[cursor]
        if (isWhitespace(char)) { cursor++; continue }

        if (char === '"' || char === "'") {
            const quote = char
            let str = ''
            cursor++
            while (cursor < length && source[cursor] !== quote) {
                str += source[cursor]
                cursor++
            }
            cursor++
            tokens.push({ type: 'String', value: str })
            continue
        }

        if (isDigit(char)) {
            let numStr = ''
            while (cursor < length && (isDigit(source[cursor]) || source[cursor] === '.')) {
                numStr += source[cursor]
                cursor++
            }
            tokens.push({ type: 'Number', value: parseFloat(numStr) })
            continue
        }

        if (isAlpha(char)) {
            let id = ''
            while (cursor < length && (isAlpha(source[cursor]) || isDigit(source[cursor]))) {
                id += source[cursor]
                cursor++
            }
            tokens.push({ type: 'Identifier', value: id })
            continue
        }

        if (char === '(' || char === ')' || char === '[' || char === ']' || char === '.' || char === ',' || char === ':') {
            tokens.push({ type: 'Punctuation', value: char })
            cursor++
            continue
        }

        const three = source.slice(cursor, cursor + 3)
        if (three === '===' || three === '!==') {
            tokens.push({ type: 'Operator', value: three })
            cursor += 3
            continue
        }

        const two = source.slice(cursor, cursor + 2)
        if (two === '==' || two === '!=' || two === '<=' || two === '>=') {
            tokens.push({ type: 'Operator', value: two })
            cursor += 2
            continue
        }

        if (char === '<' || char === '>' || char === '=' || char === '|') {
            tokens.push({ type: 'Operator', value: char })
            cursor++
            continue
        }

        throw new Error(`Unexpected character in expression at index ${cursor}: ${char}`)
    }

    return tokens
}

// ── Expression Parser ─────────────────────────────────────────────────────

export type ExprAST =
    | { type: 'Literal'; value: any }
    | { type: 'Identifier'; name: string }
    | { type: 'Member'; object: ExprAST; property: string | ExprAST; computed: boolean }
    | { type: 'Binary'; operator: string; left: ExprAST; right: ExprAST }
    | { type: 'Pipe'; base: ExprAST; name: string; args: ExprAST[] }

export function parseExpression(source: string): ExprAST {
    const tokens = tokenizeExpression(source)
    let pos = 0

    function peek(): ExprToken | null { return pos < tokens.length ? tokens[pos] : null }
    function consume(): ExprToken { return tokens[pos++] }

    function matchType(type: 'Identifier'): { type: 'Identifier', value: string } | null
    function matchType(type: 'Number'): { type: 'Number', value: number } | null
    function matchType(type: 'String'): { type: 'String', value: string } | null
    function matchType(type: ExprToken['type']): ExprToken | null {
        const p = peek(); if (p && p.type === type) return consume(); return null
    }
    function matchOp(op: string): ExprToken | null {
        const p = peek(); if (p && p.type === 'Operator' && p.value === op) return consume(); return null
    }
    function matchPunc(punc: string): ExprToken | null {
        const p = peek(); if (p && p.type === 'Punctuation' && p.value === punc) return consume(); return null
    }

    function parsePipe(): ExprAST {
        let base = parseEquality()
        while (matchOp('|')) {
            const id = matchType('Identifier')
            if (!id) throw new Error("Expected identifier after pipe '|'")
            const args: ExprAST[] = []
            if (matchPunc(':')) {
                args.push(parseEquality())
                while (matchPunc(',')) args.push(parseEquality())
            }
            base = { type: 'Pipe', base, name: id.value, args }
        }
        return base
    }

    function parseEquality(): ExprAST {
        let left = parsePrimary()
        while (true) {
            const p = peek()
            if (p && p.type === 'Operator' && ['===', '!==', '==', '!=', '<', '>', '<=', '>='].includes(p.value)) {
                const op = consume().value as string
                const right = parsePrimary()
                left = { type: 'Binary', operator: op, left, right }
            } else break
        }
        return left
    }

    function parseBase(): ExprAST {
        if (matchPunc('(')) {
            const expr = parsePipe()
            if (!matchPunc(')')) throw new Error("Expected ')'")
            return expr
        }
        const str = matchType('String')
        if (str) return { type: 'Literal', value: str.value }
        const num = matchType('Number')
        if (num) return { type: 'Literal', value: num.value }
        const id = matchType('Identifier')
        if (id) {
            if (id.value === 'true') return { type: 'Literal', value: true }
            if (id.value === 'false') return { type: 'Literal', value: false }
            if (id.value === 'null') return { type: 'Literal', value: null }
            if (id.value === 'undefined') return { type: 'Literal', value: undefined }
            return { type: 'Identifier', name: id.value }
        }
        throw new Error(`Unexpected token in expression: ${JSON.stringify(peek())}`)
    }

    function parsePrimary(): ExprAST {
        let expr = parseBase()
        while (true) {
            if (matchPunc('.')) {
                const prop = matchType('Identifier')
                if (!prop) throw new Error("Expected identifier after '.'")
                expr = { type: 'Member', object: expr, property: prop.value, computed: false }
            } else if (matchPunc('[')) {
                const computedProp = parsePipe()
                if (!matchPunc(']')) throw new Error("Expected ']'")
                expr = { type: 'Member', object: expr, property: computedProp, computed: true }
            } else break
        }
        return expr
    }

    const ast = parsePipe()
    if (pos < tokens.length) throw new Error(`Unexpected extra tokens in expression: ${JSON.stringify(tokens.slice(pos))}`)
    return ast
}

// ── Template Lexer ────────────────────────────────────────────────────────

export type TemplateToken =
    | { type: 'TEXT'; value: string }
    | { type: 'INTERPOLATION'; value: string }
    | { type: 'TAG'; name: string; inner: string | null }

export function tokenizeTemplate(source: string): TemplateToken[] {
    const tokens: TemplateToken[] = []
    let cursor = 0
    const length = source.length

    while (cursor < length) {
        const nextInterp = source.indexOf('{{', cursor)
        const nextTag = source.indexOf('@', cursor)

        let nextMatch = -1
        let isTag = false

        if (nextInterp !== -1 && nextTag !== -1) {
            if (nextTag < nextInterp) { nextMatch = nextTag; isTag = true }
            else { nextMatch = nextInterp }
        } else if (nextInterp !== -1) {
            nextMatch = nextInterp
        } else if (nextTag !== -1) {
            nextMatch = nextTag; isTag = true
        }

        if (nextMatch === -1) {
            tokens.push({ type: 'TEXT', value: source.slice(cursor) })
            break
        }

        // If we pushed up to before `@`, push that text.
        if (nextMatch > cursor) {
            tokens.push({ type: 'TEXT', value: source.slice(cursor, nextMatch) })
        }

        if (isTag) {
            cursor = nextMatch + 1
            let tagName = ''
            let tagLen = 0
            const sub = source.slice(cursor)

            if (sub.startsWith('else if')) { tagName = 'else if'; tagLen = 7 }
            else if (sub.startsWith('if')) { tagName = 'if'; tagLen = 2 }
            else if (sub.startsWith('else')) { tagName = 'else'; tagLen = 4 }
            else if (sub.startsWith('endif')) { tagName = 'endif'; tagLen = 5 }
            else if (sub.startsWith('for')) { tagName = 'for'; tagLen = 3 }
            else if (sub.startsWith('endfor')) { tagName = 'endfor'; tagLen = 6 }
            else if (sub.startsWith('const')) { tagName = 'const'; tagLen = 5 }

            let isValidTag = false
            if (tagName !== '') {
                const nextChar = sub[tagLen]
                // Valid boundaries: whitespace, newline, or a parenthesis
                if (nextChar === undefined || nextChar === ' ' || nextChar === '\t' || nextChar === '\n' || nextChar === '\r' || nextChar === '(') {
                    isValidTag = true
                }
            }

            if (!isValidTag) {
                // False positive `@` (e.g. email, JSON-LD @context). Push `@` as text and resume.
                tokens.push({ type: 'TEXT', value: '@' })
                continue
            }

            cursor += tagLen
            while (cursor < length && (source[cursor] === ' ' || source[cursor] === '\t')) cursor++

            let inner: string | null = null
            if (tagName === 'if' || tagName === 'else if' || tagName === 'for') {
                if (source[cursor] !== '(') throw new Error(`Expected '(' after @${tagName}`)
                cursor++
                let depth = 1
                let startInner = cursor
                let inString: string | null = null
                while (cursor < length && depth > 0) {
                    const c = source[cursor]
                    if (inString) {
                        if (c === inString) inString = null
                    } else {
                        if (c === '"' || c === "'") inString = c
                        else if (c === '(') depth++
                        else if (c === ')') depth--
                    }
                    cursor++
                }
                if (depth > 0) throw new Error(`Unclosed '(' in @${tagName}`)
                inner = source.slice(startInner, cursor - 1)
            } else if (tagName === 'const') {
                let startInner = cursor
                while (cursor < length && source[cursor] !== '\n') cursor++
                inner = source.slice(startInner, cursor).trim()
            }

            if (source[cursor] === '\n') cursor++
            else if (source[cursor] === '\r' && source[cursor + 1] === '\n') cursor += 2

            tokens.push({ type: 'TAG', name: tagName, inner })
        } else {
            cursor = nextMatch + 2
            let startInner = cursor
            let inString: string | null = null
            while (cursor < length) {
                const c = source[cursor]
                const next = source[cursor + 1]
                if (inString) {
                    if (c === inString) inString = null
                    cursor++
                } else {
                    if (c === '"' || c === "'") { inString = c; cursor++ }
                    else if (c === '}' && next === '}') break
                    else cursor++
                }
            }
            if (cursor >= length) throw new Error("Unclosed interpolation")
            const expr = source.slice(startInner, cursor).trim()
            cursor += 2
            tokens.push({ type: 'INTERPOLATION', value: expr })
        }
    }
    return tokens
}

// ── Template Parser ───────────────────────────────────────────────────────

export type ASTNode =
    | { type: 'TEXT'; content: string }
    | { type: 'INTERPOLATION'; expression: ExprAST }
    | { type: 'CONST'; name: string; expression: ExprAST }
    | { type: 'IF'; condition: ExprAST; consequence: ASTNode[]; alternate: ASTNode[] | null }
    | { type: 'FOR'; itemName: string; listExpression: ExprAST; body: ASTNode[] }

export function parseTemplate(tokens: TemplateToken[]): ASTNode[] {
    let pos = 0
    function parseBlock(stopTags: string[]): ASTNode[] {
        const nodes: ASTNode[] = []
        while (pos < tokens.length) {
            const token = tokens[pos]
            if (token.type === 'TAG' && stopTags.includes(token.name)) break
            pos++
            if (token.type === 'TEXT') {
                nodes.push({ type: 'TEXT', content: token.value })
            } else if (token.type === 'INTERPOLATION') {
                nodes.push({ type: 'INTERPOLATION', expression: parseExpression(token.value) })
            } else if (token.type === 'TAG') {
                nodes.push(parseTagNode(token))
            }
        }
        return nodes
    }

    function parseTagNode(token: { type: 'TAG', name: string, inner: string | null }): ASTNode {
        if (token.name === 'if') {
            if (!token.inner) throw new Error("Missing condition for @if")
            const condition = parseExpression(token.inner)
            const consequence = parseBlock(['else if', 'else', 'endif'])
            let alternate: ASTNode[] | null = null
            if (pos < tokens.length) {
                const stopToken = tokens[pos] as { type: 'TAG', name: string, inner: string | null }
                if (stopToken.name === 'else if') {
                    pos++
                    stopToken.name = 'if'
                    alternate = [parseTagNode(stopToken)]
                } else if (stopToken.name === 'else') {
                    pos++
                    alternate = parseBlock(['endif'])
                    pos++
                } else if (stopToken.name === 'endif') {
                    pos++
                }
            }
            return { type: 'IF', condition, consequence, alternate }
        }
        if (token.name === 'for') {
            if (!token.inner) throw new Error("Missing params for @for")
            const matchIndex = token.inner.indexOf(' of ')
            if (matchIndex === -1) throw new Error(`Missing ' of ' in @for: ${token.inner}`)
            const itemName = token.inner.slice(0, matchIndex).trim()
            const listExpressionStr = token.inner.slice(matchIndex + 4)
            const listExpression = parseExpression(listExpressionStr)
            const body = parseBlock(['endfor'])
            pos++
            return { type: 'FOR', itemName, listExpression, body }
        }
        if (token.name === 'const') {
            if (!token.inner) throw new Error("Missing params for @const")
            const eqIndex = token.inner.indexOf('=')
            if (eqIndex === -1) throw new Error(`Malformed @const, missing '=' in: ${token.inner}`)
            const name = token.inner.slice(0, eqIndex).trim()
            if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name)) {
                throw new Error(`Malformed @const, invalid identifier: ${name}`)
            }
            const exprStr = token.inner.slice(eqIndex + 1).trim()
            return { type: 'CONST', name, expression: parseExpression(exprStr) }
        }
        throw new Error(`Unexpected block tag: @${token.name}`)
    }
    return parseBlock([])
}

// ── Evaluator ─────────────────────────────────────────────────────────────

export function evaluateExprAST(ast: ExprAST, context: Context, pipes: PipeRegistry = {}): any {
    switch (ast.type) {
        case 'Literal':
            return ast.value
        case 'Identifier':
            return context[ast.name]
        case 'Member': {
            const obj = evaluateExprAST(ast.object, context, pipes)
            if (obj == null) return undefined
            const prop = ast.computed ? evaluateExprAST(ast.property as ExprAST, context, pipes) : ast.property as string
            return obj[prop]
        }
        case 'Binary': {
            const left = evaluateExprAST(ast.left, context, pipes)
            const right = evaluateExprAST(ast.right, context, pipes)
            switch (ast.operator) {
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
        case 'Pipe': {
            let base = evaluateExprAST(ast.base, context, pipes)
            const fn = pipes[ast.name]
            if (!fn) throw new Error(`Unknown pipe: ${ast.name}`)
            const args = ast.args.map(a => evaluateExprAST(a, context, pipes))
            return fn(base, ...args)
        }
    }
}

export function evaluateTemplate(nodes: ASTNode[], context: Context, pipes: PipeRegistry = {}): string {
    let output = ''
    const localContext = { ...context }

    for (const node of nodes) {
        switch (node.type) {
            case 'TEXT':
                output += node.content
                break
            case 'INTERPOLATION': {
                const val = evaluateExprAST(node.expression, localContext, pipes)
                output += (val == null ? '' : String(val))
                break
            }
            case 'CONST':
                if (Object.prototype.hasOwnProperty.call(localContext, node.name)) {
                    throw new Error(`TemplateError: Cannot shadow or redefine constant '${node.name}'`)
                }
                localContext[node.name] = evaluateExprAST(node.expression, localContext, pipes)
                break
            case 'IF': {
                const condValue = evaluateExprAST(node.condition, localContext, pipes)
                if (condValue) {
                    output += evaluateTemplate(node.consequence, localContext, pipes)
                } else if (node.alternate) {
                    output += evaluateTemplate(node.alternate, localContext, pipes)
                }
                break
            }
            case 'FOR': {
                const listValue = evaluateExprAST(node.listExpression, localContext, pipes)
                if (Array.isArray(listValue)) {
                    for (const item of listValue) {
                        const loopContext = { ...localContext, [node.itemName]: item }
                        output += evaluateTemplate(node.body, loopContext, pipes)
                    }
                }
                break
            }
        }
    }
    return output
}

export function render(templateStr: string, context: Context, pipes: PipeRegistry = {}): string {
    const tokens = tokenizeTemplate(templateStr)
    const ast = parseTemplate(tokens)
    return evaluateTemplate(ast, context, pipes)
}
