import type { CSSProperties } from "react";

// Small hand-authored stroke icon set (not an emoji font, not a
// third-party icon package) — simple geometric line icons at a
// consistent 18x18/1.8-stroke style, inheriting `currentColor` so they
// pick up whatever color the surrounding button/text already uses.
// Deliberately minimal: only the icons this app actually needs.

interface IconProps {
  size?: number;
  style?: CSSProperties;
}

function Svg({ size = 18, style, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: "block", flexShrink: 0, ...style }}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function MicIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <path d="M12 17v4" />
      <path d="M9 21h6" />
    </Svg>
  );
}

export function CameraIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="2" y="6" width="13" height="12" rx="2.5" />
      <path d="M15 10.5 22 7v10l-7-3.5z" />
    </Svg>
  );
}

export function ScreenShareIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="2.5" y="4" width="19" height="12.5" rx="2" />
      <path d="M9 20h6" />
      <path d="M12 9.5v4" />
      <path d="M9.8 11.7 12 9.5l2.2 2.2" />
    </Svg>
  );
}

export function TextBoardIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="4" width="18" height="14" rx="2" />
      <path d="M7 9h10" />
      <path d="M7 13h6" />
    </Svg>
  );
}

/** A chair seen from the side: backrest, seat, two legs. */
export function ChairIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7 4v9" />
      <path d="M7 13h10" />
      <path d="M8 13v7" />
      <path d="M16 13v7" />
      <path d="M7 9h3" />
    </Svg>
  );
}

export function MicOffIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9 9v3a3 3 0 0 0 4.6 2.5" />
      <path d="M15 5a3 3 0 0 0-6 0v3" />
      <path d="M5 10a7 7 0 0 0 9.5 6.6" />
      <path d="M19 10a7 7 0 0 1-1.2 3.9" />
      <path d="M12 17v4" />
      <path d="M9 21h6" />
      <path d="M3 3l18 18" />
    </Svg>
  );
}

export function EditIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 20l4-1 11-11-3-3L5 16l-1 4z" />
      <path d="M14 6l3 3" />
    </Svg>
  );
}

export function ChatIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 5h16v11H8l-4 4V5z" />
    </Svg>
  );
}

export function VrHeadsetIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="2" y="7" width="20" height="11" rx="4" />
      <circle cx="8" cy="12.5" r="1.6" />
      <circle cx="16" cy="12.5" r="1.6" />
      <path d="M10.5 12.5h3" />
      <path d="M6 7V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2" />
    </Svg>
  );
}

export function EyeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </Svg>
  );
}

export function PersonIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="6" r="3" />
      <path d="M6 21v-3a6 6 0 0 1 12 0v3" />
    </Svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 5l14 14M19 5L5 19" />
    </Svg>
  );
}

export function WaveIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8 13V6a1.5 1.5 0 0 1 3 0v5" />
      <path d="M11 11V4a1.5 1.5 0 0 1 3 0v7" />
      <path d="M14 11.5V6a1.5 1.5 0 0 1 3 0v7" />
      <path d="M17 12.5V9a1.5 1.5 0 0 1 3 0v6c0 3.3-2.7 6-6 6h-1a6 6 0 0 1-5-2.7L5.5 13.8a1.4 1.4 0 0 1 2.3-1.6L8 13" />
    </Svg>
  );
}

/*
 * The posture icons (jump, crouch, seiza) are drawn solid rather than in
 * the 1.8 stroke the rest of the set uses. They sit alone on round touch
 * buttons at about 22px, where a hairline stick figure with a dotted
 * ground read as a scribble; a filled head and thick rounded limbs survive
 * that size. Each stands on a soft shadow instead of a ground line, which
 * also says "in the air" for jump without any extra marks.
 */
const POSE = { stroke: "currentColor", strokeWidth: 2.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };

/** Arms up, knees tucked, lifted clear of its shadow. */
export function JumpIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="4.4" r="2.6" fill="currentColor" stroke="none" />
      <path {...POSE} d="M12 8.6v4.6M12 9.4 8 6.2M12 9.4l4-3.2M12 13.2l-3 2.6 1.6 2.6M12 13.2l3 2.6-1.6 2.6" />
      <ellipse cx="12" cy="22.2" rx="4.2" ry="1" fill="currentColor" stroke="none" opacity="0.45" />
    </Svg>
  );
}

