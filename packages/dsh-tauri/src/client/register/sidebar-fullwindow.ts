import type { RegisterController } from './index'
/**
 * register/sidebar-fullwindow.ts — 右栏「在新窗口全屏打开」：
 *
 * 官方没有对外暴露全屏命令，右栏 chrome 也没有插槽，只能落在界面上现成的那两枚控件上：
 * 在全屏按钮左侧注入一枚同风格按钮，点击走宿主的 `create_app_window` 并带上
 * `presentation=full-sidebar`；带该标记的窗口启动后把右列展开、切进全屏，全屏按钮随即
 * 隐藏（窗口形态由壳层的 `full-sidebar-navbar` 承载）。
 *
 * 用 DOM 注入而不是 React 组件：chrome 由官方包渲染且不接受外部插槽，`data-sidebar-right-*`
 * 稳定属性比生成的 CSS module 类名可靠。
 */
import { PLUGIN_ID } from '../../shared/constants'
import { CssRender } from '../modules/css-render'
import { invoke } from '../service/invoke'
import { reportPluginError } from '../utils/error'
import { defineRegister } from './index'

/** 注入按钮的标记属性（幂等判断与样式选择器共用）。 */
const OPEN_WINDOW_ATTRIBUTE = 'data-dsh-tauri-open-window'

/** 全屏切换按钮：它的存在说明右栏已挂载，值是 `fullscreen` 表示还没全屏。 */
const FULLSCREEN_SELECTOR = '[data-sidebar-right-mode]'

/** 折叠态轨上的展开按钮。 */
const EXPAND_SELECTOR = '[data-sidebar-right-expand]'

/** 右栏根节点：携带本栏所属会话 id。 */
const SESSION_SELECTOR = '[data-sidebar-right-session]'

/** 全屏形态窗口的根标记：隐藏全屏按钮，也是壳层判定窗口形态的依据。 */
export const FULL_SIDEBAR_ATTRIBUTE = 'data-dsh-tauri-full-sidebar'

/** 建窗载荷里的窗口形态（与 `src-tauri/src/desktop/window.rs` 逐字一致）。 */
export const PRESENTATION_FULL_SIDEBAR = 'full-sidebar'

const STYLE_ID = 'dsh-tauri:sidebar-fullwindow'
const PRESENT_POLL_MS = 250
const PRESENT_MAX_TICKS = 120

/** 官方字形风格：16×16 描边图标。 */
const ICON = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M9.5 2.5H13C13.2761 2.5 13.5 2.72386 13.5 3V6.5" stroke="currentColor"/><path d="M13.1 2.9L8.5 7.5" stroke="currentColor"/><path d="M12 9.5V13C12 13.2761 11.7761 13.5 11.5 13.5H3C2.72386 13.5 2.5 13.2761 2.5 13V3C2.5 2.72386 2.72386 2.5 3 2.5H6.5" stroke="currentColor"/></svg>'

/** 按钮文案跟随官方按钮的语言：官方全屏按钮只有中英两种。 */
function buttonLabel(mode: Element): string {
  return /[\u4E00-\u9FA5]/.test(mode.getAttribute('aria-label') ?? '')
    ? '在新窗口全屏打开'
    : 'Open full screen in new window'
}

function openWindow(button: HTMLElement): void {
  const sessionId = button.closest(SESSION_SELECTOR)?.getAttribute('data-sidebar-right-session')
  void invoke('create_app_window', {
    sessionId: sessionId ?? undefined,
    presentation: PRESENTATION_FULL_SIDEBAR,
  }).catch((error: unknown) => reportPluginError(error))
}

/** 把按钮插到全屏按钮左侧；右栏重渲染丢掉按钮时由观察者再次调用。 */
function place(): void {
  const mode = document.querySelector<HTMLElement>(FULLSCREEN_SELECTOR)
  const parent = mode?.parentElement
  if (mode == null || parent == null)
    return
  const existing = document.querySelector<HTMLElement>(`[${OPEN_WINDOW_ATTRIBUTE}]`)
  if (existing !== null && mode.previousElementSibling === existing)
    return
  if (existing !== null) {
    parent.insertBefore(existing, mode)
    return
  }
  const button = document.createElement('button')
  button.type = 'button'
  button.setAttribute(OPEN_WINDOW_ATTRIBUTE, '')
  button.setAttribute('aria-label', buttonLabel(mode))
  button.innerHTML = ICON
  button.addEventListener('click', () => openWindow(button))
  parent.insertBefore(button, mode)
}

/**
 * 把本窗口就位成全屏右栏：标记形态 → 展开右列 → 切进全屏。
 *
 * 右列可能还没渲染（会话刚打开）或还没折叠可展开，所以逐帧推进而不是一次点完。
 * @param controller - 生命周期控制器；窗口关闭或插件重载时停掉轮询。
 */
export function presentFullSidebar(controller: RegisterController): void {
  document.documentElement.setAttribute(FULL_SIDEBAR_ATTRIBUTE, '')
  let ticks = 0
  const cancel = controller.interval(() => {
    ticks += 1
    if (ticks > PRESENT_MAX_TICKS) {
      cancel()
      return
    }
    const mode = document.querySelector<HTMLElement>(FULLSCREEN_SELECTOR)
    if (mode == null) {
      document.querySelector<HTMLElement>(EXPAND_SELECTOR)?.click()
      return
    }
    if (mode.getAttribute('data-sidebar-right-mode') === 'fullscreen') {
      mode.click()
      return
    }
    cancel()
  }, PRESENT_POLL_MS)
}

export const sidebarFullwindowFeature = defineRegister((controller) => {
  try {
    const { c } = CssRender()
    const style = c([
      c(`[${OPEN_WINDOW_ATTRIBUTE}]`, {
        'display': 'inline-flex',
        'align-items': 'center',
        'justify-content': 'center',
        'flex': 'none',
        'width': '28px',
        'height': '28px',
        'padding': '6px',
        'border': 'none',
        'border-radius': 'var(--dsw-radius-sm)',
        'background': 'transparent',
        'color': 'var(--dsw-alias-label-secondary)',
        'cursor': 'pointer',
        'line-height': '1',
      }),
      c(`[${OPEN_WINDOW_ATTRIBUTE}]:hover`, { background: 'var(--dsw-alias-interactive-bg-hover)' }),
      c(`[${OPEN_WINDOW_ATTRIBUTE}] svg`, { width: '15px', height: '15px' }),
      c(`[${FULL_SIDEBAR_ATTRIBUTE}] ${FULLSCREEN_SELECTOR}`, { display: 'none !important' }),
    ])
    // 必须自报归属：宿主的客户端模块系统会把没有 `data-plugin` 的 <style> 认领给下一个
    // 物化的插件，并在它重载时一并删除（issue #655）。
    style.mount({ id: STYLE_ID, head: true }).setAttribute('data-plugin', PLUGIN_ID)
    controller.add(() => style.unmount({ id: STYLE_ID }))
  }
  catch (error) {
    reportPluginError(error)
  }

  const inject = () => {
    try {
      place()
    }
    catch (error) {
      reportPluginError(error)
    }
  }
  controller.observe(document.body, inject)
  inject()
})
