import VideoWizard from "@/components/tools/generador-video-ads/VideoWizard";
import KieKeyRequired from "@/components/tools/generador-video-ads/KieKeyRequired";

// El chrome (volver, riel de pasos, reiniciar) lo trae StepWizard desde adentro.
export default function GeneradorVideoAdsWizard() {
  return (
    <KieKeyRequired>
      <VideoWizard />
    </KieKeyRequired>
  );
}
