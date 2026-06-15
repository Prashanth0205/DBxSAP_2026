export function HomePage() {
  return (
    <div className="max-w-2xl mx-auto space-y-6 mt-12 text-center">
      <div className="space-y-3">
        <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold tracking-wide uppercase bg-[#FF3621] text-white">
          DBxSAP Hackathon 2026
        </span>
        <h2 className="text-4xl font-bold text-gray-900">
          Find India's Care Gaps.
        </h2>
        <p className="text-lg text-gray-500">
          Disha uses AI to turn 10,000 messy facility records into decisions planners can trust —
          with honest uncertainty, not false confidence.
        </p>
      </div>
      <div className="flex gap-4 justify-center pt-4">
        <a
          href="/map"
          className="px-6 py-3 bg-[#FF3621] text-white rounded-lg font-medium hover:bg-[#cc2b1a] transition-colors"
        >
          Open Coverage Map →
        </a>
        <a
          href="/workspace"
          className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-100 transition-colors"
        >
          Planning Workspace
        </a>
      </div>
    </div>
  );
}
