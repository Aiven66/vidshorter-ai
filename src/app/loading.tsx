export default function Loading() {
  return (
    <div className="min-h-screen">
      <section className="relative overflow-hidden bg-gradient-to-b from-background to-muted/30">
        <div className="container mx-auto px-4 py-12 md:py-20">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-10">
              <div className="mb-4 h-7 w-64 mx-auto animate-pulse rounded-md bg-muted" />
              <div className="mb-4 h-12 w-96 mx-auto animate-pulse rounded-md bg-muted" />
              <div className="h-6 w-80 mx-auto animate-pulse rounded-md bg-muted" />
            </div>
            <div className="h-64 animate-pulse rounded-xl bg-muted" />
          </div>
        </div>
      </section>
      <section className="py-16 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="h-8 w-48 mx-auto mb-10 animate-pulse rounded-md bg-muted" />
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-48 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
