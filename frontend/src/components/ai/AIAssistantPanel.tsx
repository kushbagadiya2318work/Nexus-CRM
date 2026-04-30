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
  const { chatMessages, addChatMessage } = useCRMStore()
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
      return `I found 3 hot leads with high engagement scores:

1. **Acme Corporation** - 85% engagement, last active 2 hours ago
2. **TechCorp Industries** - 78% engagement, viewed pricing page 5 times
3. **Global Systems** - 72% engagement, opened proposal email

Would you like me to draft personalized follow-up emails for any of these?`
    }

    if (lowerQuery.includes('forecast')) {
      return `Based on your current pipeline analysis:

**January 2024 Forecast:**
- Expected Revenue: $425,000
- Confidence: 78%
- At-risk deals: 3 ($85,000)

**Key Insights:**
- 5 deals in negotiation stage likely to close
- 2 deals stalled for more than 10 days and need attention
- Recommended action: Schedule follow-ups with stalled deals`
    }

    if (lowerQuery.includes('pipeline')) {
      return `**Pipeline Analysis:**

- Total Deals: 156
- Total Value: $2.4M
- Average Deal Size: $15,400

**Stage Breakdown:**
- Prospecting: 245 deals ($1.2M)
- Qualification: 156 deals ($890K)
- Proposal: 89 deals ($520K)
- Negotiation: 45 deals ($280K)
- Closed Won: 28 deals ($175K)

**Conversion Rates:**
- Prospect to Qualify: 63.7%
- Qualify to Proposal: 57.1%
- Proposal to Negotiation: 50.6%`
    }

    if (lowerQuery.includes('email')) {
      return `I've drafted a follow-up email for your top leads:

---

**Subject:** Quick follow-up on our conversation

Hi [Name],

I hope this email finds you well. I wanted to follow up on our recent conversation about [Company]'s goals for [quarter/year].

Based on our discussion, I believe our solution can help you:
- Reduce operational costs by 25%
- Increase team productivity by 40%
- Streamline your workflow processes

Would you be available for a 15-minute call this week to discuss how we can support your objectives?

Best regards,
[Your Name]

---

Would you like me to personalize this for specific leads?`
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
