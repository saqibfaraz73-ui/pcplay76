import React from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, Share2, ChevronDown } from "lucide-react";

interface SaveShareMenuProps {
  onSave: () => void | Promise<void>;
  onShare: () => void | Promise<void>;
  label?: string;
  size?: "sm" | "default" | "lg" | "icon";
  variant?: "default" | "outline" | "secondary" | "ghost" | "destructive" | "link";
  disabled?: boolean;
  className?: string;
}

export function SaveShareMenu({
  onSave,
  onShare,
  label = "Export",
  size = "sm",
  variant = "outline",
  disabled = false,
  className,
}: SaveShareMenuProps) {
  const [busy, setBusy] = React.useState(false);

  const wrap = (fn: () => void | Promise<void>) => async () => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={size} disabled={disabled || busy} className={className}>
          <Download className="h-3 w-3 mr-1" />
          {label}
          <ChevronDown className="h-3 w-3 ml-1" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={wrap(onSave)}>
          <Download className="h-4 w-4 mr-2" />
          Save to Device
        </DropdownMenuItem>
        <DropdownMenuItem onClick={wrap(onShare)}>
          <Share2 className="h-4 w-4 mr-2" />
          Share
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
