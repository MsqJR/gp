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

interface HospitalChatWidgetProps {
  hospitalName?: string
  hospitalPhone?: string
  subdomain: string
  enabled?: boolean
  useStreaming?: boolean
  whatsAppNumber?: string
}

const FALLBACK_DISCLAIMER =
  'Medical disclaimer: This assistant provides general educational information only. It does not replace a doctor or emergency care.'

function createMessageId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function buildWelcomeMessage(hospitalName: string, hospitalPhone: string) {
  const contactLine = hospitalPhone
    ? ` If your symptoms feel urgent or are getting worse, contact ${hospitalPhone} or local emergency services.`
    : ' If your symptoms feel urgent or are getting worse, contact a clinician or local emergency services.'

  return `${hospitalName} medical assistant is ready. Describe your symptoms and I will help with follow-up questions, possible conditions, recommended specialties, and general guidance.${contactLine}`
}

function trimDisclaimer(content: string, disclaimer?: string) {
  if (!disclaimer) return content
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

function formatWhatsAppLink(phone: string) {
  let digits = phone.replace(/\D/g, '')
  if (digits.startsWith('00')) {
    digits = digits.slice(2)
  }
  if (digits.startsWith('01') && digits.length === 11) {
    digits = '2' + digits
  }
  return `https://wa.me/${digits}`
}

export default function HospitalChatWidget({
  hospitalName = 'Hospital',
  hospitalPhone = '',
  subdomain,
  enabled = true,
  useStreaming = true,
  whatsAppNumber,
}: HospitalChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: createMessageId(),
      type: 'ai',
      content: buildWelcomeMessage(hospitalName, hospitalPhone),
      timestamp: new Date().toISOString(),
      assistant: {
        disclaimer: FALLBACK_DISCLAIMER,
        follow_up_questions: [],
        possible_conditions: [],
        recommended_specialties: ['General Practice'],
        guidance: ['For emergencies, contact local emergency services immediately.'],
        urgency: 'routine',
        seek_emergency_care: false,
        confidence_note: 'The assistant will ask follow-up questions when symptom details are incomplete.',
      },
    },
  ])
  const [isTyping, setIsTyping] = useState(false)
  const [conversationId, setConversationId] = useState<string>()
  const [error, setError] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

  const hasTenantContext = useMemo(() => {
    return Boolean(subdomain || getAuthToken())
  }, [subdomain])

  useEffect(() => {
    if (isOpen && !isMinimized) {
      inputRef.current?.focus()
    }
  }, [isOpen, isMinimized])

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
        subdomain: subdomain || undefined,
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
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const events = buffer.split('\n\n')
      buffer = events.pop() || ''

      for (const eventBlock of events) {
        const lines = eventBlock.split('\n')
        const eventType = lines.find((line) => line.startsWith('event:'))?.slice(6).trim()
        const dataLine = lines.find((line) => line.startsWith('data:'))?.slice(5).trim()
        if (!eventType || !dataLine) continue

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
      subdomain: subdomain || undefined,
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
    if (!message.trim() || isTyping) return

    if (!enabled) {
      setError('This hospital has the medical chatbot disabled.')
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
        content:
          'I could not complete that request right now. Please try again in a moment or contact the hospital directly for urgent concerns.',
        assistant: {
          ...current.assistant,
          disclaimer: FALLBACK_DISCLAIMER,
          guidance: ['Contact the hospital or a licensed clinician if your symptoms need prompt review.'],
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
      <>
        {whatsAppNumber && (
          <a
            id="hospital-whatsapp-toggle"
            href={formatWhatsAppLink(whatsAppNumber)}
            target="_blank"
            rel="noopener noreferrer"
            className="fixed bottom-[104px] right-6 w-16 h-16 bg-[#25D366] rounded-full shadow-2xl shadow-emerald-500/20 flex items-center justify-center text-white hover:scale-110 hover:bg-[#20ba5a] transition-all duration-300 z-50 group"
            aria-label="Chat on WhatsApp"
          >
            <svg
              stroke="currentColor"
              fill="currentColor"
              strokeWidth="0"
              viewBox="0 0 448 512"
              height="28"
              width="28"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32 100.5 32 0 132.5 0 255.9c0 39.4 10.3 77.9 29.9 111.9L0 480l114.7-30c32.7 17.9 69.5 27.3 107.1 27.3h.1c123.3 0 223.8-100.5 223.8-223.9 0-59.7-23.2-115.8-64.8-156.3zM223.9 445.2c-33.3 0-66-8.9-94.4-25.7l-6.8-4-70.1 18.4 18.7-68.2-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 54 81.2 54 130.5 0 101.7-82.8 184.5-184.6 184.5zm100.5-137.5c-5.5-2.7-32.5-16-37.6-17.8-5.1-1.9-8.8-2.7-12.5 2.7-3.7 5.5-14.3 17.8-17.6 21.5-3.3 3.7-6.5 4.1-12 1.4-5.5-2.7-23.2-8.5-44.1-27.1-16.3-14.5-27.3-32.5-30.5-38-3.3-5.5-.4-8.5 2.4-11.2 2.5-2.4 5.5-6.5 8.2-9.7 2.7-3.3 3.7-5.5 5.5-9.2 1.8-3.7.9-6.9-.5-9.7-1.4-2.7-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.5-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 13.3 5.7 23.6 9.2 31.6 11.7 13.3 4.2 25.4 3.6 35 2.2 10.7-1.6 32.5-13.3 37-26.2 4.6-12.9 4.6-24 3.2-26.2-1.3-2.2-5-3.6-10.5-6.3z" />
            </svg>
            <span className="absolute bottom-full right-0 mb-2 px-3 py-1 bg-slate-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
              Chat on WhatsApp
            </span>
          </a>
        )}
        <button
          id="hospital-chat-toggle"
          onClick={() => {
            setIsOpen(true)
            setIsMinimized(false)
          }}
          className="fixed bottom-6 right-6 w-16 h-16 bg-gradient-to-br from-blue-600 to-teal-500 rounded-full shadow-2xl flex items-center justify-center text-white hover:scale-110 transition-transform z-50 group"
          aria-label="Open AI Symptom Chatbot"
        >
          <FiMessageSquare size={24} />
          <span
            className={`absolute -top-1 -right-1 w-4 h-4 rounded-full border-2 border-white ${
              enabled ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400'
            }`}
          />
          <span className="absolute bottom-full right-0 mb-2 px-3 py-1 bg-slate-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
            {enabled ? 'Medical AI assistant' : 'Chatbot unavailable'}
          </span>
        </button>
      </>
    )
  }

  return (
    <div
      className={`fixed bottom-6 right-6 w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 flex flex-col transition-all duration-300 ${
        isMinimized ? 'h-16' : 'h-[600px]'
      }`}
    >
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-700 via-blue-600 to-teal-500 text-white p-4 rounded-t-2xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/15 rounded-full flex items-center justify-center border border-white/15">
            <FiMessageSquare size={20} />
          </div>
          <div>
            <div className="font-semibold">{hospitalName} Medical AI</div>
            <div className="text-xs text-white/75">Symptoms, follow-up questions, and care guidance</div>
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
          {/* Safety banner */}
          <div className="border-b border-slate-100 bg-amber-50 px-4 py-3 text-xs text-amber-900">
            <div className="flex items-start gap-2">
              <FiShield className="mt-0.5 shrink-0" />
              <p>This assistant offers general medical information only. For emergencies, call local emergency services.</p>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[radial-gradient(circle_at_top,#eff6ff,#f0fdfa_55%,#ffffff)]">
            {messages.map((chatMessage) => (
              <div
                key={chatMessage.id}
                className={`flex ${chatMessage.type === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                    chatMessage.type === 'user'
                      ? 'bg-gradient-to-br from-blue-600 to-teal-500 text-white shadow-lg shadow-blue-500/15'
                      : 'bg-white/95 border border-slate-200 text-slate-800 shadow-sm backdrop-blur'
                  }`}
                >
                  {/* Urgency badge */}
                  {chatMessage.type === 'ai' && chatMessage.assistant?.urgency ? (
                    <div
                      className={`mb-3 inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.12em] ${urgencyClasses(chatMessage.assistant.urgency)}`}
                    >
                      {chatMessage.assistant.urgency.replace('_', ' ')}
                    </div>
                  ) : null}

                  {/* Main content */}
                  <p className="text-sm leading-relaxed whitespace-pre-line">
                    {chatMessage.streaming && chatMessage.content.length === 0
                      ? 'Analyzing your symptoms...'
                      : trimDisclaimer(chatMessage.content, chatMessage.assistant?.disclaimer)}
                  </p>

                  {/* Possible conditions */}
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

                  {/* Recommended specialties */}
                  {chatMessage.type === 'ai' && chatMessage.assistant?.recommended_specialties?.length ? (
                    <div className="mt-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                        Recommended specialties
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {chatMessage.assistant.recommended_specialties.map((item) => (
                          <span key={item} className="rounded-full bg-blue-50 px-3 py-1 text-xs text-blue-700">
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {/* General guidance */}
                  {chatMessage.type === 'ai' && chatMessage.assistant?.guidance?.length ? (
                    <div className="mt-3 rounded-xl bg-slate-50 p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                        General guidance
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

                  {/* Follow-up questions */}
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

                  {/* Disclaimer */}
                  {chatMessage.type === 'ai' && chatMessage.assistant?.disclaimer ? (
                    <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      {chatMessage.assistant.disclaimer}
                    </div>
                  ) : null}

                  {/* Confidence note */}
                  {chatMessage.type === 'ai' && chatMessage.assistant?.confidence_note ? (
                    <div className="mt-2 text-[11px] text-slate-500">{chatMessage.assistant.confidence_note}</div>
                  ) : null}

                  {/* Timestamp */}
                  <p className={`text-xs mt-2 ${chatMessage.type === 'user' ? 'text-white/70' : 'text-slate-400'}`}>
                    {new Date(chatMessage.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {isTyping ? (
              <div className="flex justify-start">
                <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3 shadow-sm text-slate-600 flex items-center gap-2">
                  <FiLoader className="animate-spin" />
                  <div className="text-sm">Preparing a medically safe response...</div>
                </div>
              </div>
            ) : null}

            {/* Error */}
            {error ? (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-start gap-2">
                  <FiAlertCircle className="mt-0.5 shrink-0" />
                  <div>{error}</div>
                </div>
              </div>
            ) : null}

            {/* Chatbot disabled */}
            {!enabled ? (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  Chatbot access is disabled for this hospital.
                </div>
              </div>
            ) : null}

            {/* No tenant context */}
            {enabled && !hasTenantContext ? (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  Public tenant preview is unavailable until a Medify subdomain is configured.
                </div>
              </div>
            ) : null}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <form ref={formRef} onSubmit={handleSend} className="p-4 border-t border-slate-100 bg-white rounded-b-2xl">
            <div className="flex gap-2">
              <textarea
                ref={inputRef}
                id="hospital-chat-input"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    formRef.current?.requestSubmit()
                  }
                }}
                placeholder="Describe symptoms, duration, severity, and anything that makes them better or worse"
                rows={2}
                className="flex-1 px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm leading-relaxed min-h-[44px] max-h-40 resize-y"
                disabled={isTyping || !enabled || !hasTenantContext}
              />
              <button
                id="hospital-chat-send"
                type="submit"
                disabled={!message.trim() || isTyping || !enabled || !hasTenantContext}
                className="px-4 py-2 bg-gradient-to-r from-blue-600 to-teal-500 text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Send message"
              >
                <FiSend size={18} />
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-2 text-center leading-relaxed">
              Medical AI triage assistant. It does not diagnose or prescribe. For emergency symptoms, contact local
              emergency services.
            </p>
          </form>
        </>
      )}
    </div>
  )
}
