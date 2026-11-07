import { useState, useRef, useEffect } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GlassCard } from "@/components/ui/glass-card";
import { toast } from "sonner";
import {
  Paperclip,
  ArrowUp,
  Bot,
  FileCheck,
  TrendingUp,
  FileText,
  X,
  Download,
  Sparkles,
  Loader2,
  Copy,
} from "lucide-react";
import { apiFormFetch, resolveInvoicePdfUrl } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";

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
  analysis?: string;
}

interface Message {
  id: number;
  role: "user" | "ai";
  content: string;
  type?: "text" | "invoice" | "projection" | "ocr_result";
  downloadUrl?: string;
  followUps?: string[];
  attachment?: string;
  ocrText?: string;
  analysis?: string;
}

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

function renderMarkdown(text: string) {
  const lines = text.split("\n");
  return <div className="space-y-2 break-words">{lines.map((line, index) => {
    const value = line.trim();
    if (!value) return <div key={index} className="h-1" />;
    const parts = value.split(/(\*\*[^*]+\*\*)/g).map((part, partIndex) =>
      part.startsWith("**") && part.endsWith("**") ? <strong key={partIndex} className="font-semibold text-foreground">{part.slice(2, -2)}</strong> : <span key={partIndex}>{part}</span>
    );
    if (/^#{1,3}\s/.test(value)) return <h3 key={index} className="pt-2 text-base font-bold tracking-tight text-slate-900">{parts}</h3>;
    if (/^[-*•]\s/.test(value)) return <div key={index} className="flex gap-2 pl-1 text-sm leading-7 text-slate-700"><span className="mt-0.5 text-primary">•</span><span>{value.replace(/^[-*•]\s/, "").split(/(\*\*[^*]+\*\*)/g).map((part, i) => part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : <span key={i}>{part}</span>)}</span></div>;
    if (/^\d+[.)]\s/.test(value)) return <div key={index} className="text-sm leading-7 text-slate-700">{parts}</div>;
    return <p key={index} className="text-sm leading-7 text-slate-700">{parts}</p>;
  })}</div>;
}

