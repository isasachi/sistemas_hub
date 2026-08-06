import Link from "next/link";
import { Zap } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-10 jr-grid bg-[#0a0a0a]">
      {/* Glow cálido superior */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 0%, rgba(255,150,90,0.12) 0%, transparent 55%)",
        }}
      />
      {/* Marca en dorado, igual que en la barra del hub: el naranja queda para
          el botón de entrar, que es la única acción de la pantalla. */}
      <Link href="/" className="relative z-10 mb-7 flex items-center gap-2.5 no-underline">
        <div className="flex h-[34px] w-[34px] items-center justify-center rounded-xl border border-[rgba(214,168,96,0.35)] bg-[rgba(214,168,96,0.1)] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
          <Zap className="h-[17px] w-[17px] text-[#d6a860]" />
        </div>
        <span className="jr-wordmark text-[19px] text-[#ededed]">
          JR <span className="text-[#d6a860]">AI HUB</span>
        </span>
      </Link>
      <div className="relative z-10 w-full flex justify-center">{children}</div>
    </div>
  );
}
