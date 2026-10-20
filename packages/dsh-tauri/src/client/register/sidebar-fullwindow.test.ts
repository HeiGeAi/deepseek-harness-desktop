import type { ClientContext } from '../types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { invoke } from '../service/invoke'
import { sidebarFullwindowFeature } from './sidebar-fullwindow'

vi.mock('../modules/css-render', () => ({
  CssRender: () => ({ c: () => ({ mount: () => ({ setAttribute: () => {} }), unmount: () => {} }) }),
}))
vi.mock('../service/invoke', () => ({ invoke: vi.fn(() => Promise.resolve()) }))

interface FakeNode {
  attributes: Map<string, string>
  clicks: number
  innerHTML: string
  parentElement: FakeContainer | null
  title: string
  setAttribute: (name: string, value: string) => void
  getAttribute: (name: string) => string | null
  addEventListener: (type: string, handler: () => void) => void
  click: () => void
  closest: () => unknown
}

interface FakeContainer {
  children: FakeNode[]
  insertBefore: (node: FakeNode, before: FakeNode) => FakeNode
}

function createNode(): FakeNode {
  const listeners = new Map<string, () => void>()
  const node: FakeNode = {
    attributes: new Map(),
    clicks: 0,
    innerHTML: '',
    parentElement: null,
    title: '',
    setAttribute(name, value) { node.attributes.set(name, value) },
    getAttribute: name => node.attributes.get(name) ?? null,
    addEventListener(type, handler) { listeners.set(type, handler) },
    click() {
      node.clicks += 1
      listeners.get('click')?.()
    },
    closest: () => ({ getAttribute: (name: string) => name === 'data-sidebar-right-session' ? 'session-1' : null }),
  }
  return node
}

function stubDom(options: { collapsed?: boolean, fullSidebar?: boolean } = {}) {
  const collapsed = options.collapsed ?? false
  const container: FakeContainer = {
    children: [],
    insertBefore(node, before) {
      const at = container.children.indexOf(node)
      if (at >= 0)
        container.children.splice(at, 1)
      container.children.splice(container.children.indexOf(before), 0, node)
      node.parentElement = container
      return node
    },
  }
  const mode = createNode()
  mode.setAttribute('aria-label', '全屏')
  mode.setAttribute('data-sidebar-right-mode', 'fullscreen')
  mode.parentElement = container
  container.children.push(mode)
  const expand = createNode()
  expand.setAttribute('data-sidebar-right-expand', '')

  vi.stubGlobal('document', {
    body: {},
    documentElement: {
      setAttribute: vi.fn(),
      hasAttribute: () => options.fullSidebar ?? false,
    },
    createElement: () => createNode(),
    querySelector: (selector: string) => {
      if (selector === '[data-sidebar-right-mode]')
        return collapsed ? null : mode
      if (selector === '[data-sidebar-right-expand]')
        return collapsed ? expand : null
      if (selector === '[data-dsh-tauri-open-window]')
        return container.children.find(node => node.attributes.has('data-dsh-tauri-open-window')) ?? null
      return null
    },
  })
  vi.stubGlobal('MutationObserver', class {
    observe() {}
    disconnect() {}
  })
  return { container, expand, mode }
}

function runFeature(): () => void {
  return sidebarFullwindowFeature.call({ get: () => undefined } as unknown as ClientContext)
}

beforeEach(() => {
  vi.mocked(invoke).mockClear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('sidebarFullwindowFeature', () => {
  it('在全屏按钮左侧注入同风格按钮，并按官方按钮语言取文案', () => {
    const { container, mode } = stubDom()
    const dispose = runFeature()

    const [button] = container.children
    expect(container.children).toHaveLength(2)
    expect(container.children[1]).toBe(mode)
    expect(button.attributes.has('data-dsh-tauri-open-window')).toBe(true)
    expect(button.getAttribute('aria-label')).toBe('在新窗口全屏打开')
    expect(button.title).toBe('在新窗口全屏打开')
    expect(button.innerHTML).toContain('<svg')
    dispose()
  })

  it('点击后按当前会话的 id 走宿主建窗，并带上全屏形态标记', async () => {
    const { container } = stubDom()
    const dispose = runFeature()

    container.children[0].click()

    expect(invoke).toHaveBeenCalledExactlyOnceWith('create_app_window', {
      sessionId: 'session-1',
      presentation: 'full-sidebar',
    })
    dispose()
  })

  it('已经是全屏形态的按钮不重复注入', () => {
    const { container } = stubDom()
    runFeature()
    runFeature()

    expect(container.children).toHaveLength(2)
  })

  it('全屏形态窗口里右栏被收起时自动展开', () => {
    const { expand } = stubDom({ collapsed: true, fullSidebar: true })
    const dispose = runFeature()

    expect(expand.clicks).toBe(1)
    dispose()
  })
})
