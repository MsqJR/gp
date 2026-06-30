'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  FiAlertCircle,
  FiLoader,
  FiMessageSquare,
  FiMinimize2,
  FiSend,
  FiShield,
  FiX,
} from 'react-icons/fi'

import {
  API_BASE_URL,
  chatbotApi,
  getAuthToken,
  type ChatbotAssistantPayload,
  type ChatbotResponsePayload,
} from '@/lib/api'

type ChatMessage = {
  id: string
  type: 'ai' | 'user'
  content: string
  timestamp: string
  assistant?: Partial<ChatbotAssistantPayload>
  streaming?: boolean
}

interface AIChatbotProps {
  pharmacyName?: string
  pharmacyPhone?: string
  siteSubdomain?: string
  enabled?: boolean
  useStreaming?: boolean
}

const FALLBACK_DISCLAIMER =
  'Medical disclaimer: This assistant provides general educational information about medications only. It does not replace a doctor, pharmacist, or emergency care.'

function createMessageId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function deriveTenantSubdomain(explicitSubdomain?: string) {
  if (explicitSubdomain?.trim()) {
    return explicitSubdomain.trim()
  }
  if (typeof window === 'undefined') {
    return ''
  }
  const hostname = window.location.hostname
  if (!hostname || hostname === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    return ''
  }
  const parts = hostname.split('.')
  if (parts.length >= 3) {
    return parts[0]
  }
  if (parts.length === 2 && parts[1] === 'localhost') {
    return parts[0]
  }
  return ''
}

function buildWelcomeMessage(pharmacyName: string, pharmacyPhone: string) {
  const contactLine = pharmacyPhone
    ? ` For personalized medical advice, please consult your pharmacist at ${pharmacyPhone}.`
    : ' For personalized medical advice, please consult your pharmacist or doctor.'

  return `Welcome to the ${pharmacyName} AI Pharmacy Assistant. Ask me questions about medications, dosages, warnings, and side effects. I will search our medical database to assist you.${contactLine}`
}

function trimDisclaimer(content: string, disclaimer?: string) {
  if (!disclaimer) {
    return content
  }
  const normalizedContent = content.trim()
  const normalizedDisclaimer = disclaimer.trim()
  if (normalizedContent.endsWith(normalizedDisclaimer)) {
    return normalizedContent.slice(0, normalizedContent.length - normalizedDisclaimer.length).trim()
  }
  return content
}

function urgencyClasses(urgency?: string) {
  switch (urgency) {
    case 'emergency':
      return 'bg-red-100 text-red-700 border-red-200'
    case 'urgent':
      return 'bg-amber-100 text-amber-800 border-amber-200'
    case 'self_care':
      return 'bg-emerald-100 text-emerald-700 border-emerald-200'
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200'
  }
}

