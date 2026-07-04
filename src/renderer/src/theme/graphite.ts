import { theme } from 'antd'

// Vendored snapshot of the web app's frontend/src/themes/graphite.js.
// Keep in sync manually — this is a one-shot copy, not a live import.

// ---- Raw palette ----
export const C = {
  bg0: 'rgba(12,14,17,0.85)',
  bg1: 'rgba(18,21,25,0.85)',
  bg2: 'rgba(24,28,33,0.55)',
  bg3: 'rgba(31,36,42,0.8)',
  bgHover: '#262c33',

  line1: 'rgba(36,42,49,0.8)',
  line2: 'rgba(47,54,63,0.8)',

  text1: '#ecedef',
  text2: '#a8adb4',
  text3: '#6a7078',
  text4: '#494f57',

  accent: '#e0b070',
  accentHover: '#ecc388',
  accentActive: '#c8975c',
  accentWeak: 'rgba(224,176,112,.14)',
  accentLine: 'rgba(224,176,112,.32)',

  positive: '#6fc59b',
  warning: '#e3b26a',
  danger: '#e87d7d',
  info: '#6aa7ff',
  thirdPriority: '#c772bc'
}

const SYSTEM_FONT =
  "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
const SYSTEM_MONO =
  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace"

export const graphiteTheme = {
  algorithm: theme.darkAlgorithm,
  token: {
    colorPrimary: C.accent,
    colorInfo: C.info,
    colorSuccess: C.positive,
    colorWarning: C.warning,
    colorError: C.danger,

    colorBgBase: C.bg0,
    colorBgLayout: C.bg0,
    colorBgContainer: C.bg2,
    colorBgElevated: C.bg2,
    colorBgSpotlight: C.bg3,

    colorText: C.text1,
    colorTextSecondary: C.text2,
    colorTextTertiary: C.text3,
    colorTextQuaternary: C.text4,
    colorTextDescription: C.text3,
    colorTextPlaceholder: C.text4,
    colorTextHeading: C.text1,
    colorTextLabel: C.text2,
    colorTextDisabled: C.text4,

    colorBorder: C.line2,
    colorBorderSecondary: C.line1,
    colorSplit: C.line1,

    colorFill: 'rgba(255,255,255,0.08)',
    colorFillSecondary: 'rgba(255,255,255,0.05)',
    colorFillTertiary: 'rgba(255,255,255,0.03)',
    colorFillQuaternary: 'rgba(255,255,255,0.02)',

    fontFamily: SYSTEM_FONT,
    fontFamilyCode: SYSTEM_MONO,
    fontSize: 13,
    fontSizeSM: 12,
    fontSizeLG: 15,
    fontSizeXL: 17,
    fontSizeHeading1: 28,
    fontSizeHeading2: 22,
    fontSizeHeading3: 18,
    fontSizeHeading4: 15,
    fontSizeHeading5: 13,
    lineHeight: 1.55,

    borderRadius: 6,
    borderRadiusLG: 10,
    borderRadiusSM: 4,
    borderRadiusXS: 3,

    motionDurationFast: '0.08s',
    motionDurationMid: '0.15s',
    motionDurationSlow: '0.22s',

    controlHeight: 32,
    controlHeightSM: 28,
    controlHeightLG: 38,

    padding: 16,
    paddingLG: 22,
    paddingMD: 18,
    paddingSM: 12,
    paddingXS: 8,

    boxShadow: '0 1px 2px rgba(0,0,0,0.3), 0 4px 12px rgba(0,0,0,0.35)',
    boxShadowSecondary: '0 1px 2px rgba(0,0,0,0.25), 0 6px 16px rgba(0,0,0,0.4)',
    boxShadowTertiary: '0 1px 2px rgba(0,0,0,0.2)',

    colorLink: C.accent,
    colorLinkHover: C.accentHover,
    colorLinkActive: C.accentActive,

    controlItemBgHover: C.bg3,
    controlItemBgActive: C.accentWeak,
    controlItemBgActiveHover: 'rgba(224,176,112,.22)'
  },
  components: {
    Button: {
      defaultColor: C.text2,
      defaultBorderColor: C.line2,
      defaultHoverBg: C.bg3,
      defaultHoverColor: C.text1,
      defaultHoverBorderColor: C.line2,
      primaryColor: '#1a130a',
      primaryShadow: 'none',
      dangerShadow: 'none',
      defaultShadow: 'none',
      paddingInline: 14,
      paddingInlineSM: 10,
      fontWeight: 500,
      borderRadius: 6
    },
    Input: {
      activeBg: C.bg3,
      hoverBg: C.bg3,
      colorBgContainer: C.bg1,
      hoverBorderColor: C.line2,
      activeBorderColor: C.accent,
      activeShadow: `0 0 0 2px ${C.accentWeak}`,
      paddingBlock: 6,
      paddingInline: 12
    },
    Select: {
      selectorBg: C.bg1,
      optionSelectedBg: C.accentWeak,
      optionActiveBg: C.bg3,
      colorBorder: C.line2,
      colorBgElevated: C.bg1
    },
    Card: {
      colorBgContainer: C.bg2,
      headerBg: 'transparent',
      headerFontSize: 14,
      headerHeight: 40,
      paddingLG: 16,
      padding: 12
    },
    Modal: {
      contentBg: C.bg2,
      headerBg: C.bg2,
      footerBg: C.bg2,
      titleColor: C.text1,
      titleFontSize: 16,
      borderRadiusLG: 12
    },
    Tooltip: {
      colorBgSpotlight: C.bgHover,
      colorTextLightSolid: C.text1,
      borderRadius: 6
    },
    Tabs: {
      itemColor: C.text2,
      itemHoverColor: C.text1,
      itemSelectedColor: C.text1,
      itemActiveColor: C.text1,
      inkBarColor: C.accent,
      cardBg: C.bg1,
      horizontalItemGutter: 16,
      titleFontSize: 13
    },
    Tag: { defaultBg: C.bg3, defaultColor: C.text2, borderRadiusSM: 4 },
    Segmented: {
      itemColor: C.text2,
      itemHoverColor: C.text1,
      itemSelectedBg: C.bg3,
      itemSelectedColor: C.text1,
      trackBg: C.bg1,
      trackPadding: 2,
      borderRadius: 7
    },
    Progress: { defaultColor: C.accent, remainingColor: C.line1, circleTextColor: C.text1 },
    Empty: { colorText: C.text3 }
  }
}

export default graphiteTheme
