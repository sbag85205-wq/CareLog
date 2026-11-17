import type { Metadata } from "next";
import { InviteAcceptApp } from "@/components/care-team/InviteAcceptApp";

export const metadata: Metadata = { title: "보호자 초대 · CareLog", referrer: "no-referrer" };

export default function Page() {
  return <InviteAcceptApp />;
}
