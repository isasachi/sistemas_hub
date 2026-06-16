import { ComingSoon } from "@/components/tools/ComingSoon";
import { getToolBySlug } from "@/lib/tools";

export default function GeneradorLanding() {
  const tool = getToolBySlug("generador-landing")!;
  return <ComingSoon tool={tool} />;
}
