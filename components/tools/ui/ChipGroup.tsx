"use client";

interface ChipGroupProps {
  options: string[];
  selected: string | string[];
  multi?: boolean;
  onChange: (val: string | string[]) => void;
}

export function ChipGroup({ options, selected, multi = false, onChange }: ChipGroupProps) {
  const selectedArr = Array.isArray(selected) ? selected : [selected];

  function toggle(opt: string) {
    if (multi) {
      const arr = Array.isArray(selected) ? selected : [];
      onChange(arr.includes(opt) ? arr.filter((s) => s !== opt) : [...arr, opt]);
    } else {
      onChange(opt);
    }
  }

  return (
    <div className="flex flex-wrap gap-2 mt-1">
      {options.map((opt) => {
        const active = selectedArr.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => toggle(opt)}
            className={[
              "px-3.5 py-1.5 rounded-full border text-[13px] font-medium cursor-pointer transition-all duration-200 font-sans",
              active
                ? "bg-[rgba(255,156,77,0.12)] border-[rgba(255,156,77,0.4)] text-[#ff9c4d] font-semibold"
                : "bg-white/[0.04] border-white/[0.06] text-[#bdbdbd] hover:border-[rgba(255,156,77,0.3)] hover:text-[#f5f5f5]",
            ].join(" ")}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}