const AICommandCenter = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const raw = localStorage.getItem("user");
    const user = raw ? JSON.parse(raw) : null;
    const name = user?.ownerName || "there";
    const company = user?.companyName || "your business";

    setMessages([
      {
        id: 1,
        role: "ai",
        content: `Hello ${name}! I'm your **${company}** AI consultant. I can help you generate invoices, scan receipts, analyse finances, and answer business questions.`,
        followUps: [
          "Generate an invoice for my last client",
          "Scan a receipt for expense tracking",
          "Show my revenue projections for Q2",
        ],
      },
    ]);
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const copyResponse = async (message: Message) => {
    try {
      await navigator.clipboard.writeText(message.content);
      toast.success("Response copied");
    } catch {
      toast.error("Could not copy this response.");
    }
  };

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

    const ocrMsg: Message = {
      id: Date.now(),
      role: "ai",
      type: "ocr_result",
      content: data.analysis || `I've scanned your document. Detected as **${data.detectedType}** and memorised it.`,
      ocrText: data.extractedText.slice(0, 800) + (data.extractedText.length > 800 ? "…" : ""),
      analysis: data.analysis,
    };

    setMessages((prev) => [...prev, ocrMsg]);
    setAttachedFile(null);
    setOcrLoading(false);
  };

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

    let msgType: Message["type"] = "text";
    if (data.action === "download") msgType = "invoice";

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

  return (
    <AppLayout title="AI Command Center">
      <motion.div
        className="max-w-4xl mx-auto flex flex-col min-h-[calc(100vh-5.5rem)] gap-6"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      >
        <GlassCard hover={false} className="p-5 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
            <div className="flex items-start gap-3">
              <div className="h-11 w-11 rounded-2xl gradient-primary flex items-center justify-center shadow-sm ring-1 ring-primary/10 shrink-0">
                <Bot className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-primary/80">
                  AI workspace
                </p>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground mt-1">
                  Command Center
                </h2>
                <p className="text-sm text-muted-foreground mt-1 max-w-xl leading-relaxed">
                  Ask questions, attach documents for OCR, or generate invoices — responses stream from
                  your connected backend.
                </p>
              </div>
            </div>
            <BadgePill />
          </div>
        </GlassCard>

        <div className="flex-1 flex flex-col min-h-0 rounded-2xl border border-slate-200/90 bg-white/70 backdrop-blur-md shadow-sm overflow-hidden">
          <div className="flex-1 overflow-auto space-y-5 p-4 sm:p-6 scrollbar-hide">
            <AnimatePresence initial={false}>
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {msg.role === "ai" && (
                    <div className="h-9 w-9 rounded-xl gradient-primary flex items-center justify-center mr-3 mt-1 shrink-0 ring-1 ring-primary/10 shadow-sm">
                      <Bot className="h-4 w-4 text-primary-foreground" />
                    </div>
                  )}

                  <div
                    className={`max-w-[min(100%,36rem)] ${
                      msg.role === "user"
                        ? "bg-slate-900 text-slate-50 rounded-2xl rounded-br-md px-4 py-3 shadow-md"
                        : ""
                    }`}
                  >
                    {msg.role === "ai" && msg.type === "invoice" && (
                      <GlassCard className="p-5 mb-2">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                            <FileCheck className="h-5 w-5 text-emerald-700" />
                          </div>
                          <div>
                            <p className="font-semibold text-foreground">Invoice generated</p>
                            <p className="text-xs text-muted-foreground">Includes description &amp; signature</p>
                          </div>
                        </div>
                        <p className="text-sm text-foreground mb-4 leading-relaxed">
                          {renderMarkdown(msg.content)}
                        </p>
                        {msg.downloadUrl && (
                          <Button
                            variant="hero"
                            size="sm"
                            className="w-full rounded-xl"
                            onClick={() => {
                              const href = resolveInvoicePdfUrl(msg.downloadUrl);
                              if (href) window.open(href, "_blank", "noopener,noreferrer");
                            }}
                          >
                            <Download className="h-4 w-4 mr-2" /> Download PDF invoice
                          </Button>
                        )}
                      </GlassCard>
                    )}

                    {msg.role === "ai" && msg.type === "projection" && (
                      <GlassCard className="p-5 mb-2">
                        <div className="flex items-center gap-2 mb-4">
                          <TrendingUp className="h-5 w-5 text-primary" />
                          <p className="font-semibold text-foreground">Financial projection</p>
                        </div>
                        <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap font-mono text-xs bg-slate-50/80 p-3 rounded-xl border border-slate-100">
                          {msg.content}
                        </p>
                      </GlassCard>
                    )}

                    {msg.role === "ai" && msg.type === "ocr_result" && (
                      <GlassCard className="p-5 mb-2 border-l-4 border-l-primary">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                            <FileText className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <p className="font-semibold text-foreground">Document Analyzed</p>
                            <p className="text-xs text-muted-foreground">AI structural analysis complete</p>
                          </div>
                        </div>
                        <div className="text-sm text-foreground mb-4 leading-relaxed whitespace-pre-wrap">
                          {renderMarkdown(msg.content)}
                        </div>
                        {msg.ocrText && (
                          <div className="mt-4 p-3 bg-slate-50/90 rounded-xl border border-slate-100">
                            <details className="cursor-pointer">
                              <summary className="text-xs font-semibold text-muted-foreground hover:text-primary transition-colors">
                                View raw extracted text preview
                              </summary>
                              <p className="mt-2 text-[10px] text-foreground font-mono leading-relaxed opacity-70">
                                {msg.ocrText}
                              </p>
                            </details>
                          </div>
                        )}
                      </GlassCard>
                    )}

                    {msg.role === "ai" && msg.type !== "invoice" && msg.type !== "projection" && msg.type !== "ocr_result" && (
                      <GlassCard className="group p-4 sm:p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">{renderMarkdown(msg.content)}</div>
                          <motion.button type="button" whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.94 }} onClick={() => copyResponse(msg)} aria-label="Copy response" title="Copy response" className="shrink-0 rounded-lg p-2 text-slate-400 opacity-70 transition hover:bg-slate-100 hover:text-primary sm:opacity-0 sm:group-hover:opacity-100"><Copy className="h-4 w-4" /></motion.button>
                        </div>
                        {msg.ocrText && (
                          <div className="mt-3 p-3 bg-slate-50/90 rounded-xl border border-slate-100">
                            <p className="text-xs font-semibold text-muted-foreground mb-1">
                              Extracted text preview
                            </p>
                            <p className="text-xs text-foreground font-mono leading-relaxed">{msg.ocrText}</p>
                          </div>
                        )}
                      </GlassCard>
                    )}

                    {msg.role === "user" && (
                      <>
                        {msg.attachment && (
                          <p className="text-xs text-slate-300 mb-1">Attached: {msg.attachment}</p>
                        )}
                        <p className="text-sm leading-relaxed">{msg.content}</p>
                      </>
                    )}

                    {msg.followUps && msg.followUps.length > 0 && (
                      <div className="mt-3">
                        <div className="flex items-center gap-1.5 mb-2">
                          <Sparkles className="h-3.5 w-3.5 text-primary" />
                          <p className="text-xs font-semibold text-primary">Suggested follow-ups</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {msg.followUps.map((item) => (
                            <motion.button
                              key={item}
                              type="button"
                              whileHover={{ scale: 1.02, y: -1 }}
                              whileTap={{ scale: 0.98 }}
                              onClick={() => sendMessage(item)}
                              className="text-xs px-3 py-2 rounded-full bg-white/90 border border-slate-200/90 text-foreground shadow-sm hover:border-primary/25 hover:bg-primary/[0.06] transition-colors duration-300"
                            >
                              {item}
                            </motion.button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {isLoading && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex justify-start"
              >
                <div className="h-9 w-9 rounded-xl gradient-primary flex items-center justify-center mr-3 mt-1 shrink-0">
                  <Bot className="h-4 w-4 text-primary-foreground" />
                </div>
                <GlassCard className="p-4">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <TypingDots />
                  </div>
                </GlassCard>
              </motion.div>
            )}

            <div ref={endRef} />
          </div>

          {attachedFile && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 px-4 py-3 bg-primary/[0.05] border-t border-slate-100 backdrop-blur-sm"
            >
              <FileText className="h-4 w-4 text-primary shrink-0" />
              <span className="text-sm text-foreground flex-1 truncate font-medium">{attachedFile.name}</span>

              <Button
                size="sm"
                variant="hero"
                disabled={ocrLoading}
                onClick={handleOCR}
                className="h-8 text-xs rounded-lg shrink-0"
              >
                {ocrLoading ? (
                  <>
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Scanning…
                  </>
                ) : (
                  "Read document (OCR)"
                )}
              </Button>

              <button
                type="button"
                onClick={() => setAttachedFile(null)}
                className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded-lg"
              >
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          )}

          <div className="p-3 sm:p-4 border-t border-slate-100 bg-white/80 backdrop-blur-md">
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              accept="image/*,.pdf"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setAttachedFile(f);
                e.target.value = "";
              }}
            />

            <div className="rounded-2xl border border-slate-200/90 bg-white/90 backdrop-blur-sm shadow-sm flex items-center gap-2 p-1.5 transition-all duration-300 focus-within:ring-2 focus-within:ring-primary/15 focus-within:border-primary/25">
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 rounded-xl"
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
                className="border-0 bg-transparent focus-visible:ring-0 shadow-none rounded-xl"
                disabled={isLoading}
              />

              <Button
                id="ai-send-btn"
                variant="hero"
                size="icon"
                className="shrink-0 h-10 w-10 rounded-xl"
                disabled={isLoading || (!input.trim() && !attachedFile)}
                onClick={() => sendMessage()}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowUp className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </motion.div>
    </AppLayout>
  );
};

function BadgePill() {
  return (
    <div className="flex items-center gap-2 rounded-full border border-slate-200/90 bg-slate-50/80 px-3 py-1.5 text-xs text-muted-foreground shrink-0">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-40" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
      </span>
      Model ready
    </div>
  );
}

function TypingDots() {
  return (
    <span className="flex items-center gap-1 text-sm">
      Thinking
      <span className="inline-flex gap-0.5 ml-0.5">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="h-1 w-1 rounded-full bg-primary/70"
            animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
            transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
          />
        ))}
      </span>
    </span>
  );
}

export default AICommandCenter;
