// Simple, modern duck glyph used as the app logo.
import { useTheme } from "../store/theme";

export function DuckLogo({ size = 64 }: { size?: number }) {
  const theme = useTheme((s) => s.theme);
  const stroke = theme === "dark" ? "#e0a93c" : "#c98a1f";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Quack Writer logo"
    >
      <path
        d="M22 38c-6 0-11-4-11-10 0-5 4-9 9-9 1 0 2 0 3 .4C25 14 30 11 36 11c9 0 16 7 16 16 0 6-3 11-8 14"
        stroke={stroke}
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M44 41l8 3-3 5-8-1 3-7Z"
        fill={stroke}
        opacity="0.9"
      />
      <circle cx="38" cy="22" r="2.1" fill={stroke} />
      <path
        d="M22 38c2 8 9 14 18 14 4 0 8-1 11-4"
        stroke={stroke}
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}