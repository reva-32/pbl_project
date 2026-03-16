import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send } from "lucide-react";

interface EditDraftModalProps {
  open: boolean;
  onClose: () => void;
  platform: string;
  customerName: string;
  initialDraft: string;
}

export function EditDraftModal({ open, onClose, platform, customerName, initialDraft }: EditDraftModalProps) {
  const [draft, setDraft] = useState(initialDraft);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit AI Draft Reply</DialogTitle>
          <p className="text-sm text-muted-foreground">Replying to {customerName} on {platform}</p>
        </DialogHeader>
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="min-h-[160px] resize-none"
          placeholder="Edit the AI-generated response..."
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="hero" onClick={onClose}>
            <Send className="h-4 w-4 mr-1" />
            Send to {platform}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
