import { MessageCircle } from "lucide-react";
import Link from "next/link";

export function FloatingWhatsApp() {
  return (
    <div className="fixed bottom-7 right-5 z-[60] flex items-center gap-3 sm:bottom-8 sm:right-7">
      <div className="relative hidden rounded-md border border-white/12 bg-black/82 px-4 py-2 text-right shadow-[0_12px_28px_rgba(0,0,0,0.34)] backdrop-blur-md sm:block">
        <span className="block text-xs font-black uppercase tracking-normal text-white">
          Fale conosco
        </span>
        <span className="block text-[0.68rem] font-medium text-zinc-300">
          pelo WhatsApp
        </span>
        <span className="absolute -right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rotate-45 border-r border-t border-white/12 bg-black/82" />
      </div>

      <Link
        href="https://wa.me/5547997228686"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Chamar no WhatsApp"
        className="inline-flex h-14 w-14 animate-[pulse_3.2s_ease-in-out_infinite] items-center justify-center rounded-full bg-[#25d366] text-white shadow-[0_10px_24px_rgba(37,211,102,0.24)] transition duration-300 hover:scale-105 hover:bg-[#20bd5a] sm:h-16 sm:w-16"
      >
        <MessageCircle size={30} strokeWidth={2.2} />
      </Link>
    </div>
  );
}
