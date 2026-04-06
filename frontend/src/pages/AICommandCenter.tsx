import { useState, useRef, useEffect } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import {
  Paperclip, ArrowUp, Bot, FileCheck, TrendingUp,
  FileText, X, Download, Sparkles, Loader2,
} from "lucide-react";
import { apiFormFetch } from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────────────────────
interface Source {
  type: string;
  content: Record<string, unknown>;
  status: string;
  timestamp: string;
}

interface AISearchResponse {
  answer: string;
  action?: "download";
  downloadUrl?: string;
  sources?: Source[];
}

interface OCRResponse {
  message: string;
  extractedText: string;
  detectedType: string;
}

interface Message {
  id: number;
  role: "user" | "ai";
  content: string;
  type?: "text" | "invoice" | "projection";
  downloadUrl?: string;
  followUps?: string[];
  attachment?: string;
  ocrText?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function parseFollowUps(text: string): { body: string; followUps: string[] } {
  const marker = "**Suggested Follow-ups:**";
  const idx = text.indexOf(marker);
  if (idx === -1) return { body: text, followUps: [] };

  const body = text.slice(0, idx).trim();
  const followUpBlock = text.slice(idx + marker.length).trim();
  const followUps = followUpBlock
    .split("\n")
    .map((l) => l.replace(/^[•\-*]\s*/, "").trim())
    .filter(Boolean);
  return { body, followUps };
}

/** Render **bold** markdown as JSX */
function renderMarkdown(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**")
      ? <strong key={i}>{p.slice(2, -2)}</strong>
      : <span key={i}>{p}</span>
  );
}

// ── Initial AI greeting ────────────────────────────────────────────────────────
const INITIAL_MESSAGES: Message[] = [
  {
    id: 1,
    role: "ai",
    content: "Hello! I'm your MSME 360 AI assistant. I can help you generate invoices, scan receipts, analyse finances, and answer business questions.",
    followUps: [
      "Generate an invoice for my last client",
      "Scan a receipt for expense tracking",
      "Show my revenue projections for Q2",
    ],
  },
];

