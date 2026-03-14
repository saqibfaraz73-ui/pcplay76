import React from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Share2, MessageCircle, Mail } from "lucide-react";

interface ContactShareMenuProps {
  whatsapp?: string;
  email?: string;
  /** Called when native share is selected (no WhatsApp/Email) */
  onShare: () => void | Promise<void>;
  /** PDF file name or message to share via WhatsApp/Email */
  shareText?: string;
  /** PDF blob URL to attach */
  pdfBlobUrl?: string;
  size?: "sm" | "default" | "lg" | "icon";
  className?: string;
  label?: string;
}

/**
 * Share button that shows WhatsApp / Email options if the contact has those details,
 * otherwise falls back to native share.
 */
export function ContactShareMenu({
  whatsapp,
  email,
  onShare,
  shareText = "",
  size = "sm",
  className,
  label = "Share",
}: ContactShareMenuProps) {
  const hasWhatsApp = !!whatsapp?.trim();
  const hasEmail = !!email?.trim();
  const hasContactOptions = hasWhatsApp || hasEmail;

  const openWhatsApp = () => {
    const phone = whatsapp!.trim().replace(/[^0-9+]/g, "");
    const msg = encodeURIComponent(shareText);
    window.open(`https://wa.me/${phone}?text=${msg}`, "_blank");
  };

  const openEmail = () => {
    const subject = encodeURIComponent("Report");
    const body = encodeURIComponent(shareText);
    window.open(`mailto:${email!.trim()}?subject=${subject}&body=${body}`, "_blank");
  };

  if (!hasContactOptions) {
    return (
      <Button variant="outline" size={size} className={className} onClick={() => void onShare()}>
        <Share2 className="h-3 w-3 mr-1" />
        {label}
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size={size} className={className}>
          <Share2 className="h-3 w-3 mr-1" />
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => void onShare()}>
          <Share2 className="h-4 w-4 mr-2" />
          Share (System)
        </DropdownMenuItem>
        {hasWhatsApp && (
          <DropdownMenuItem onClick={openWhatsApp}>
            <MessageCircle className="h-4 w-4 mr-2" />
            Send to WhatsApp
          </DropdownMenuItem>
        )}
        {hasEmail && (
          <DropdownMenuItem onClick={openEmail}>
            <Mail className="h-4 w-4 mr-2" />
            Send to Email
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