/** Bent low over the knees, arms hanging forward: the crouch stance. */
export function CrouchIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="14.6" cy="5.4" r="2.6" fill="currentColor" stroke="none" />
      {/* Back leaning forward from the hips, thigh level, shin down, and
          one arm hanging ahead of the knee: the classic side-on crouch. */}
      <path {...POSE} d="M13.4 8.6 8.4 13.4M8.4 13.4l6.6.8-.4 6M8.4 13.4l1 6.6M12.4 9.6l3.2 3.8" />
      <ellipse cx="12" cy="22.2" rx="5" ry="1" fill="currentColor" stroke="none" opacity="0.45" />
    </Svg>
  );
}

export function SignalIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 18h1v2H4z" fill="currentColor" stroke="none" />
      <path d="M9 15h1v5H9z" fill="currentColor" stroke="none" />
      <path d="M14 11h1v9h-1z" fill="currentColor" stroke="none" />
      <path d="M19 6h1v14h-1z" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function SignalOffIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 18h1v2H4z" fill="currentColor" stroke="none" opacity={0.5} />
      <path d="M9 15h1v5H9z" fill="currentColor" stroke="none" opacity={0.5} />
      <path d="M14 11h1v9h-1z" fill="currentColor" stroke="none" opacity={0.5} />
      <path d="M19 6h1v14h-1z" fill="currentColor" stroke="none" opacity={0.5} />
      <path d="M3 3l18 18" />
    </Svg>
  );
}

/* ---- Added for the admin/moderation panel (see src/admin/) ------------ */

export function ShieldIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3.2l7 2.6v5.4c0 4.6-3 7.9-7 9.6-4-1.7-7-5-7-9.6V5.8z" />
      <path d="M9 12l2.1 2.1L15.3 9.7" />
    </Svg>
  );
}

export function UsersIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.2 19c.9-3.1 3.3-4.8 5.8-4.8s4.9 1.7 5.8 4.8" />
      <circle cx="17" cy="8.5" r="2.4" />
      <path d="M15.2 14.4c2.1.2 4 1.7 4.7 4.6" />
    </Svg>
  );
}

export function LocationIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 21s-6.5-5.9-6.5-11A6.5 6.5 0 0 1 18.5 10c0 5.1-6.5 11-6.5 11z" />
      <circle cx="12" cy="10" r="2.3" />
    </Svg>
  );
}

export function KickIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M15 3.5H8.5A1.5 1.5 0 0 0 7 5v14a1.5 1.5 0 0 0 1.5 1.5H15" />
      <path d="M11 12h10M18 8.5l3.5 3.5-3.5 3.5" />
    </Svg>
  );
}

export function GatherIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="2" />
      <path d="M12 5v2.3M12 16.7V19M5 12h2.3M16.7 12H19" />
      <path d="M7.4 7.4l1.6 1.6M15 15l1.6 1.6M16.6 7.4L15 9M9 15l-1.6 1.6" />
    </Svg>
  );
}

export function LockIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
      <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
    </Svg>
  );
}

/**
 * A figure kneeling in seiza, side on: the app's own mark (public/
 * favicon.svg), the same head and body silhouette scaled into the icon
 * grid and filled. Distinct from ChairIcon, which is furniture: this is
 * the posture.
 */
export function SeizaIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <g transform="translate(-9.1 -5.7) scale(0.56)" fill="currentColor" stroke="none">
        <circle cx="34.6" cy="18.4" r="6.9" />
        <path d="M29.8 24.6C27.3 30.2 26.2 36.4 26.3 42.8C26.3 46.8 27.4 49 29.3 49.8L45.8 49.8C48.8 49.8 49.4 46.1 46.2 45C41.2 43.5 37.2 42.6 34.6 40.9C36.4 36.7 37 31.1 36.4 27C36 24.9 33.2 24 29.8 24.6Z" />
      </g>
      <ellipse cx="12" cy="22.4" rx="6.5" ry="1" fill="currentColor" stroke="none" opacity="0.45" />
    </Svg>
  );
}

/** A signboard on a post — distinct from TextBoardIcon, which is a
 *  wall-mounted notice board. */
export function SignIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4" y="4" width="16" height="9" rx="1.5" />
      <path d="M7.5 7.5h9M7.5 10h5" />
      <path d="M12 13v7" />
      <path d="M9 20h6" />
    </Svg>
  );
}

/** Opens the mobile control drawer (see HUD.tsx). */
export function MenuIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Svg>
  );
}

/** Closes the mobile control drawer — points toward the edge it tucks into. */
export function ChevronRightIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9 5l7 7-7 7" />
    </Svg>
  );
}
