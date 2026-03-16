import { useState, useRef } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Paperclip, ArrowUp, Bot, FileCheck, TrendingUp, FileText, X } from "lucide-react";

interface Message {
  id: number;
  role: "user" | "ai";
  content: string;
  type?: "text" | "invoice" | "projection";
  followUps?: { header: string; items: string[] };
  attachment?: string;
}

const initialMessages: Message[] = [
  {
    id: 1, role: "ai", content: "Hello! I'm your MSME 360 AI assistant. I can help you generate invoices, scan receipts, analyze finances, and answer business questions. How can I help you today?",
    followUps: {
      header: "Quick Actions",
      items: ["Generate an invoice for my last client", "Scan a receipt for expense tracking", "Show my revenue projections for Q2"]
    }
  },
];

const AICommandCenter = () => {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [attachment, setAttachment] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const sendMessage = (text?: string) => {
    const content = text || input;
    if (!content.trim() && !attachment) return;

    const userMsg: Message = { id: Date.now(), role: "user", content, attachment: attachment || undefined };
    const newMessages = [...messages, userMsg];

    // Simulate AI response
    let aiResponse: Message;
    if (content.toLowerCase().includes("invoice")) {
      aiResponse = { id: Date.now() + 1, role: "ai", content: "I've generated the invoice based on your details.", type: "invoice" };
    } else if (content.toLowerCase().includes("revenue") || content.toLowerCase().includes("projection")) {
      aiResponse = { id: Date.now() + 1, role: "ai", content: "Here are your financial projections based on the current quarter data:", type: "projection" };
    } else {
      aiResponse = {
        id: Date.now() + 1, role: "ai", content: "I've analyzed your request. Based on your business data, I recommend focusing on optimizing your supply chain costs and exploring bulk purchasing agreements with your top 3 suppliers.\n\nThis could potentially save you **₹45,000/month** based on your current spending patterns.",
        followUps: { header: "Suggested Follow-ups", items: ["Show me supplier comparison data", "Draft a negotiation email", "Calculate break-even for bulk orders"] }
      };
    }

    setMessages([...newMessages, aiResponse]);
    setInput("");
    setAttachment(null);
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  return (
    <AppLayout title="AI Command Center">
      <div className="max-w-3xl mx-auto h-[calc(100vh-8rem)] flex flex-col">
        {/* Chat Messages */}
        <div className="flex-1 overflow-auto space-y-4 pb-4 animate-fade-in">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "ai" && (
                <div className="h-8 w-8 rounded-lg gradient-primary flex items-center justify-center mr-3 mt-1 shrink-0">
                  <Bot className="h-4 w-4 text-primary-foreground" />
                </div>
              )}
              <div className={`max-w-[80%] ${msg.role === "user" ? "bg-secondary text-secondary-foreground rounded-2xl rounded-br-md px-4 py-3" : ""}`}>
                {msg.role === "ai" && msg.type === "invoice" && (
                  <Card className="p-5 border-0 shadow-premium bg-card mb-2">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="h-10 w-10 rounded-xl bg-success/15 flex items-center justify-center">
                        <FileCheck className="h-5 w-5 text-success" />
                      </div>
                      <div>
                        <p className="font-semibold text-foreground">Invoice Generated</p>
                        <p className="text-xs text-muted-foreground">Includes description and signature</p>
                      </div>
                    </div>
                    <Button variant="hero" size="sm" className="w-full">
                      <FileText className="h-4 w-4 mr-1" /> Download PDF
                    </Button>
                  </Card>
                )}
                {msg.role === "ai" && msg.type === "projection" && (
                  <Card className="p-5 border-0 shadow-premium bg-card mb-2">
                    <p className="text-sm text-muted-foreground mb-3">{msg.content}</p>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: "Revenue", value: "₹8,40,000", trend: "+12%" },
                        { label: "Expenses", value: "₹5,20,000", trend: "-3%" },
                        { label: "Profit", value: "₹3,20,000", trend: "+24%" },
                      ].map((item) => (
                        <div key={item.label} className="text-center p-3 rounded-xl bg-accent/50">
                          <p className="text-xs text-muted-foreground">{item.label}</p>
                          <p className="text-lg font-bold text-foreground">{item.value}</p>
                          <div className="flex items-center justify-center gap-0.5 text-success text-xs font-medium">
                            <TrendingUp className="h-3 w-3" /> {item.trend}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
                {msg.role === "ai" && msg.type !== "invoice" && msg.type !== "projection" && (
                  <Card className="p-4 border-0 shadow-premium bg-card">
                    <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                  </Card>
                )}
                {msg.role === "user" && (
                  <>
                    {msg.attachment && <p className="text-xs text-muted-foreground mb-1">📎 {msg.attachment}</p>}
                    <p className="text-sm leading-relaxed">{msg.content}</p>
                  </>
                )}
                {msg.followUps && (
                  <div className="mt-3">
                    <p className="text-xs font-semibold text-foreground mb-2">{msg.followUps.header}</p>
                    <div className="space-y-1.5">
                      {msg.followUps.items.map((item) => (
                        <button key={item} onClick={() => sendMessage(item)} className="block text-sm text-primary hover:underline cursor-pointer text-left">
                          • {item}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>

        {/* OCR Bar */}
        {attachment && (
          <div className="flex items-center gap-2 px-4 py-2 bg-accent rounded-t-xl border border-b-0 border-border">
            <FileText className="h-4 w-4 text-accent-foreground" />
            <span className="text-sm text-foreground flex-1 truncate">{attachment}</span>
            <Button variant="hero" size="sm">Read Document (OCR)</Button>
            <button onClick={() => setAttachment(null)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Input Bar */}
        <div className={`bg-card border border-border shadow-elevated p-2 flex items-center gap-2 ${attachment ? "rounded-b-xl" : "rounded-xl"}`}>
          <input ref={fileRef} type="file" className="hidden" onChange={(e) => setAttachment(e.target.files?.[0]?.name || null)} />
          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => fileRef.current?.click()}>
            <Paperclip className="h-4 w-4 text-muted-foreground" />
          </Button>
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder="Ask a question, request an invoice, or scan a document..."
            className="border-0 bg-transparent focus-visible:ring-0 shadow-none"
          />
          <Button variant="hero" size="icon" className="shrink-0 h-9 w-9" onClick={() => sendMessage()}>
            <ArrowUp className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </AppLayout>
  );
};

export default AICommandCenter;
