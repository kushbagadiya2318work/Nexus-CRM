import { useEffect, useState } from 'react'
import { Search, Bell, BellOff, LogOut } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { useCRMStore } from '@/store'
import { getInitials } from '@/lib/utils'
import { useActivityAlerts } from '@/hooks/useActivityAlerts'
import {
  getNotificationPermission,
  requestNotificationPermission,
  type NotificationPermission,
} from '@/lib/push-notifications'

export function Header() {
  const { currentUser, logout } = useCRMStore()
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>('default')

  // Start watching for unusual activity alerts
  useActivityAlerts()

  useEffect(() => {
    setNotifPermission(getNotificationPermission())
  }, [])

  const handleEnableNotifications = async () => {
    const granted = await requestNotificationPermission()
    setNotifPermission(granted ? 'granted' : 'denied')
  }

  return (
    <header className="h-16 bg-background border-b border-border flex items-center justify-between px-6 sticky top-0 z-30">
      {/* Search */}
      <div className="flex-1 max-w-md">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <Input
            type="search"
            placeholder="Search leads, clients, deals..."
            className="pl-10 w-full"
          />
        </div>
      </div>

      {/* Right section */}
      <div className="flex items-center gap-4">
        {/* Notifications */}
        {notifPermission === 'granted' ? (
          <button
            className="relative p-2 rounded-lg hover:bg-secondary transition-colors"
            title="Push alerts enabled — monitoring for unusual activity"
          >
            <Bell className="w-5 h-5 text-emerald-500" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
          </button>
        ) : notifPermission === 'denied' ? (
          <button
            className="relative p-2 rounded-lg hover:bg-secondary transition-colors"
            title="Notifications blocked — check browser settings"
          >
            <BellOff className="w-5 h-5 text-muted" />
          </button>
        ) : (
          <button
            onClick={handleEnableNotifications}
            className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 transition-colors text-xs font-medium text-amber-600"
            title="Enable push notifications for unusual activity alerts"
          >
            <Bell className="w-3.5 h-3.5" />
            Enable Alerts
          </button>
        )}

        {/* User */}
        <div className="flex items-center gap-3 pl-4 border-l border-border">
          <Avatar className="w-8 h-8">
            <AvatarImage src={currentUser?.avatar} />
            <AvatarFallback>{getInitials(currentUser?.name || 'U')}</AvatarFallback>
          </Avatar>
          <div className="hidden md:block">
            <p className="text-sm font-medium">{currentUser?.name}</p>
            <p className="text-xs text-muted capitalize">{currentUser?.role}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={logout} className="ml-2">
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </header>
  )
}
