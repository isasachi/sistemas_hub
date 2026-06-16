import { ComingSoon } from "@/components/tools/ComingSoon";
import { getToolBySlug } from "@/lib/tools";

export default function GeneradorBranding() {
  const tool = getToolBySlug("generador-branding")!;
  return <ComingSoon tool={tool} />;
}
