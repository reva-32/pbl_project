import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, Loader2, Send } from "lucide-react";

interface EditDraftModalProps {
  open: boolean;
  onClose: () => void;
  platform: string;
  customerName: string;
  initialDraft: string;
  /** Must reject when the provider rejects the reply. */
  onSend: (text: string) => Promise<void>;
}

export function EditDraftModal({
  open,
  onClose,
  platform,
  customerName,
  initialDraft,
  onSend,
}: EditDraftModalProps) {
  const [draft, setDraft] = useState(initialDraft);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDraft(initialDraft);
      setError(null);
      setSending(false);
    }
  }, [open, initialDraft]);

  const handleSend = async () => {
    const text = draft.trim();
    if (!text) {
      setError("Write a reply before sending.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      await onSend(text);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The reply could not be sent.");
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !sending) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit AI draft reply</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Replying to {customerName} on {platform}
          </p>
        </DialogHeader>

        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="min-h-[160px] resize-none"
          placeholder="Edit the AI-generated response..."
          disabled={sending}
          aria-label="Reply text"
        />

        {error ? (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={sending}>
            Cancel
          </Button>
          <Button variant="hero" onClick={handleSend} disabled={sending || !draft.trim()}>
            {sending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
            {sending ? "Sending…" : `Send to ${platform}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
