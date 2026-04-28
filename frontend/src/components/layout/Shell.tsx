import { useState, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { useThemeStore } from '@/store/themeStore'

export function Shell() {
  const [collapsed, setCollapsed] = useState(false)
  const { theme } = useThemeStore()

  /* Apply theme on mount and when it changes */
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ backgroundColor: 'var(--bg-base)' }}
    >
      {/* ── Sidebar ── */}
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
      />

      {/* ── Main Area ── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Topbar />

        {/* ── Page Content ── */}
        <main
          className="flex-1 overflow-y-auto overflow-x-hidden"
          style={{ backgroundColor: 'var(--bg-base)', padding: '20px' }}
        >
          <Outlet />
        </main>
      </div>
    </div>
  )
}
