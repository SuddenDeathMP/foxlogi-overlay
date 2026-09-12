import type { ThemeConfig } from 'antd'

/** Background for artillery panels/popups: 80% opaque (the shared graphite
 *  surfaces are 55–60%). Keep in sync with `.arty-zone` in overlay.css. */
export const ARTY_SURFACE = 'rgba(18, 21, 25, 0.8)'

/** Scoped theme for the artillery UI. Nested under the app's ConfigProvider, so
 *  it only swaps the popup backgrounds (dropdown menus + submenus, selects,
 *  popconfirms) and inherits everything else. */
export const ARTY_THEME: ThemeConfig = {
  token: { colorBgElevated: ARTY_SURFACE },
  components: { Select: { colorBgElevated: ARTY_SURFACE } }
}
