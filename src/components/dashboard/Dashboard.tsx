import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { 
  DollarSign, 
  Briefcase, 
  Users, 
  Target,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  AlertCircle,
  Lightbulb
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useCRMStore } from '@/store'
import { formatCurrency, formatNumber, formatRelativeTime, getInitials } from '@/lib/utils'
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell
} from 'recharts'

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.4,
      ease: [0.25, 0.46, 0.45, 0.94],
    },
  },
}

export function Dashboard() {
  const { getDashboardStats, getPipelineData, getLeadSources, getTeamPerformance, getRevenueData, aiInsights, activities, deals, tasks } = useCRMStore()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const stats = getDashboardStats()
  const pipelineData = getPipelineData()
  const leadSources = getLeadSources()
  const teamPerformance = getTeamPerformance()
  const revenueData = getRevenueData()

  const statCards = [
    {
      title: 'Total Revenue',
      value: stats.totalRevenue,
      change: stats.revenueChange,
      icon: DollarSign,
      color: 'text-emerald-500',
      bgColor: 'bg-emerald-500/10',
      format: formatCurrency,
    },
    {
      title: 'Active Deals',
      value: stats.activeDeals,
      change: stats.dealsChange,
      icon: Briefcase,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
      format: formatNumber,
    },
    {
      title: 'New Leads',
      value: stats.newLeads,
      change: stats.leadsChange,
      icon: Users,
      color: 'text-orange-500',
      bgColor: 'bg-orange-500/10',
      format: formatNumber,
    },
    {
      title: 'Conversion Rate',
      value: stats.conversionRate,
      change: stats.conversionChange,
      icon: Target,
      color: 'text-purple-500',
      bgColor: 'bg-purple-500/10',
      format: (v: number) => `${v}%`,
    },
  ]

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted">Welcome back, here's your sales overview</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline">Last 30 Days</Button>
          <Button>Export Report</Button>
        </div>
      </motion.div>

      {/* Stats Row */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat, index) => (
          <Card key={index} className="relative overflow-hidden">
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className={`p-3 rounded-lg ${stat.bgColor}`}>
                  <stat.icon className={`w-5 h-5 ${stat.color}`} />
                </div>
                <Badge 
                  variant={stat.change >= 0 ? 'success' : 'error'}
                  className="flex items-center gap-1"
                >
                  {stat.change >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  {Math.abs(stat.change)}%
                </Badge>
              </div>
              <div className="mt-4">
                <p className="text-2xl font-bold">{stat.format(stat.value)}</p>
                <p className="text-sm text-muted">{stat.title}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </motion.div>

      {/* Charts Row */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue Chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Revenue Overview</CardTitle>
            <CardDescription>Track your revenue performance over time</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {mounted && (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={revenueData}>
                    <defs>
                      <linearGradient id="colorCurrent" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.1)" />
                    <XAxis dataKey="month" stroke="#94A3B8" fontSize={12} />
                    <YAxis stroke="#94A3B8" fontSize={12} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#1E293B', 
                        border: '1px solid rgba(148, 163, 184, 0.2)',
                        borderRadius: '8px'
                      }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="current" 
                      stroke="#3B82F6" 
                      strokeWidth={2}
                      fillOpacity={1} 
                      fill="url(#colorCurrent)" 
                      name="Current Year"
                    />
                    <Area 
                      type="monotone" 
                      dataKey="previous" 
                      stroke="#94A3B8" 
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      fill="none" 
                      name="Previous Year"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Pipeline */}
        <Card>
          <CardHeader>
            <CardTitle>Deal Pipeline</CardTitle>
            <CardDescription>Deals by stage</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {pipelineData.map((stage, index) => (
              <div key={index} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>{stage.name}</span>
                  <span className="text-muted">{stage.count} deals</span>
                </div>
                <div className="flex items-center gap-3">
                  <Progress value={(stage.count / 245) * 100} className="flex-1" />
                  <span className="text-sm font-medium w-16 text-right">
                    {formatCurrency(stage.value)}
                  </span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </motion.div>

      {/* AI Insights */}
      <motion.div variants={itemVariants}>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          AI-Powered Insights
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {aiInsights.map((insight) => (
            <Card key={insight.id} className="border-l-4 border-l-primary">
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${
                    insight.type === 'alert' ? 'bg-error/10 text-error' :
                    insight.type === 'warning' ? 'bg-warning/10 text-warning' :
                    'bg-success/10 text-success'
                  }`}>
                    {insight.type === 'alert' ? <AlertCircle className="w-5 h-5" /> :
                     insight.type === 'warning' ? <AlertCircle className="w-5 h-5" /> :
                     <Lightbulb className="w-5 h-5" />}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-sm">{insight.title}</h3>
                    <p className="text-sm text-muted mt-1">{insight.description}</p>
                    <Button variant="link" size="sm" className="mt-2 p-0 h-auto">
                      {insight.actionText}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </motion.div>

      {/* Bottom Row */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {activities.slice(0, 5).map((activity) => (
                <div key={activity.id} className="flex items-start gap-3">
                  <Avatar className="w-8 h-8">
                    <AvatarImage src={activity.userId === 'ai' ? undefined : `https://i.pravatar.cc/150?u=${activity.userId}`} />
                    <AvatarFallback className={activity.userId === 'ai' ? 'bg-primary text-white' : ''}>
                      {activity.userId === 'ai' ? 'AI' : getInitials(activity.userName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">
                      <span className="font-medium">{activity.userName}</span>{' '}
                      <span className="text-muted">{activity.description}</span>
                    </p>
                    {activity.relatedTo && (
                      <p className="text-xs text-primary mt-0.5">{activity.relatedTo.name}</p>
                    )}
                  </div>
                  <span className="text-xs text-muted whitespace-nowrap">
                    {formatRelativeTime(activity.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Top Deals */}
        <Card>
          <CardHeader>
            <CardTitle>Top Performing Deals</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {deals.slice(0, 5).map((deal) => (
                <div key={deal.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Briefcase className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{deal.clientName}</p>
                      <p className="text-xs text-muted capitalize">{deal.stage.replace('-', ' ')}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-sm">{formatCurrency(deal.value)}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Progress value={deal.probability} className="w-16 h-1.5" />
                      <span className="text-xs text-muted">{deal.probability}%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Team Performance & Tasks */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Team Performance */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Team Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              {mounted && (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={teamPerformance} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.1)" horizontal={false} />
                    <XAxis type="number" stroke="#94A3B8" fontSize={12} />
                    <YAxis dataKey="name" type="category" stroke="#94A3B8" fontSize={12} width={100} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#1E293B', 
                        border: '1px solid rgba(148, 163, 184, 0.2)',
                        borderRadius: '8px'
                      }}
                    />
                    <Bar dataKey="revenue" fill="#3B82F6" radius={[0, 4, 4, 0]} name="Revenue ($)" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Lead Sources */}
        <Card>
          <CardHeader>
            <CardTitle>Lead Sources</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              {mounted && (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={leadSources}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="count"
                    >
                      {leadSources.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#1E293B', 
                        border: '1px solid rgba(148, 163, 184, 0.2)',
                        borderRadius: '8px'
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 mt-4">
              {leadSources.map((source) => (
                <div key={source.source} className="flex items-center gap-2 text-xs">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: source.color }} />
                  <span className="text-muted">{source.source}</span>
                  <span className="font-medium">{source.percentage}%</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Upcoming Tasks */}
      <motion.div variants={itemVariants}>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Upcoming Tasks</CardTitle>
            <Button variant="outline" size="sm">View All</Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {tasks.map((task) => (
                <div key={task.id} className="flex items-center gap-4 p-3 rounded-lg hover:bg-secondary/50 transition-colors">
                  <div className={`w-2 h-2 rounded-full ${
                    task.priority === 'high' ? 'bg-error' :
                    task.priority === 'medium' ? 'bg-warning' :
                    'bg-info'
                  }`} />
                  <div className="flex-1">
                    <p className="font-medium text-sm">{task.title}</p>
                    {task.relatedTo && (
                      <p className="text-xs text-muted">{task.relatedTo.name}</p>
                    )}
                  </div>
                  <Badge 
                    variant={task.status === 'completed' ? 'success' : 'outline'}
                    className="text-xs"
                  >
                    {task.status}
                  </Badge>
                  <span className="text-xs text-muted">{task.dueDate}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  )
}
