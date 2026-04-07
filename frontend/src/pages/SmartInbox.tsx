import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useEffect, useState } from "react";
import { IndianRupee, MessageSquare, Instagram, Facebook, AlertCircle, Loader2, CheckCircle2, Send, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";

const platformIcon = (platform: string) => {
  if (platform === "WhatsApp") return <MessageSquare className="h-4 w-4 text-success" />;
  if (platform === "Instagram") return <Instagram className="h-4 w-4 text-instagram" />;
  if (platform === "Facebook") return <Facebook className="h-4 w-4 text-facebook" />;
  return <MessageSquare className="h-4 w-4" />;
};

const SmartInbox = () => {
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [isSending, setIsSending] = useState(false);

  const loadMessages = async () => {
    setLoading(true);
    const { data, error } = await apiFetch<any[]>('/events?type=CUSTOMER_MSG');
    if (error) {
      toast.error(error);
    } else {
      // Show pending/unresolved first
      const sorted = (data || []).sort((a, b) => {
        if (a.status === 'PENDING' && b.status !== 'PENDING') return -1;
        if (a.status !== 'PENDING' && b.status === 'PENDING') return 1;
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      });
      setMessages(sorted);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadMessages();
  }, []);

  const handleReply = async (eventId: string) => {
    if (!replyText.trim()) return;

    setIsSending(true);
    const { error } = await apiFetch('/messages/reply', {
      method: 'POST',
      body: JSON.stringify({ eventId, message: replyText })
    });

    if (error) {
      toast.error(`Failed to send reply: ${error}`);
    } else {
      toast.success("Reply sent successfully via WhatsApp!");
      setReplyText("");
      setReplyingTo(null);
      loadMessages(); // Refresh to show RESOLVED status
    }
    setIsSending(false);
  };

  const markAsRead = async (id: string) => {
    // Optimistic local update
    setMessages(prev => prev.map(m => m._id === id ? { ...m, status: 'RESOLVED' } : m));
    toast.success("Message marked as resolved");
  };

  return (
    <AppLayout title="Smart Inbox">
      <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">AI-powered classification and 2-way messaging for social channels.</p>
          <Button variant="outline" size="sm" onClick={() => loadMessages()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : "Refresh"}
          </Button>
        </div>

        <div className="space-y-4">
          {loading ? (
            <div className="text-center py-12"><Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" /></div>
          ) : messages.length === 0 ? (
            <div className="text-center py-12 bg-card rounded-2xl border border-dashed border-muted-foreground/20">
              <CheckCircle2 className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-muted-foreground">Inbox is clean! No messages to review.</p>
            </div>
          ) : (
            messages.map((msg) => (
              <Card key={msg._id} className={`p-0 border-0 shadow-premium overflow-hidden bg-card transition-all duration-300 ${msg.content?.priority === 'HIGH' && msg.status === 'PENDING' ? 'ring-1 ring-destructive/20 shadow-destructive/5' : ''} ${msg.status === 'RESOLVED' ? 'opacity-70 grayscale-[0.5]' : ''}`}>
                <div className="flex flex-col sm:flex-row">
                  {/* Left Indicator bar */}
                  <div className={`w-1 sm:w-1.5 ${
                    msg.status === 'RESOLVED' ? 'bg-muted' :
                    msg.content?.category === 'URGENT' ? 'bg-destructive' : 
                    msg.content?.category === 'PAYMENT' ? 'bg-primary' : 'bg-muted-foreground/20'
                  }`} />
                  
                  <div className="flex-1 p-5 flex flex-col gap-4">
                    <div className="flex flex-col sm:flex-row gap-4">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px] uppercase font-bold py-0 h-5">
                            {platformIcon(msg.content?.platform)}
                            <span className="ml-1">{msg.content?.platform}</span>
                          </Badge>
                          {msg.status === 'RESOLVED' ? (
                            <Badge className="bg-success/10 text-success border-success/20 text-[10px] uppercase font-bold py-0 h-5">RESOLVED</Badge>
                          ) : (
                            <>
                              {msg.content?.category === 'URGENT' && (
                                <Badge variant="destructive" className="text-[10px] uppercase font-bold py-0 h-5 gap-1">
                                  <AlertCircle className="h-3 w-3" /> URGENT
                                </Badge>
                              )}
                              {msg.content?.category === 'PAYMENT' && (
                                <Badge variant="default" className="bg-primary text-primary-foreground text-[10px] uppercase font-bold py-0 h-5 gap-1">
                                  <IndianRupee className="h-3 w-3" /> PAYMENT
                                </Badge>
                              )}
                            </>
                          )}
                          <span className="text-[11px] text-muted-foreground ml-auto">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        
                        <div className="flex flex-col">
                          <p className="font-semibold text-foreground">Message from {msg.content?.sender}</p>
                          <p className="text-sm text-foreground/80 mt-1">"{msg.content?.text}"</p>
                        </div>

                        <div className="bg-accent/40 rounded-lg p-3 border border-accent">
                          <p className="text-[11px] font-bold text-muted-foreground uppercase flex items-center gap-1 mb-1">
                            ✨ AI Summary
                          </p>
                          <p className="text-xs text-foreground italic">{msg.content?.summary}</p>
                        </div>
                      </div>

                      {msg.status !== 'RESOLVED' && (
                        <div className="flex sm:flex-col gap-2 justify-end sm:justify-center border-t sm:border-t-0 sm:border-l border-muted/20 pt-3 sm:pt-0 sm:pl-4">
                          <Button size="sm" className="h-8 px-4" onClick={() => markAsRead(msg._id)}>Resolve</Button>
                          <Button 
                            variant={replyingTo === msg._id ? "secondary" : "outline"} 
                            size="sm" 
                            className="h-8 px-4"
                            onClick={() => setReplyingTo(replyingTo === msg._id ? null : msg._id)}
                          >
                            {replyingTo === msg._id ? "Cancel" : "Reply"}
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Reply Expansion */}
                    {replyingTo === msg._id && (
                      <div className="mt-2 pt-4 border-t border-muted/20 animate-in slide-in-from-top-2 duration-300">
                        <div className="flex gap-2">
                          <Input 
                            placeholder="Type your WhatsApp reply..." 
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleReply(msg._id)}
                            className="bg-card border-muted-foreground/20 focus-visible:ring-primary/30"
                            disabled={isSending}
                          />
                          <Button 
                            size="icon" 
                            className="shrink-0" 
                            onClick={() => handleReply(msg._id)}
                            disabled={isSending || !replyText.trim()}
                          >
                            {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="shrink-0" 
                            onClick={() => setReplyingTo(null)}
                            disabled={isSending}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-2 px-1 italic">
                          Replying to {msg.content?.sender} via WhatsApp Business API
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      </div>
    </AppLayout>
  );
};

export default SmartInbox;
