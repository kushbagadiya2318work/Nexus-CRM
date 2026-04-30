import { useState } from 'react'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { AIAssistantPanel } from '@/components/ai/AIAssistantPanel'

interface LayoutProps {
  children: React.ReactNode
}

export function Layout({ children }: LayoutProps) {
  const [aiPanelOpen, setAiPanelOpen] = useState(true)

  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar />
      <div className="flex-1 flex flex-col ml-64">
        <Header />
        <main className={`flex-1 p-6 overflow-auto transition-all duration-300 ${aiPanelOpen ? 'mr-80' : 'mr-0'}`}>
          {children}
        </main>
      </div>
      <AIAssistantPanel isOpen={aiPanelOpen} onToggle={() => setAiPanelOpen(!aiPanelOpen)} />
    </div>
  )
}
