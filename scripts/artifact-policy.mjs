const SCRIPT_START_TAG = /<script\b([^>]*)>/gi
const ATTRIBUTE = /(?:^|\s)([^\s=/>]+)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?/g
const EXTERNAL_FONT_ORIGIN = /(?:https?:)?\/\/(?:fonts\.googleapis\.com|fonts\.gstatic\.com)\b/i

function attributeNames(fragment) {
  return [...fragment.matchAll(ATTRIBUTE)].map((match) => match[1].toLowerCase())
}

export function findInlineScriptTags(html) {
  return [...html.matchAll(SCRIPT_START_TAG)]
    .filter((match) => !attributeNames(match[1]).includes('src'))
    .map((match) => match[0])
}

export function containsExternalFontOrigin(content) {
  return EXTERNAL_FONT_ORIGIN.test(content)
}
