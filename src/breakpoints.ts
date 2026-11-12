/**
 * The three width breakpoints styles.css uses, for the places script has to agree with it.
 * Keep in step with the media queries there; styles.tokens.test.ts checks the CSS side.
 *
 * - Phone: up to 640px.
 * - Mobile presentation: up to 767px, plus landscape phones up to 980px wide and 480px tall.
 * - Desktop: from 1100px.
 */
export const PHONE_QUERY = '(max-width: 640px)'
export const MOBILE_QUERY = '(max-width: 767px), (min-width: 768px) and (max-width: 980px) and (max-height: 480px) and (orientation: landscape) and (hover: none) and (pointer: coarse)'
/** Wide enough for the sidebar to start expanded (audit 3 PR 06). Script only: CSS draws whichever state the sidebar is in. */
export const SIDEBAR_WIDE_QUERY = '(min-width: 1280px)'
