import LandingV2 from '@/components/tools/landing-v2/LandingV2'

// Landing Generator v2: wizard o chat sobre el mismo núcleo. La vista es direccionable por URL
// (`?view=wizard|chat`); sin parámetro manda la preferencia guardada.
export default async function GeneradorLandingV2({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams
  return <LandingV2 initialView={view === 'chat' || view === 'wizard' ? view : null} />
}