export const AIChatbot: React.FC<AIChatbotProps> = ({
  pharmacyName = 'Modern Pharmacy',
  pharmacyPhone = '+1 (555) 123-4567',
  siteSubdomain,
  enabled = true,
  useStreaming = true,
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [message, setMessage] = useState('')
  const [mounted, setMounted] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: createMessageId(),
      type: 'ai',
      content: buildWelcomeMessage(pharmacyName, pharmacyPhone),
      timestamp: new Date().toISOString(),
      assistant: {
        disclaimer: FALLBACK_DISCLAIMER,
        follow_up_questions: [],
        possible_conditions: [],
        recommended_specialties: [],
        guidance: ['Feel free to ask about any drug or medication.'],
        urgency: 'routine',
        seek_emergency_care: false,
        confidence_note: 'I am an AI. Always consult a healthcare provider.',
      },
    },
  ])
  const [isTyping, setIsTyping] = useState(false)
  const [conversationId, setConversationId] = useState<string>()
  const [error, setError] = useState('')
  const [tenantSubdomain, setTenantSubdomain] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

  const hasTenantContext = useMemo(() => {
    return Boolean(tenantSubdomain || getAuthToken())
  }, [tenantSubdomain])

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (isOpen && !isMinimized) {
      inputRef.current?.focus()
    }
  }, [isOpen, isMinimized])

  useEffect(() => {
    setTenantSubdomain(deriveTenantSubdomain(siteSubdomain))
  }, [siteSubdomain])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const syncAssistantMessage = (assistantMessageId: string, updater: (current: ChatMessage) => ChatMessage) => {
    setMessages((prev) => prev.map((item) => (item.id === assistantMessageId ? updater(item) : item)))
  }

  const streamChatResponse = async (assistantMessageId: string, userText: string): Promise<void> => {
    const token = getAuthToken()
    const response = await fetch(`${API_BASE_URL}/chatbot/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        message: userText,
        conversation_id: conversationId,
        subdomain: tenantSubdomain || undefined,
        stream: true,
      }),
    })

    if (!response.ok || !response.body) {
      let errorMessage = 'Unable to stream chatbot response.'
      try {
        const data = await response.json()
        errorMessage = data.detail || data.error || errorMessage
      } catch {
        // Keep fallback error text.
      }
      throw new Error(errorMessage)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }

      buffer += decoder.decode(value, { stream: true })
      const events = buffer.split('\n\n')
      buffer = events.pop() || ''

      for (const eventBlock of events) {
        const lines = eventBlock.split('\n')
        const eventType = lines.find((line) => line.startsWith('event:'))?.slice(6).trim()
        const dataLine = lines.find((line) => line.startsWith('data:'))?.slice(5).trim()
        if (!eventType || !dataLine) {
          continue
        }

        const payload = JSON.parse(dataLine) as Record<string, unknown>

        if (eventType === 'meta') {
          const streamedConversationId = payload.conversation_id
          if (typeof streamedConversationId === 'string') {
            setConversationId(streamedConversationId)
          }
          continue
        }

        if (eventType === 'chunk') {
          const delta = typeof payload.delta === 'string' ? payload.delta : ''
          syncAssistantMessage(assistantMessageId, (current) => ({
            ...current,
            content: `${current.content}${delta}`,
            streaming: true,
          }))
          continue
        }

        if (eventType === 'done') {
          const donePayload = payload as unknown as ChatbotResponsePayload
          setConversationId(donePayload.conversation_id)
          syncAssistantMessage(assistantMessageId, (current) => ({
            ...current,
            content: donePayload.assistant.content,
            assistant: donePayload.assistant,
            streaming: false,
          }))
        }
      }
    }
  }

  const sendNonStreamingMessage = async (assistantMessageId: string, userText: string) => {
    const response = await chatbotApi.sendMessage({
      message: userText,
      conversation_id: conversationId,
      subdomain: tenantSubdomain || undefined,
    })

    if (response.error || !response.data) {
      throw new Error(response.error || 'Unable to send message.')
    }

    setConversationId(response.data.conversation_id)
    syncAssistantMessage(assistantMessageId, (current) => ({
      ...current,
      content: response.data!.assistant.content,
      assistant: response.data!.assistant,
      streaming: false,
    }))
  }

  const handleSend = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!message.trim() || isTyping) {
      return
    }

    if (!enabled) {
      setError('This tenant has the medical chatbot disabled.')
      return
    }

    if (!hasTenantContext) {
      setError('Tenant context is missing. Configure a subdomain or open this page as the site owner.')
      return
    }

    const userText = message.trim()
    const assistantMessageId = createMessageId()

    const userMessage: ChatMessage = {
      id: createMessageId(),
      type: 'user',
      content: userText,
      timestamp: new Date().toISOString(),
    }

    setMessages((prev) => [
      ...prev,
      userMessage,
      {
        id: assistantMessageId,
        type: 'ai',
        content: '',
        timestamp: new Date().toISOString(),
        assistant: {
          disclaimer: FALLBACK_DISCLAIMER,
          follow_up_questions: [],
          possible_conditions: [],
          recommended_specialties: [],
          guidance: [],
          urgency: 'routine',
          seek_emergency_care: false,
          confidence_note: '',
        },
        streaming: true,
      },
    ])
    setMessage('')
    setError('')
    setIsTyping(true)

    try {
      if (useStreaming) {
        try {
          await streamChatResponse(assistantMessageId, userText)
        } catch {
          await sendNonStreamingMessage(assistantMessageId, userText)
        }
      } else {
        await sendNonStreamingMessage(assistantMessageId, userText)
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unable to get a response right now.'
      setError(errorMessage)
      syncAssistantMessage(assistantMessageId, (current) => ({
        ...current,
        content: 'I could not complete that request right now. Please try again in a moment or contact the pharmacy directly for urgent concerns.',
        assistant: {
          ...current.assistant,
          disclaimer: FALLBACK_DISCLAIMER,
          guidance: ['Contact the pharmacy or a licensed clinician if your symptoms need prompt review.'],
          urgency: 'routine',
        },
        streaming: false,
      }))
    } finally {
      setIsTyping(false)
    }
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => {
          setIsOpen(true)
          setIsMinimized(false)
        }}
        className="fixed bottom-6 right-6 w-16 h-16 bg-gradient-to-br from-primary to-primary-dark rounded-full shadow-2xl flex items-center justify-center text-white hover:scale-110 transition-transform z-50 group"
        aria-label="Open AI Chatbot"
      >
        <FiMessageSquare size={24} />
        <span className={`absolute -top-1 -right-1 w-4 h-4 rounded-full border-2 border-white ${enabled ? 'bg-success animate-pulse' : 'bg-neutral-gray'}`}></span>
        <span className="absolute bottom-full right-0 mb-2 px-3 py-1 bg-neutral-dark text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
          {enabled ? 'Medical AI assistant' : 'Chatbot unavailable'}
        </span>
      </button>
    )
  }

  return (
    <div
      className={`fixed bottom-6 right-6 w-96 bg-white rounded-2xl shadow-2xl border border-neutral-border z-50 flex flex-col transition-all duration-300 ${
        isMinimized ? 'h-16' : 'h-[600px]'
      }`}
    >
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-primary-dark text-white p-4 rounded-t-2xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/15 rounded-full flex items-center justify-center border border-white/15">
            <FiMessageSquare size={20} />
          </div>
          <div>
            <div className="font-semibold">{pharmacyName} Pharmacy AI</div>
            <div className="text-xs text-white/75">Ask about medications and side effects</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            aria-label={isMinimized ? 'Expand' : 'Minimize'}
          >
            <FiMinimize2 size={18} />
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            aria-label="Close"
          >
            <FiX size={18} />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <>
          <div className="border-b border-neutral-border bg-amber-50 px-4 py-3 text-xs text-amber-900">
            <div className="flex items-start gap-2">
              <FiShield className="mt-0.5 shrink-0" />
              <p>
                This assistant provides information from medical databases (e.g., FDA). It does not provide personalized medical advice.
              </p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[radial-gradient(circle_at_top,#f8fafc,#eef2ff_55%,#ffffff)]">
            {messages.map((chatMessage) => (
              <div
                key={chatMessage.id}
                className={`flex ${chatMessage.type === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                    chatMessage.type === 'user'
                      ? 'bg-gradient-to-br from-primary to-primary-dark text-white shadow-lg shadow-primary/15'
                      : 'bg-white/95 border border-slate-200 text-neutral-dark shadow-sm backdrop-blur'
                  }`}
                >
                  {chatMessage.type === 'ai' && chatMessage.assistant?.urgency ? (
                    <div className={`mb-3 inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.12em] ${urgencyClasses(chatMessage.assistant.urgency)}`}>
                      {chatMessage.assistant.urgency.replace('_', ' ')}
                    </div>
                  ) : null}

                  <p className="text-sm leading-relaxed whitespace-pre-line">
                    {chatMessage.streaming && chatMessage.content.length === 0
                      ? 'Searching medical databases...'
                      : trimDisclaimer(chatMessage.content, chatMessage.assistant?.disclaimer)}
                  </p>

                  {chatMessage.type === 'ai' && chatMessage.assistant?.possible_conditions?.length ? (
                    <div className="mt-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                        Possible conditions
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {chatMessage.assistant.possible_conditions.map((item) => (
                          <span key={item} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {chatMessage.type === 'ai' && chatMessage.assistant?.recommended_specialties?.length ? (
                    <div className="mt-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                        Recommended specialties
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {chatMessage.assistant.recommended_specialties.map((item) => (
                          <span key={item} className="rounded-full bg-primary-light px-3 py-1 text-xs text-primary-dark">
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {chatMessage.type === 'ai' && chatMessage.assistant?.guidance?.length ? (
                    <div className="mt-3 rounded-xl bg-slate-50 p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                        Database Sources
                      </div>
                      <ul className="mt-2 space-y-1.5 text-xs text-slate-700">
                        {chatMessage.assistant.guidance.map((item) => (
                          <li key={item} className="leading-relaxed">
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {chatMessage.type === 'ai' && chatMessage.assistant?.follow_up_questions?.length ? (
                    <div className="mt-3 rounded-xl border border-dashed border-slate-200 p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                        Follow-up questions
                      </div>
                      <ul className="mt-2 space-y-1.5 text-xs text-slate-700">
                        {chatMessage.assistant.follow_up_questions.map((item) => (
                          <li key={item} className="leading-relaxed">
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {chatMessage.type === 'ai' && chatMessage.assistant?.disclaimer ? (
                    <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      {chatMessage.assistant.disclaimer}
                    </div>
                  ) : null}

                  {chatMessage.type === 'ai' && chatMessage.assistant?.confidence_note ? (
                    <div className="mt-2 text-[11px] text-slate-500">
                      {chatMessage.assistant.confidence_note}
                    </div>
                  ) : null}

                  <p className={`text-xs mt-2 ${chatMessage.type === 'user' ? 'text-white/70' : 'text-neutral-gray'}`}>
                    {mounted ? new Date(chatMessage.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                  </p>
                </div>
              </div>
            ))}

            {isTyping ? (
              <div className="flex justify-start">
                <div className="bg-white border border-neutral-border rounded-2xl px-4 py-3 shadow-sm text-slate-600 flex items-center gap-2">
                  <FiLoader className="animate-spin" />
                  <div className="text-sm">Generating a safe response...</div>
                </div>
              </div>
            ) : null}

            {error ? (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-start gap-2">
                  <FiAlertCircle className="mt-0.5 shrink-0" />
                  <div>{error}</div>
                </div>
              </div>
            ) : null}

            {!enabled ? (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  Chatbot access is disabled for this template tenant.
                </div>
              </div>
            ) : null}

            {enabled && !hasTenantContext ? (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  Public tenant preview is unavailable until a Medify subdomain is configured.
                </div>
              </div>
            ) : null}

            <div ref={messagesEndRef} />
          </div>

          <form ref={formRef} onSubmit={handleSend} className="p-4 border-t border-neutral-border bg-white rounded-b-2xl">
            <div className="flex gap-2">
              <textarea
                ref={inputRef}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    formRef.current?.requestSubmit()
                  }
                }}
                placeholder="e.g. What are the common side effects of Metformin?"
                rows={2}
                className="flex-1 px-4 py-2 border border-neutral-border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-sm leading-relaxed min-h-[44px] max-h-40 resize-y"
                disabled={isTyping || !enabled || !hasTenantContext}
              />
              <button
                type="submit"
                disabled={!message.trim() || isTyping || !enabled || !hasTenantContext}
                className="px-4 py-2 bg-gradient-to-r from-primary to-primary-dark text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Send message"
              >
                <FiSend size={18} />
              </button>
            </div>
            <p className="text-xs text-neutral-gray mt-2 text-center leading-relaxed">
              Medical AI assistant. It does not provide medical advice. For emergencies, contact local emergency services.
            </p>
          </form>
        </>
      )}
    </div>
  )
}
