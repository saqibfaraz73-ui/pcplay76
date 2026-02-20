import React from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, Share2, ChevronDown } from "lucide-react";
import { FileNamePrompt } from "@/components/FileNamePrompt";

interface SaveShareMenuProps {
  /** Called with the user-chosen fileName when saving */
  onSave: (fileName?: string) => void | Promise<void>;
  onShare: () => void | Promise<void>;
  /** Return the default file name for the rename dialog. If omitted, onSave is called without a name. */
  getDefaultFileName?: () => string;
  label?: string;
  size?: "sm" | "default" | "lg" | "icon";
  variant?: "default" | "outline" | "secondary" | "ghost" | "destructive" | "link";
  disabled?: boolean;
  className?: string;
}

export function SaveShareMenu({
  onSave,
  onShare,
  getDefaultFileName,
  label = "Export",
  size = "sm",
  variant = "outline",
  disabled = false,
  className,
}: SaveShareMenuProps) {
  const [busy, setBusy] = React.useState(false);
  const [renameOpen, setRenameOpen] = React.useState(false);
  const [currentDefault, setCurrentDefault] = React.useState("");

  const wrap = (fn: () => void | Promise<void>) => async () => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const handleSaveClick = () => {
    if (getDefaultFileName) {
      setCurrentDefault(getDefaultFileName());
      setRenameOpen(true);
    } else {
      void wrap(() => onSave())();
    }
  };

  const handleRenameConfirm = (fileName: string) => {
    setRenameOpen(false);
    void wrap(() => onSave(fileName))();
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant={variant} size={size} disabled={disabled || busy} className={className}>
            <Download className="h-3 w-3 mr-1" />
            {label}
            <ChevronDown className="h-3 w-3 ml-1" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={handleSaveClick}>
            <Download className="h-4 w-4 mr-2" />
            Save to Device
          </DropdownMenuItem>
          <DropdownMenuItem onClick={wrap(onShare)}>
            <Share2 className="h-4 w-4 mr-2" />
            Share
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <FileNamePrompt
        open={renameOpen}
        defaultName={currentDefault}
        onConfirm={handleRenameConfirm}
        onCancel={() => setRenameOpen(false)}
      />
    </>
  );
}
