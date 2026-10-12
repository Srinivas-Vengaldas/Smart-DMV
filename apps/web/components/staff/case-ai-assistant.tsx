"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface CaseAiAssistantProps {
  verificationId: string
  caseNumber?: string
  aiExplanation?: string
}

interface Message {
  role: "assistant" | "staff"
  content: string
}

export function CaseAiAssistant({
  verificationId,
  caseNumber,
  aiExplanation,
}: CaseAiAssistantProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [question, setQuestion] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setMessages([
      {
        role: "assistant",
        content: aiExplanation?.trim()
          ? `I reviewed ${caseNumber || "this case"}. ${aiExplanation} Ask me about mismatches, confidence, or the best next action.`
          : `I reviewed ${caseNumber || "this case"} and I’m ready to help. Ask me about mismatches, confidence score, missing fields, or what action may be appropriate.`,
      },
    ])
  }, [verificationId, caseNumber, aiExplanation])

  useEffect(() => {
    if (!scrollRef.current) return
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, isLoading])

  const askAssistant = async (presetQuestion?: string) => {
    const trimmed = (presetQuestion ?? question).trim()
    if (!trimmed || isLoading) return

    const nextMessages: Message[] = [
      ...messages,
      { role: "staff", content: trimmed },
    ]

    setMessages(nextMessages)
    setQuestion("")
    setIsLoading(true)

    try {
      const res = await fetch("/api/staff/verifications/assistant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          verificationId,
          question: trimmed,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data?.error || "Failed to get AI response")
      }

      setMessages([
        ...nextMessages,
        {
          role: "assistant",
          content: data?.answer || "No response generated.",
        },
      ])
    } catch (error) {
      setMessages([
        ...nextMessages,
        {
          role: "assistant",
          content:
            error instanceof Error
              ? `I ran into an error: ${error.message}`
              : "I ran into an unexpected error while reviewing this case.",
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex h-[620px] min-h-[620px] max-h-[620px] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="shrink-0 border-b border-border bg-muted/30 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">AI Review Assistant</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Case-aware guidance for the current review.
            </p>
          </div>

          <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-blue-700">
            <span className="h-2 w-2 rounded-full bg-blue-500" />
            Live
          </div>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-background px-4 py-4"
      >
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={`flex ${message.role === "assistant" ? "justify-start" : "justify-end"}`}
          >
            <div
              className={`max-w-[92%] rounded-2xl px-3 py-2.5 shadow-sm ${
                message.role === "assistant"
                  ? "border border-blue-100 bg-blue-50 text-blue-950"
                  : "bg-primary text-primary-foreground"
              }`}
            >
              <p
                className={`mb-1 text-[10px] font-semibold uppercase tracking-wide ${
                  message.role === "assistant"
                    ? "text-blue-700/80"
                    : "text-primary-foreground/80"
                }`}
              >
                {message.role === "assistant" ? "AI Assistant" : "Staff"}
              </p>
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                {message.content}
              </p>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="max-w-[92%] rounded-2xl border border-blue-100 bg-blue-50 px-3 py-2.5 shadow-sm">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-blue-700/80">
                AI Assistant
              </p>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 animate-bounce rounded-full bg-blue-500 [animation-delay:-0.3s]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-blue-500 [animation-delay:-0.15s]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-blue-500" />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-border bg-card px-4 py-3">
        <div className="mb-3 flex flex-wrap gap-2">
          {[
            "Summarize this case",
            "Why was this case sent to staff review?",
            "What mismatches did you detect?",
            "What would you recommend?",
          ].map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => askAssistant(preset)}
              disabled={isLoading}
              className="rounded-full border border-border bg-background px-3 py-1.5 text-[11px] text-muted-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              {preset}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask about mismatches, confidence, or recommendation..."
            className="h-10"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                askAssistant()
              }
            }}
          />
          <Button
            onClick={() => askAssistant()}
            disabled={isLoading || !question.trim()}
            className="h-10 rounded-xl px-4"
          >
            Ask
          </Button>
        </div>
      </div>
    </div>
  )
}