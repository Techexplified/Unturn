import React, { useState } from "react";
import type { ReturnCause } from "../data/mockData";

interface DonutChartProps {
  causes: ReturnCause[];
  total: number;
}

export function DonutChart({ causes, total }: DonutChartProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const size = 144;
  const strokeWidth = 20;
  const radius = (size - strokeWidth) / 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;

  // Calculate cumulative offsets
  let cumulativePercent = 0;

  return (
    <div className="unturn-donut-visual">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Background track */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="#F1F5F9"
          strokeWidth={strokeWidth}
        />

        {causes.map((cause, index) => {
          const slicePercent = cause.shareNum / 100;
          // Apply a tiny gap between segments
          const gap = 1.5;
          const strokeDasharray = `${circumference * slicePercent - gap} ${
            circumference * (1 - slicePercent) + gap
          }`;
          const strokeDashoffset = -circumference * cumulativePercent;
          cumulativePercent += slicePercent;

          const isHovered = hoveredIdx === index;

          return (
            <circle
              key={cause.id}
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={cause.color}
              strokeWidth={isHovered ? strokeWidth + 4 : strokeWidth}
              strokeDasharray={strokeDasharray}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              style={{
                transform: "rotate(-90deg)",
                transformOrigin: "center",
                transition: "stroke-width 0.2s ease, opacity 0.2s ease",
                cursor: "pointer",
                opacity: hoveredIdx !== null && !isHovered ? 0.6 : 1,
              }}
              onMouseEnter={() => setHoveredIdx(index)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              <title>{`${cause.cause}: ${cause.returns} returns (${cause.share})`}</title>
            </circle>
          );
        })}
      </svg>

      <div className="unturn-donut-center">
        <div className="unturn-donut-center-num">
          {hoveredIdx !== null ? causes[hoveredIdx].returns : total}
        </div>
        <div className="unturn-donut-center-label">
          {hoveredIdx !== null ? causes[hoveredIdx].cause : "Total returns"}
        </div>
      </div>
    </div>
  );
}
