// styled-components v6 ships its own types with an empty DefaultTheme;
// merge in the app theme so `props.theme.*` is typed in interpolations.
import type { Theme } from '../augment/themes'

declare module 'styled-components' {
  export interface DefaultTheme extends Theme {}
}
