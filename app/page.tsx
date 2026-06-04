export default function Home() {
  return (
    <main className="grid min-h-dvh place-items-center bg-[#f7f4ed] px-5 text-[#241f1a]">
      <section className="w-full max-w-md border border-[#241f1a] bg-[#fffaf0] p-6 shadow-[8px_8px_0_#241f1a]">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#7b5b2d]">
          Workupdate AI
        </p>
        <h1 className="mt-2 text-2xl font-semibold">Chrome extension</h1>
        <a
          href="/workupdate-ai-extension.zip"
          download
          className="mt-6 block border border-[#241f1a] bg-[#d95f2b] px-4 py-3 text-center text-sm font-bold text-white shadow-[4px_4px_0_#241f1a] transition hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[6px_6px_0_#241f1a] active:translate-x-0 active:translate-y-0 active:shadow-none"
        >
          Download latest extension
        </a>
      </section>
    </main>
  );
}
