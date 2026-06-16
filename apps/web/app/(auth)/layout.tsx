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
      <Link href="/" className="relative z-10 flex items-center gap-2.5 no-underline mb-7">
        <div className="w-[34px] h-[34px] rounded-lg flex items-center justify-center jr-cta">
          <Zap className="w-[18px] h-[18px] text-[#1c0f03] fill-[#1c0f03]" />
        </div>
        <span className="text-[16px] font-bold text-[#f5f5f5] tracking-[0.2px] font-[Poppins]">
          JR <span className="text-[#ff9c4d]">AI Hub</span>
        </span>
      </Link>
      <div className="relative z-10 w-full flex justify-center">{children}</div>
    </div>
  );
}
