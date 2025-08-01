export default function Home() {
  return (
    <main className="min-h-screen bg-gray-950 text-white flex justify-center items-center">
      <div className="bg-gray-900 p-8 rounded-2xl shadow-xl w-[300px] text-center">
        <h2 className="text-xl font-semibold mb-6 text-gray-100">Go To:</h2>

        <div className="space-y-6">
          <div>
            <a
              href="/stream"
              className="block w-full border border-white text-white py-2 px-4 rounded-xl transition"
            >
              /Stream
            </a>
            <p className="text-xs text-gray-400 mt-1">For joining the call</p>
          </div>

          <div>
            <a
              href="/watch"
              className="block w-full border border-white text-white py-2 px-4 rounded-xl transition"
            >
              /Watch
            </a>
            <p className="text-xs text-gray-400 mt-1">
              To watch the call as HLS
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
