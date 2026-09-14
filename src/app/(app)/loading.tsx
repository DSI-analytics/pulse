import { Skeleton } from "@/components/ui/skeleton";

/** Immediate route fallback while a data-heavy page is rendered on the server. */
export default function AppLoading() {
  return (
    <div className="animate-rise space-y-5" aria-busy="true">
      <div className="space-y-2">
        <Skeleton className="h-3 w-24 rounded-full" />
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-4 w-[30rem] max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="surface-card space-y-3 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-24 max-w-[65%]" />
              <Skeleton className="size-7 rounded-full" />
            </div>
            <Skeleton className="h-7 w-20" />
            <Skeleton className="h-3 w-28 max-w-[80%]" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    </div>
  );
}
