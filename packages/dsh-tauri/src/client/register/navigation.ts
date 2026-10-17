import type { ClientContext, ParentMessage } from '../types'
import type { ClientAdapter, RegisterController } from './index'
import { listenParent } from '../service/listen-parent'
import { reportPluginError } from '../utils/error'
import { defineRegister } from './index'

/** 宿主 → iframe：新建会话命令。 */
const CMD_NEW_SESSION = 'dsh://session:new'

/** 宿主 → iframe：打开文件夹命令。 */
const CMD_ADD_WORKSPACE = 'dsh://workspace:add'

/** 壳层建窗时注入的跳转信息全局名（与 `src-tauri/src/desktop/window.rs` 逐字一致）。 */
const NAVIGATION_GLOBAL = '__DSH_NAVIGATION__'

const NAVIGATION_POLL_MS = 500
const NAVIGATION_TIMEOUT_MS = 30_000

interface InjectedNavigation {
  sessionId?: unknown
}

function takeInjectedSession(): string | undefined {
  const host = window as unknown as Record<string, unknown>
  const payload = host[NAVIGATION_GLOBAL] as InjectedNavigation | undefined
  if (payload === undefined)
    return undefined
  delete host[NAVIGATION_GLOBAL]
  const sessionId = typeof payload === 'object' && payload !== null ? payload.sessionId : undefined
  return typeof sessionId === 'string' && sessionId.trim() !== '' ? sessionId : undefined
}

function consumeInjectedSession(controller: RegisterController, adapter: ClientAdapter, sessionId: string): void {
  let settled = false
  let cancelPoll = () => {}
  let cancelTimeout = () => {}

  function settle(error?: unknown): void {
    if (settled)
      return
    settled = true
    cancelPoll()
    cancelTimeout()
    if (error !== undefined)
      reportPluginError(error)
  }

  function open(): void {
    if (settled)
      return
    const list = adapter.sessionList()
    if (list === undefined || !list.ids.includes(sessionId) || !adapter.has('navigation.openSession'))
      return
    settle()
    void (async () => {
      const outcome = adapter.openSession(sessionId)
      if (outcome.status !== 'opened')
        throw new Error(outcome.reason)
      await outcome.value
    })().catch((error: unknown) => reportPluginError(error))
  }

  cancelPoll = controller.interval(open, NAVIGATION_POLL_MS)
  cancelTimeout = controller.timeout(
    () => settle(`dsh-tauri: session ${sessionId} was not opened (missing from the list or no openSession capability)`),
    NAVIGATION_TIMEOUT_MS,
  )
  open()
}

export const navigationFeature = defineRegister<ClientContext>((controller, _ctx, adapter) => {
  controller.add(listenParent<ParentMessage>((data) => {
    if (data.type === CMD_NEW_SESSION) {
      // 目录选择器不可用 / 建工作区被拒等失败上报宿主插件面板，不影响后续命令。
      void adapter.startSession().catch((error: unknown) => reportPluginError(error))
      return
    }
    if (data.type === CMD_ADD_WORKSPACE)
      void adapter.addWorkspace({ openSession: true }).catch((error: unknown) => reportPluginError(error))
  }, [CMD_NEW_SESSION, CMD_ADD_WORKSPACE]))

  const sessionId = takeInjectedSession()
  if (sessionId !== undefined)
    consumeInjectedSession(controller, adapter, sessionId)
})