// ── Component ──────────────────────────────────────────────────────────────────
const AICommandCenter = () => {
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const endRef  = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // ── OCR: Read the attached document ─────────────────────────────────────────
  const handleOCR = async () => {
    if (!attachedFile) return;
    setOcrLoading(true);

    const form = new FormData();
    form.append("file", attachedFile);

    const { data, error } = await apiFormFetch<OCRResponse>("/ingest/ocr", form);

    if (error || !data) {
      toast.error(error ?? "OCR failed");
      setOcrLoading(false);
      return;
    }

    // Add a system-style AI message confirming what was extracted
    const ocrMsg: Message = {
      id: Date.now(),
      role: "ai",
      content: `📄 I've scanned your document. Detected as **${data.detectedType}** and memorised it. Here's a preview:`,
      ocrText: data.extractedText.slice(0, 400) + (data.extractedText.length > 400 ? "…" : ""),
    };

    setMessages((prev) => [...prev, ocrMsg]);
    setAttachedFile(null);
    setOcrLoading(false);
  };

  // ── Send message to AI ───────────────────────────────────────────────────────
  const sendMessage = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || isLoading) return;

    const userMsg: Message = {
      id: Date.now(),
      role: "user",
      content,
      attachment: attachedFile?.name,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    // Build FormData so we can optionally include the signature file
    const form = new FormData();
    form.append("query", content);
    if (attachedFile) form.append("signature", attachedFile);

    const { data, error } = await apiFormFetch<AISearchResponse>("/search", form);

    setAttachedFile(null);
    setIsLoading(false);

    if (error || !data) {
      toast.error(error ?? "Could not reach the AI server.");
      return;
    }

    // Determine message type from the response action
    let msgType: Message["type"] = "text";
    if (data.action === "download") msgType = "invoice";

    // Detect financial projection based on content
    if (data.answer.includes("Financial Projection") || data.answer.includes("Projected")) {
      msgType = "projection";
    }

    const { body, followUps } = parseFollowUps(data.answer);

    const aiMsg: Message = {
      id: Date.now() + 1,
      role: "ai",
      content: body,
      type: msgType,
      downloadUrl: data.downloadUrl,
      followUps: followUps.length > 0 ? followUps : undefined,
    };

    setMessages((prev) => [...prev, aiMsg]);
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <AppLayout title="AI Command Center">
      <div className="max-w-3xl mx-auto h-[calc(100vh-8rem)] flex flex-col">

        {/* ── Chat Messages ── */}
        <div className="flex-1 overflow-auto space-y-5 pb-4 pr-1 animate-fade-in">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>

              {/* AI Avatar */}
              {msg.role === "ai" && (
                <div className="h-8 w-8 rounded-lg gradient-primary flex items-center justify-center mr-3 mt-1 shrink-0">
                  <Bot className="h-4 w-4 text-primary-foreground" />
                </div>
              )}

              <div className={`max-w-[80%] ${msg.role === "user" ? "bg-secondary text-secondary-foreground rounded-2xl rounded-br-md px-4 py-3" : ""}`}>

                {/* ── Invoice card ── */}
                {msg.role === "ai" && msg.type === "invoice" && (
                  <Card className="p-5 border-0 shadow-premium bg-card mb-2">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="h-10 w-10 rounded-xl bg-success/15 flex items-center justify-center">
                        <FileCheck className="h-5 w-5 text-success" />
                      </div>
                      <div>
                        <p className="font-semibold text-foreground">Invoice Generated</p>
                        <p className="text-xs text-muted-foreground">Includes description &amp; signature</p>
                      </div>
                    </div>
                    <p className="text-sm text-foreground mb-4 leading-relaxed">{renderMarkdown(msg.content)}</p>
                    {msg.downloadUrl && (
                      <Button
                        variant="hero"
                        size="sm"
                        className="w-full"
                        onClick={() => window.open(msg.downloadUrl, "_blank")}
                      >
                        <Download className="h-4 w-4 mr-2" /> Download PDF Invoice
                      </Button>
                    )}
                  </Card>
                )}

                {/* ── Financial projection card ── */}
                {msg.role === "ai" && msg.type === "projection" && (
                  <Card className="p-5 border-0 shadow-premium bg-card mb-2">
                    <div className="flex items-center gap-2 mb-4">
                      <TrendingUp className="h-5 w-5 text-primary" />
                      <p className="font-semibold text-foreground">Financial Projection</p>
                    </div>
                    <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap font-mono text-xs bg-muted/50 p-3 rounded-lg">
                      {msg.content}
                    </p>
                  </Card>
                )}

                {/* ── Standard text card ── */}
                {msg.role === "ai" && msg.type !== "invoice" && msg.type !== "projection" && (
                  <Card className="p-4 border-0 shadow-premium bg-card">
                    <p className="text-sm text-foreground leading-relaxed">{renderMarkdown(msg.content)}</p>
                    {msg.ocrText && (
                      <div className="mt-3 p-3 bg-muted/60 rounded-lg border border-border">
                        <p className="text-xs font-semibold text-muted-foreground mb-1">Extracted Text Preview</p>
                        <p className="text-xs text-foreground font-mono leading-relaxed">{msg.ocrText}</p>
                      </div>
                    )}
                  </Card>
                )}

                {/* ── User bubble ── */}
                {msg.role === "user" && (
                  <>
                    {msg.attachment && (
                      <p className="text-xs text-muted-foreground mb-1">
                        📎 {msg.attachment}
                      </p>
                    )}
                    <p className="text-sm leading-relaxed">{msg.content}</p>
                  </>
                )}

                {/* ── Follow-up chips ── */}
                {msg.followUps && msg.followUps.length > 0 && (
                  <div className="mt-3">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                      <p className="text-xs font-semibold text-primary">Suggested Follow-ups</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {msg.followUps.map((item) => (
                        <button
                          key={item}
                          onClick={() => sendMessage(item)}
                          className="text-xs px-3 py-1.5 rounded-full bg-accent text-accent-foreground hover:bg-primary hover:text-primary-foreground transition-colors cursor-pointer border border-border"
                        >
                          {item}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* ── Thinking indicator ── */}
          {isLoading && (
            <div className="flex justify-start">
              <div className="h-8 w-8 rounded-lg gradient-primary flex items-center justify-center mr-3 mt-1 shrink-0">
                <Bot className="h-4 w-4 text-primary-foreground" />
              </div>
              <Card className="p-4 border-0 shadow-premium bg-card">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <div className="flex gap-1">
                    <span className="thinking-dot">Thinking</span>
                    <span className="thinking-ellipsis" />
                  </div>
                </div>
              </Card>
            </div>
          )}

          <div ref={endRef} />
        </div>

        {/* ── Attachment preview bar ── */}
        {attachedFile && (
          <div className="flex items-center gap-2 px-4 py-2.5 bg-accent/80 rounded-t-xl border border-b-0 border-border backdrop-blur-sm">
            <FileText className="h-4 w-4 text-accent-foreground shrink-0" />
            <span className="text-sm text-foreground flex-1 truncate font-medium">{attachedFile.name}</span>

            <Button
              size="sm"
              variant="hero"
              disabled={ocrLoading}
              onClick={handleOCR}
              className="h-7 text-xs"
            >
              {ocrLoading
                ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Scanning…</>
                : "Read Document (OCR)"
              }
            </Button>

            <button
              onClick={() => setAttachedFile(null)}
              className="text-muted-foreground hover:text-destructive transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* ── Input bar ── */}
        <div className={`bg-card border border-border shadow-elevated p-2 flex items-center gap-2 transition-all ${attachedFile ? "rounded-b-xl" : "rounded-xl"}`}>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept="image/*,.pdf"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setAttachedFile(f);
              // Reset so the same file can be re-selected
              e.target.value = "";
            }}
          />

          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            title="Attach document for OCR"
            onClick={() => fileRef.current?.click()}
          >
            <Paperclip className="h-4 w-4 text-muted-foreground" />
          </Button>

          <Input
            id="ai-query-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Ask a question, request an invoice, or scan a document…"
            className="border-0 bg-transparent focus-visible:ring-0 shadow-none"
            disabled={isLoading}
          />

          <Button
            id="ai-send-btn"
            variant="hero"
            size="icon"
            className="shrink-0 h-9 w-9"
            disabled={isLoading || (!input.trim() && !attachedFile)}
            onClick={() => sendMessage()}
          >
            {isLoading
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <ArrowUp className="h-4 w-4" />
            }
          </Button>
        </div>
      </div>
    </AppLayout>
  );
};

export default AICommandCenter;
