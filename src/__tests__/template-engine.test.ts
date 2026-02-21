import { render } from '../template-engine'

describe('Template Engine', () => {
  it('renders text only', () => {
    const tpl = 'Hello world'
    expect(render(tpl, {})).toBe('Hello world')
  })

  it('handles interpolation & implicit safe chaining', () => {
    const tpl = 'Hello {{ user.profile.name }}!'
    const ctx = { user: { profile: { name: 'Alice' } } }
    expect(render(tpl, ctx)).toBe('Hello Alice!')

    // Safe chaining
    const ctxBad = {}
    expect(render(tpl, ctxBad)).toBe('Hello !')
  })

  it('applies pipes correctly', () => {
    const tpl = 'Hello {{ name | upper }} - {{ num | add: "5" }}'
    const ctx = { name: 'bob', num: 10 }
    const pipes = {
      upper: (val: string) => val.toUpperCase(),
      add: (val: number, amt: string) => val + Number(amt)
    }
    expect(render(tpl, ctx, pipes)).toBe('Hello BOB - 15')
  })

  it('evaluates @if / @else if / @else', () => {
    const tpl = `
@if (user.isAdmin)
Admin
@else if (user.isGuest === "yes")
Guest
@else if (user.age > 18)
Adult
@else
User
@endif
`.trim()

    expect(render(tpl, { user: { isAdmin: true } }).trim()).toBe('Admin')
    expect(render(tpl, { user: { isGuest: "yes" } }).trim()).toBe('Guest')
    expect(render(tpl, { user: { age: 20 } }).trim()).toBe('Adult')
    expect(render(tpl, { user: { age: 10 } }).trim()).toBe('User')
  })

  it('runs @for loops', () => {
    const tpl = `
@for (item of items)
- {{ item.name }}
@endfor
`.trim()

    const ctx = { items: [{ name: 'A' }, { name: 'B' }] }
    expect(render(tpl, ctx).trim()).toBe('- A\n- B')
  })

  it('supports @const block-level scoping', () => {
    const tpl = `
@const a = 1
@if (true)
@const b = 2
{{ a }} - {{ b }}
@endif
@if (true)
@const b = 3
{{ a }} - {{ b }}
@endif
`.trim()

    const ctx = {}
    expect(render(tpl, ctx).trim()).toBe('1 - 2\n1 - 3')
  })

  it('executes complex battle test (Nested @for, @if, @const, Pipes)', () => {
    const tpl = `
@const roleName = user.role
@if (user.isActive)
  @for (project of user.projects)
    @const projectStatus = project.status
    @if (projectStatus === "active")
      Active Project [{{ roleName | upper | prefix: ">> " }}]: {{ project.name }}
      @for (task of project.tasks)
         - {{ task.title }} ({{ task.priority | upper }})
      @endfor
    @else if (projectStatus === "archived")
      Archived Project [{{ roleName | upper }}]: {{ project.name }}
    @else
      Unknown Project Status
    @endif
  @endfor
@else
  Inactive User
@endif
`.trim()

    const ctx = {
      user: {
        isActive: true,
        role: 'engineer',
        projects: [
          {
            name: 'Relay Engine',
            status: 'active',
            tasks: [
              { title: 'Write lexer', priority: 'high' },
              { title: 'Write parser', priority: 'medium' }
            ]
          },
          {
            name: 'Old Project',
            status: 'archived',
            tasks: []
          }
        ]
      }
    }

    const pipes = {
      upper: (val: string) => val.toUpperCase(),
      prefix: (val: string, p: string) => p + val
    }

    const expected = `
      Active Project [>> ENGINEER]: Relay Engine
      
         - Write lexer (HIGH)
      
         - Write parser (MEDIUM)
      
    
      Archived Project [ENGINEER]: Old Project
    `.replace(/^\s+/gm, '').trim()

    const result = render(tpl, ctx, pipes).replace(/^\s+/gm, '').trim()
    expect(result).toBe(expected)
  })

  it('handles edge cases with empty lists and nested object paths', () => {
    const tpl = `
@if (user.isNotSet)
  Should not render
@else if (user.count === 0)
  Zero Count: {{ user.metadata.tags[0] }}
@endif
@for (item of emptyList)
  Should not render
@endfor
Done
`.trim()

    const ctx = { user: { count: 0, metadata: { tags: ['admin'] } }, emptyList: [] }
    expect(render(tpl, ctx).trim()).toBe('Zero Count: admin\nDone')
  })

  it('Deep nesting, parallel scopes, falsy values, pipe chains', () => {
    const tpl = `
@const globalPrefix = ">>"
@if (payload.isValid === false)
  Payload Invalid. Error: {{ payload.error | upper }}
@else
  @for (org of payload.organizations)
    ORGANIZATION: {{ org.name }}
    @const orgStatus = org.isActive
    @if (orgStatus)
      @const memberCount = org.members.length
      @if (memberCount === 0)
        No members in active org.
      @else
        Members ({{ memberCount }}):
        @for (member of org.members)
          @const prefix = globalPrefix | concat: " " | concat: member.role
          @if (member.isBanned)
            [BANNED] {{ prefix }} - {{ member.name }}
          @else if (member.age < 18)
            [MINOR] {{ prefix }} - {{ member.name }}
          @else
            [ACTIVE] {{ prefix }} - {{ member.name }} | Data: {{ member.deep.missing.path.shouldNotCrash }}
          @endif
        @endfor
      @endif
    @else
      Organization {{ org.name }} is INACTIVE.
    @endif
    ---
  @endfor
@endif
`.trim()

    const ctx = {
      payload: {
        isValid: true,
        error: null,
        organizations: [
          {
            name: 'Alpha Corp',
            isActive: false,
            members: []
          },
          {
            name: 'Beta LLC',
            isActive: true,
            members: []
          },
          {
            name: 'Gamma Inc',
            isActive: true,
            members: [
              { name: 'Alice', role: 'ADMIN', isBanned: false, age: 30, deep: {} },
              { name: 'Bob', role: 'USER', isBanned: true, age: 25 },
              { name: 'Charlie', role: 'GUEST', isBanned: false, age: 16 }
            ]
          }
        ]
      }
    }

    const pipes = {
      upper: (val: string) => val ? val.toUpperCase() : '',
      concat: (val: string, extra: string) => val + extra
    }

    const expected = `
ORGANIZATION: Alpha Corp
Organization Alpha Corp is INACTIVE.
---
ORGANIZATION: Beta LLC
No members in active org.
---
ORGANIZATION: Gamma Inc
Members (3):
[ACTIVE] >> ADMIN - Alice | Data: 
[BANNED] >> USER - Bob
[MINOR] >> GUEST - Charlie
---
    `.trim().replace(/^\s+/gm, '')

    const result = render(tpl, ctx, pipes).trim().replace(/^\s+/gm, '')
    expect(result).toBe(expected)
  })

  it('Resilience against malformed tokens (throws correctly or ignores)', () => {
    const unclosedTpl = 'Hello {{ user.name'
    expect(() => render(unclosedTpl, {})).toThrow(/Unclosed interpolation/)

    const malformedConst = '@const user.name = "bob"'
    expect(() => render(malformedConst, {})).toThrow(/Malformed @const/)

    const badPipe = '{{ user.name | unknownPipe }}'
    expect(() => render(badPipe, { user: { name: 'bob' } })).toThrow(/Unknown pipe: unknownPipe/)

    // Shadowing constant should throw
    const shadowTpl = `
@const a = 1
@const a = 2
`
    expect(() => render(shadowTpl, {})).toThrow(/Cannot shadow or redefine constant 'a'/)
  })

  it('Extreme Edge Cases & Parser Torment', () => {
    // 1. Whitespace Chaos
    const tpl1 = `
@if       ( 
  user . age 
  === 
  20 
  )
Yes
@endif`.trim()
    expect(render(tpl1, { user: { age: 20 } }).trim()).toBe('Yes')

    // 2. Computed Properties with crazy names
    const tpl2 = `{{ data["crazy-key-with space"] }}`
    expect(render(tpl2, { data: { "crazy-key-with space": "works" } })).toBe('works')

    // 3. String literals containing template syntax (Lexer should not interpolate inner strings)
    const tpl3 = `{{ "{{ not an interpolation }}" }}`
    expect(render(tpl3, {})).toBe('{{ not an interpolation }}')

    // 4. Dangling blocks
    expect(() => render('@else', {})).toThrow(/Unexpected block tag: @else/)
    expect(() => render('@endif', {})).toThrow(/Unexpected block tag: @endif/)
    expect(() => render('@endfor', {})).toThrow(/Unexpected block tag: @endfor/)
  })

  it('The Unhandled JS Idioms (Breaking the engine!)', () => {
    // These are scenarios I know the strict Lexer cannot handle yet because they are complex JS idioms

    // 1. Escaped Quotes inside strings: The lexer will stop at the first internal quote.
    const tplEscaped = `{{ "He said \\"Hello\\"" }}`
    expect(() => render(tplEscaped, {})).toThrow()

    // 2. Negative Numbers: Lexer only recognizes digits, not the minus operator as part of a number or unary.
    const tplNegative = `@const temp = -10`
    expect(() => render(tplNegative, {})).toThrow(/Unexpected character in expression.*-/)

    // 3. Unary Operators (boolean NOT):
    const tplUnary = `@if (!user.isActive) \n inactive \n @endif`
    expect(() => render(tplUnary, { user: { isActive: false } })).toThrow(/Unexpected character in expression.*!/)

    // 4. Unorthodox 'of' usage in @for loops
    const tplForOf = `@for (item of ["string of doom", "other"]) \n {{ item }} \n @endfor`
    // Throws because our strict expression parser intentionally does not support Array literals `[`
    expect(() => render(tplForOf, {})).toThrow()

    // It works because indexOf(' of ') finds the first instance, but what if the item name has "of" with spaces around it?
    // User names a variable `list of things`. Invalid identifier but interesting break!
    expect(() => render(`@for (list of things of items)`, {})).toThrow()
  })

  it('False positives and overlapping data structures', () => {
    // 1. JSON-LD and Emails (False positive tags)
    // The engine must NOT crash when encountering `@context`, `@id`, `user@email.com`, or `@iframe`.
    const tpl1 = `{
  "@context": "https://json-ld.org/contexts/person.jsonld",
  "@id": "http://dbpedia.org/resource/John_Lennon",
  "email": "john@beatles.com",
  "handle": "@johnlennon",
  "tagLike": "@iframe width=100"
}`
    expect(render(tpl1, {})).toBe(tpl1)

    // 2. Data that generates another template (Template Inception)
    const tpl2 = `
@const open = "{{"
@const close = "}}"
Code: {{ open }} user.name {{ close }}
`.trim()
    expect(render(tpl2, {})).toBe('Code: {{ user.name }}')

    // 3. String literals containing structural AST tokens
    const tpl3 = `
@if (user.status === "ACTIVE (ignore this)")
  @const message = "Status is: @if(true) nested @endif"
  {{ message }}
@endif
`.trim()
    expect(render(tpl3, { user: { status: "ACTIVE (ignore this)" } }).trim()).toBe("Status is: @if(true) nested @endif")
  })
})
