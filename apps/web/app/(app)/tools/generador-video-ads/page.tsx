import KieKeyRequired from "@/components/tools/generador-video-ads/KieKeyRequired";
import Intro from "./Intro";

// Server component solo para poder gatear por la API key de KIE del usuario antes de
// dejar entrar; la vista en sí sigue siendo cliente (`Intro`).
export default function GeneradorVideoAds() {
  return (
    <KieKeyRequired>
      <Intro />
    </KieKeyRequired>
  );
}
