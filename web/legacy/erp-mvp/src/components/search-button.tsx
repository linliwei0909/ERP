"use client";

export function SearchButton({ type = "submit" }: { type?: "button" | "submit" }) {
  return (
    <button
      className="search-button"
      type={type}
      title="搜尋"
      aria-label="搜尋"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </svg>
    </button>
  );
}
