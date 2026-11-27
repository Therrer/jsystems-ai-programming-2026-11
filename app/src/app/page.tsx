import { Suspense } from "react";
import { connection } from "next/server";
import { CaseApp } from "@/components/case-app";

// The form reads today's date (Europe/Warsaw) while rendering. With cacheComponents, a `new Date()`
// during prerender fails the build, so the app renders at request time (Next 16 cache-components guide,
// "Fix synchronous IO"). The case flow is client state only; there is nothing to prerender.
async function RequestTimeApp() {
  await connection();
  return <CaseApp />;
}

export default function Page() {
  return (
    <Suspense>
      <RequestTimeApp />
    </Suspense>
  );
}
