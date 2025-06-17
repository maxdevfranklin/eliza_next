import { Suspense } from "react";

import { Chat } from "@/components/chat-simple";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Chat />
    </Suspense>
  );
}
