import { Activity, AlertTriangle, CheckCircle2, FileQuestion } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/primitives";
import { TRIAGE_LABEL } from "@/lib/labels";
import type { TriageFlag } from "@/types";

const META: Record<TriageFlag, { tone: BadgeTone; icon: typeof Activity }> = {
  review: { tone: "red", icon: AlertTriangle },
  change: { tone: "amber", icon: Activity },
  insufficient: { tone: "slate", icon: FileQuestion },
  stable: { tone: "teal", icon: CheckCircle2 },
};

export function TriageBadge({ flag }: { flag: TriageFlag }) {
  const m = META[flag];
  return (
    <Badge tone={m.tone} icon={m.icon}>
      {TRIAGE_LABEL[flag]}
    </Badge>
  );
}
