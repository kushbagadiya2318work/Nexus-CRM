import { NavLink } from 'react-router-dom'
import { 
  LayoutDashboard, 
  Users, 
  Building2, 
  Briefcase, 
  CheckSquare, 
  BarChart3, 
  Sparkles,
  Plug,
  Settings,
  Zap,
  Inbox
} from 'lucide-react'
import { cn } from '@/lib/utils'

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Leads', href: '/leads', icon: Users },
  { name: 'Clients', href: '/clients', icon: Building2 },
  { name: 'Deals', href: '/deals', icon: Briefcase },
  { name: 'Tasks', href: '/tasks', icon: CheckSquare },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
  { name: 'AI Insights', href: '/ai-insights', icon: Sparkles },
  { name: 'Integrations', href: '/integrations', icon: Plug },
  { name: 'Workflows', href: '/workflows', icon: Zap },
  { name: 'Team Inbox', href: '/inbox', icon: Inbox },
]

export function Sidebar() {
  return (
    <div className="fixed left-0 top-0 h-full w-64 bg-secondary border-r border-border flex flex-col z-40">
      {/* Logo */}
      <div className="h-16 flex items-center px-6 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-lg">NexusAI</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-1">
        {navigation.map((item) => (
          <NavLink
            key={item.name}
            to={item.href}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-primary/10 text-primary border-l-3 border-primary"
                  : "text-muted hover:bg-secondary hover:text-foreground"
              )
            }
          >
            <item.icon className="w-5 h-5" />
            {item.name}
          </NavLink>
        ))}
      </nav>

      {/* Bottom section */}
      <div className="p-4 border-t border-border">
        <button className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-muted hover:bg-secondary hover:text-foreground transition-all w-full">
          <Settings className="w-5 h-5" />
          Settings
        </button>
      </div>
    </div>
  )
}
