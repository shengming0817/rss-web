import type { NavigationMessageKey } from './navigation'

const home: NavigationMessageKey = 'navigation.home'
void home

const about: NavigationMessageKey = 'navigation.about'
void about

// @ts-expect-error Navigation metadata cannot reference an absent locale key.
const missing: NavigationMessageKey = 'navigation.secretCatalog'
void missing
