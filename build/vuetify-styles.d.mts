import type { Plugin } from 'vite'
import type { ThemeDefinition } from 'vuetify'
export const neutralThemes: Record<string, ThemeDefinition>
export function vuetifyStyles(scope: string, themes?: Record<string, ThemeDefinition>): Plugin
