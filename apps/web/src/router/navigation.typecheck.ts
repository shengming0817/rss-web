import type { NavigationMessageKey } from './navigation'

const home: NavigationMessageKey = 'navigation.home'
void home

// @ts-expect-error Navigation metadata cannot reference an absent locale key.
const missing: NavigationMessageKey = 'navigation.secretCatalog'
void missing
