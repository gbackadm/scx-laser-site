import { MessageCircle } from "lucide-react";
import Link from "next/link";

export function FloatingWhatsApp() {
  return (
    <Link
      href="https://wa.me/5547997228686"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chamar no WhatsApp"
      className="fixed bottom-5 right-5 z-[60] inline-flex h-14 w-14 animate-[pulse_2.4s_ease-in-out_infinite] items-center justify-center rounded-full bg-[#25d366] text-white shadow-[0_12px_30px_rgba(37,211,102,0.28)] transition duration-300 hover:scale-105 hover:bg-[#20bd5a] sm:bottom-6 sm:right-6 sm:h-16 sm:w-16"
    >
      <MessageCircle size={30} strokeWidth={2.2} />
    </Link>
  );
}
