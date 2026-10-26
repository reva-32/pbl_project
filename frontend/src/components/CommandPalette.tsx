import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import {
  LayoutDashboard,
  MessageSquare,
  Bot,
  Wallet,
  Plug,
  Users,
  Settings,
  Search,
} from "lucide-react";

const routes = [
  { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
  { label: "Smart Inbox", path: "/inbox", icon: MessageSquare },
  { label: "AI Command Center", path: "/ai", icon: Bot },
  { label: "Financial Hub", path: "/finance", icon: Wallet },
  { label: "Integrations", path: "/integrations", icon: Plug },
  { label: "Directory", path: "/directory", icon: Users },
  { label: "Settings", path: "/settings", icon: Settings },
];

const quickActions = [
  { label: "Review Smart Inbox", hint: "Unread customer threads", path: "/inbox", icon: MessageSquare },
  { label: "Create an invoice with AI", hint: "Open AI Command Center", path: "/ai", icon: Bot },
  { label: "Check GST and invoices", hint: "Open Financial Hub", path: "/finance", icon: Wallet },
  { label: "Manage channel connections", hint: "Open Integrations", path: "/integrations", icon: Plug },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const palette = () => setOpen(true);
    window.addEventListener("keydown", down);
    window.addEventListener("msme:command-palette", palette);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("msme:command-palette", palette);
    };
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden md:flex items-center gap-2 rounded-xl border border-slate-200/90 bg-white/70 backdrop-blur-sm px-3 py-1.5 text-sm text-muted-foreground shadow-sm transition-all duration-300 hover:border-primary/25 hover:bg-white/90 hover:text-foreground hover:shadow-md min-w-[200px]"
      >
        <Search className="h-4 w-4 shrink-0 opacity-60" />
        <span className="truncate text-left flex-1">Search or jump…</span>
        <kbd className="pointer-events-none hidden lg:inline-flex h-5 select-none items-center gap-1 rounded border border-slate-200 bg-slate-50 px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
          ⌘K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Jump to a page or quick action…" />
        <CommandList>
          <CommandEmpty>No matches.</CommandEmpty>
          <CommandGroup heading="Navigate">
            {routes.map((r) => (
              <CommandItem
                key={r.path}
                value={`${r.label} ${r.path}`}
                onSelect={() => {
                  navigate(r.path);
                  setOpen(false);
                }}
              >
                <r.icon className="mr-2 h-4 w-4 text-primary" />
                {r.label}
                <CommandShortcut>↵</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="Quick actions">
            {quickActions.map((action) => (
              <CommandItem
                key={action.label}
                value={`${action.label} ${action.hint}`}
                onSelect={() => {
                  navigate(action.path);
                  setOpen(false);
                }}
              >
                <action.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                <span>{action.label}</span>
                <span className="ml-2 text-xs text-muted-foreground truncate">{action.hint}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
