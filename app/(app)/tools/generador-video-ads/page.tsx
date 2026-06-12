import { ComingSoon } from "@/components/tools/ComingSoon";
import { getToolBySlug } from "@/lib/tools";

export default function GeneradorVideoAds() {
  const tool = getToolBySlug("generador-video-ads")!;
  return <ComingSoon tool={tool} />;
}
