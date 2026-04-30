import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, Sparkles, ChevronLeft, Bot, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useCRMStore } from '@/store'
import { cn } from '@/lib/utils'

interface AIAssistantPanelProps {
  isOpen: boolean
  onToggle: () => void
}

const quickActions = [
  'Show hot leads',
  'Forecast this month',
  'Draft follow-up email',
  'Analyze pipeline',
]

export function AIAssistantPanel({ isOpen, onToggle }: AIAssistantPanelProps) {
  const { chatMessages, addChatMessage, leads, deals, users } = useCRMStore()
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [chatMessages])

  const handleSend = async () => {
    if (!input.trim()) return

    const submittedInput = input.trim()
    const userMessage = {
      id: Date.now().toString(),
      role: 'user' as const,
      content: submittedInput,
      timestamp: new Date().toISOString(),
    }

    addChatMessage(userMessage)
    setInput('')
    setIsTyping(true)

    // Simulate AI response
    setTimeout(() => {
      const aiResponse = generateAIResponse(submittedInput)
      addChatMessage({
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: aiResponse,
        timestamp: new Date().toISOString(),
      })
      setIsTyping(false)
    }, 1500)
  }

  const generateAIResponse = (query: string): string => {
    const lowerQuery = query.toLowerCase()

    if (lowerQuery.includes('hot lead')) {
      const hotLeads = leads
        .filter((lead) => (lead.score || 0) >= 80 || lead.priority === 'high')
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .slice(0, 5)

      if (!hotLeads.length) {
        return 'No hot leads are currently in the CRM. Once lead scores or high-priority records arrive, I will surface them here.'
      }

      return `Hot leads from your live CRM:\n\n${hotLeads.map((lead, index) => {
        const owner = users.find((user) => user.id === lead.assignedTo)?.name || lead.assignedUserName || 'Unassigned'
        return `${index + 1}. **${lead.name}** - ${lead.company}, score ${lead.score || 0}, owner: ${owner}`
      }).join('\n')}`
    }

    if (lowerQuery.includes('forecast')) {
      const openDeals = deals.filter((deal) => !['closed-won', 'closed-lost'].includes(deal.stage))
      const weightedForecast = openDeals.reduce((total, deal) => total + (deal.value * deal.probability) / 100, 0)
      const atRisk = openDeals.filter((deal) => new Date(deal.expectedCloseDate).getTime() < Date.now())

      return `Live forecast:\n\n- Open deals: ${openDeals.length}\n- Weighted forecast: $${Math.round(weightedForecast).toLocaleString()}\n- At-risk deals: ${atRisk.length}\n\n${atRisk.length ? 'Recommended action: update close dates or schedule follow-ups for overdue opportunities.' : 'No overdue open deals are currently visible.'}`
    }

    if (lowerQuery.includes('pipeline')) {
      const totalValue = deals.reduce((total, deal) => total + deal.value, 0)
      const stages = ['prospecting', 'qualification', 'proposal', 'negotiation', 'closed-won', 'closed-lost']

      return `Pipeline analysis from live deals:\n\n- Total deals: ${deals.length}\n- Total value: $${Math.round(totalValue).toLocaleString()}\n\n${stages.map((stage) => {
        const stageDeals = deals.filter((deal) => deal.stage === stage)
        const value = stageDeals.reduce((total, deal) => total + deal.value, 0)
        return `- ${stage.replace('-', ' ')}: ${stageDeals.length} deals ($${Math.round(value).toLocaleString()})`
      }).join('\n')}`
    }

    if (lowerQuery.includes('email')) {
      const lead = leads.find((item) => item.status !== 'converted') || leads[0]
      const recipientName = lead?.name || '[Name]'
      const companyName = lead?.company || '[Company]'

      return `Follow-up draft:

---

**Subject:** Quick follow-up on our conversation

Hi ${recipientName},

I wanted to follow up on our recent conversation about ${companyName}'s goals.

Based on your current priorities, I can share a concise plan, pricing context, or a quick walkthrough with the right next steps.

Would you be available for a 15-minute call this week to discuss how we can support your objectives?

Best regards,
[Your Name]

---`
    }

    return `I'm here to help you with your sales activities. I can:

- Analyze your pipeline and identify at-risk deals
- Generate personalized follow-up emails
- Provide revenue forecasts based on your data
- Identify hot leads with high engagement
- Suggest next best actions for deals

What would you like me to help you with?`
  }

  return (
    <>
      {/* Toggle Button */}
      <button
        onClick={onToggle}
        className={cn(
          "fixed right-6 bottom-6 z-50 w-14 h-14 rounded-full bg-primary shadow-glow flex items-center justify-center transition-all duration-300 hover:scale-110",
          isOpen && "right-[340px]"
        )}
      >
        <motion.div
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <Sparkles className="w-6 h-6 text-white" />
        </motion.div>
      </button>

      {/* Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ x: 320 }}
            animate={{ x: 0 }}
            exit={{ x: 320 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="fixed right-0 top-0 h-full w-80 bg-secondary border-l border-border z-40 flex flex-col"
          >
            {/* Header */}
            <div className="h-16 flex items-center justify-between px-4 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">NexusAI Assistant</h3>
                  <p className="text-xs text-muted">Always here to help</p>
                </div>
              </div>
              <button onClick={onToggle} className="p-2 hover:bg-secondary rounded-lg">
                <ChevronLeft className="w-5 h-5" />
              </button>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 p-4" ref={scrollRef}>
              <div className="space-y-4">
                {chatMessages.map((message) => (
                  <motion.div
                    key={message.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(
                      "flex gap-3",
                      message.role === 'user' && "flex-row-reverse"
                    )}
                  >
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
                      message.role === 'assistant' ? "bg-primary/20" : "bg-secondary"
                    )}>
                      {message.role === 'assistant' ? (
                        <Bot className="w-4 h-4 text-primary" />
                      ) : (
                        <User className="w-4 h-4" />
                      )}
                    </div>
                    <div className={cn(
                      "rounded-lg p-3 text-sm max-w-[80%]",
                      message.role === 'assistant' 
                        ? "bg-secondary" 
                        : "bg-primary text-primary-foreground"
                    )}>
                      <p className="whitespace-pre-line">{message.content}</p>
                    </div>
                  </motion.div>
                ))}

                {isTyping && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex gap-3"
                  >
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                      <Bot className="w-4 h-4 text-primary" />
                    </div>
                    <div className="bg-secondary rounded-lg p-3 flex items-center gap-1">
                      <motion.div
                        animate={{ y: [0, -4, 0] }}
                        transition={{ duration: 0.5, repeat: Infinity }}
                        className="w-2 h-2 bg-muted rounded-full"
                      />
                      <motion.div
                        animate={{ y: [0, -4, 0] }}
                        transition={{ duration: 0.5, repeat: Infinity, delay: 0.1 }}
                        className="w-2 h-2 bg-muted rounded-full"
                      />
                      <motion.div
                        animate={{ y: [0, -4, 0] }}
                        transition={{ duration: 0.5, repeat: Infinity, delay: 0.2 }}
                        className="w-2 h-2 bg-muted rounded-full"
                      />
                    </div>
                  </motion.div>
                )}
              </div>
            </ScrollArea>

            {/* Quick Actions */}
            <div className="px-4 py-2 border-t border-border">
              <div className="flex flex-wrap gap-2">
                {quickActions.map((action) => (
                  <button
                    key={action}
                    onClick={() => {
                      setInput(action)
                      addChatMessage({
                        id: Date.now().toString(),
                        role: 'user',
                        content: action,
                        timestamp: new Date().toISOString(),
                      })
                      setIsTyping(true)
                      setTimeout(() => {
                        addChatMessage({
                          id: (Date.now() + 1).toString(),
                          role: 'assistant',
                          content: generateAIResponse(action),
                          timestamp: new Date().toISOString(),
                        })
                        setIsTyping(false)
                        setInput('')
                      }, 800)
                    }}
                    className="text-xs px-3 py-1.5 rounded-full bg-secondary hover:bg-primary/20 hover:text-primary transition-colors"
                  >
                    {action}
                  </button>
                ))}
              </div>
            </div>

            {/* Input */}
            <div className="p-4 border-t border-border">
              <div className="flex gap-2">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  placeholder="Ask me anything..."
                  className="flex-1"
                />
                <Button size="icon" onClick={handleSend} disabled={!input.trim()}>
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
