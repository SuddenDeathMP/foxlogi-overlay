import type { ThemeConfig } from 'antd'

/** Background for artillery panels/popups: 80% opaque (the shared graphite
 *  surfaces are 55–60%). Keep in sync with `.arty-zone` in overlay.css. */
export const ARTY_SURFACE = 'rgba(18, 21, 25, 0.8)'

/** Fill for full-screen surfaces that must take the mouse. Windows hit-tests
 *  the transparent window per pixel: alpha-0 pixels pass clicks to the game
 *  even while the window is interactive. 0.01 (~3/255) is invisible. */
export const HIT_FILL = 'rgba(0, 0, 0, 0.01)'

/** Scoped theme for the artillery UI. Nested under the app's ConfigProvider, so
 *  it only swaps the popup backgrounds (dropdown menus + submenus, selects,
 *  popconfirms) and inherits everything else. */
export const ARTY_THEME: ThemeConfig = {
  token: { colorBgElevated: ARTY_SURFACE },
  components: { Select: { colorBgElevated: ARTY_SURFACE } }
}
