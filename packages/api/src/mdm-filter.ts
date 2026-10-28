/** Syntax only for rss-mdm's bounded RSQL dialect. No field binding or matching. */
export type Filter =
  | { kind: 'compare'; field: string; operator: string; values: string[] }
  | { kind: 'and' | 'or'; children: Filter[] }
export const filterOperators = [
  '==',
  '!=',
  '=lt=',
  '=le=',
  '=gt=',
  '=ge=',
  '=in=',
  '=out=',
  '=icontains=',
  '=contains=',
  '=notcontains=',
  '=containsany=',
  '=containsall=',
  '=isnull=',
  '=isnotnull=',
] as const
const sets = new Set(['=in=', '=out=', '=containsany=', '=containsall='])
const bytes = (text: string) => new TextEncoder().encode(text).length

export function parseFilter(input: string): Filter {
  if (!input || bytes(input) > 8192) throw new Error('Invalid filter budget')
  let offset = 0,
    nodes = 0,
    setItems = 0
  const eat = (character: string) => {
    if (!input.startsWith(character, offset)) return false
    offset += character.length
    return true
  }
  function value(): string {
    const quote = ['"', "'"].includes(input[offset] ?? '') ? input[offset++] : undefined
    let text = '',
      closed = quote === undefined
    while (offset < input.length) {
      let c = input[offset]!
      if (quote === c) {
        offset++
        closed = true
        break
      }
      if (!quote && ',;)'.includes(c)) break
      offset++
      if (c === '\\') {
        c = input[offset++] ?? ''
        if (!c || !'\\\'",;()'.includes(c)) throw new Error('Invalid escape')
      } else if (!quote && (/\s/.test(c) || '(\'"=!<>*'.includes(c)))
        throw new Error('Invalid operand')
      if (c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127) throw new Error('Invalid operand')
      text += c
      if (bytes(text) > 1024) throw new Error('Invalid operand budget')
    }
    if (!closed || (!quote && !text)) throw new Error('Invalid operand')
    return text
  }
  function node() {
    if (++nodes > 128) throw new Error('Invalid filter budget')
  }
  function expression(precedence: number, depth: number): Filter {
    if (depth > 16) throw new Error('Invalid filter depth')
    if (precedence < 2) {
      const first = expression(precedence + 1, depth)
      const separator = precedence === 0 ? ',' : ';'
      if (!eat(separator)) return first
      node()
      const children = [first]
      do {
        children.push(expression(precedence + 1, depth))
      } while (eat(separator))
      return { kind: precedence === 0 ? 'or' : 'and', children }
    }
    if (eat('(')) {
      const inner = expression(0, depth + 1)
      if (!eat(')')) throw new Error('Unclosed filter')
      return inner
    }
    node()
    const field = input.slice(offset).match(/^[A-Za-z0-9_.]{1,128}/)?.[0]
    if (!field) throw new Error('Invalid selector')
    offset += field.length
    const operator = filterOperators.find((op) => input.startsWith(op, offset))
    if (!operator) throw new Error('Invalid operator')
    offset += operator.length
    const values: string[] = []
    if (sets.has(operator)) {
      if (!eat('(')) throw new Error('Invalid set')
      do {
        if (values.length >= 64 || ++setItems > 256) throw new Error('Invalid set budget')
        values.push(value())
        if (eat(')')) return { kind: 'compare', field, operator, values }
      } while (eat(','))
      throw new Error('Unclosed set')
    }
    return { kind: 'compare', field, operator, values: [value()] }
  }
  const result = expression(0, 0)
  if (offset !== input.length) throw new Error('Invalid filter suffix')
  return result
}

export function formatFilter(filter: Filter): string {
  function format(node: Filter, depth: number): string {
    if (depth > 16) throw new Error('Invalid filter depth')
    if (node.kind !== 'compare') {
      if (!node.children.length) throw new Error('Incomplete condition')
      return (
        '(' +
        node.children
          .map((child) => format(child, depth + 1))
          .join(node.kind === 'and' ? ';' : ',') +
        ')'
      )
    }
    if (!filterOperators.includes(node.operator as (typeof filterOperators)[number]))
      throw new Error('Invalid operator')
    const values = node.values.map((v) => `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`)
    if (sets.has(node.operator)) return `${node.field}${node.operator}(${values.join(',')})`
    if (values.length !== 1) throw new Error('Invalid operands')
    return `${node.field}${node.operator}${values[0]}`
  }
  const text = format(filter, 0)
  parseFilter(text)
  return text
}
