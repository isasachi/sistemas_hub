import Link from "next/link";
import Image from "next/image";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-10 jr-grid bg-[#14050a]">
      {/* Glow cálido superior */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 0%, rgba(232,70,122,0.12) 0%, transparent 55%)",
        }}
      />
      {/* El logotipo original, sin recomponer: es la única pantalla con
          espacio para el lockup entero. El PNG es granate pleno, así que el
          hairline es lo que lo separa del fondo. El carmesí queda para el
          botón de entrar, la única acción de la pantalla. */}
      <Link href="/" className="relative z-10 mb-8 no-underline" aria-label="Legacy Brand">
        <Image
          src="/brand/logo.png"
          alt="Legacy Brand"
          width={128}
          height={128}
          priority
          className="rounded-2xl border border-[rgba(246,242,235,0.10)] shadow-[0_18px_50px_rgba(8,2,5,0.6)]"
        />
      </Link>
      <div className="relative z-10 w-full flex justify-center">{children}</div>
    </div>
  );
}
