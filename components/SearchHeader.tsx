"use client";

import { useSearchBox } from "react-instantsearch";

export default function SearchHeader() {
  const { query, refine } = useSearchBox();

  return (
    <div className="flex items-center gap-4 mb-4 flex-wrap">
      <div className="font-extrabold text-xl text-brand tracking-tight">
        OpenTable
      </div>
      <div className="flex-1 min-w-[220px] flex items-center gap-2.5 bg-white border-[1.5px] border-border-strong rounded-full px-5 py-3 shadow-sm">
        <span className="text-lg text-brand">&#8981;</span>
        <input
          type="search"
          value={query}
          onChange={(event) => refine(event.currentTarget.value)}
          placeholder="Search restaurants, cuisines, locations…"
          autoComplete="off"
          className="w-full bg-transparent text-[15px] text-ink placeholder:text-muted outline-none"
        />
      </div>
    </div>
  );
}
