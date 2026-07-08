// The splash scene: a forklift drives in and flattens Clippy into a pancake, Clippy's eyes
// go X_X, a little dust puffs, then it reverses out and loops. Pure inline SVG + CSS
// keyframes (see ui.css, ".splash-*"), no assets. Honors prefers-reduced-motion.

export function SplashAnimation() {
  return (
    <svg className="splash-anim" viewBox="0 0 380 150" role="img" aria-label="A forklift flattening Clippy">
      {/* ground */}
      <line className="splash-ground" x1="8" y1="124" x2="372" y2="124" />

      {/* Clippy — sits on the ground at x=250 */}
      <g transform="translate(250,124)">
        <ellipse className="splash-shadow" cx="0" cy="2" rx="26" ry="5" />

        {/* dust puff at the impact (left) side */}
        <g className="splash-dust">
          <circle cx="-20" cy="-6" r="4" />
          <circle cx="-26" cy="-12" r="3" />
          <circle cx="-16" cy="-16" r="3.5" />
          <circle cx="-30" cy="-4" r="2.5" />
        </g>

        {/* sweat drop of doom, just before impact */}
        <g className="splash-sweat">
          <path d="M 18,-56 q 5,6 0,10 q -5,-4 0,-10 z" />
        </g>

        {/* the squishable clippy */}
        <g className="splash-clippy">
          <g transform="translate(-21,0)">
            {/* paperclip body */}
            <path className="splash-clip" d="M 8,0 V -42 A 13 13 0 0 1 34 -42 V -10 A 8 8 0 0 1 18 -10 V -32" />

            {/* alive eyes + brows */}
            <g className="splash-eyes-alive">
              <line className="splash-brow" x1="9" y1="-57" x2="19" y2="-54" />
              <line className="splash-brow" x1="23" y1="-54" x2="33" y2="-57" />
              <ellipse className="splash-eye" cx="15" cy="-46" rx="6" ry="7" />
              <ellipse className="splash-eye" cx="27" cy="-46" rx="6" ry="7" />
              <circle className="splash-pupil" cx="16" cy="-45" r="2.6" />
              <circle className="splash-pupil" cx="28" cy="-45" r="2.6" />
            </g>

            {/* dead X_X eyes */}
            <g className="splash-eyes-dead">
              <line x1="11" y1="-50" x2="19" y2="-42" />
              <line x1="19" y1="-50" x2="11" y2="-42" />
              <line x1="23" y1="-50" x2="31" y2="-42" />
              <line x1="31" y1="-50" x2="23" y2="-42" />
            </g>
          </g>
        </g>
      </g>

      {/* Forklift — drives in from the left */}
      <g className="splash-forklift">
        <ellipse className="splash-shadow" cx="46" cy="126" rx="54" ry="5" />

        {/* wheels */}
        <circle className="splash-wheel" cx="24" cy="112" r="12" />
        <circle className="splash-wheel" cx="66" cy="112" r="12" />
        <circle className="splash-hub" cx="24" cy="112" r="4" />
        <circle className="splash-hub" cx="66" cy="112" r="4" />

        {/* body + cab */}
        <rect className="splash-body" x="8" y="80" width="68" height="26" rx="5" />
        <rect className="splash-body" x="34" y="56" width="32" height="26" rx="3" />
        {/* overhead guard */}
        <rect className="splash-frame" x="32" y="30" width="34" height="5" rx="2" />
        <line className="splash-post" x1="36" y1="35" x2="36" y2="56" />
        <line className="splash-post" x1="62" y1="35" x2="62" y2="56" />
        <rect className="splash-seat" x="44" y="66" width="14" height="9" rx="2" />
        <circle className="splash-light" cx="76" cy="92" r="3" />

        {/* mast + forks */}
        <rect className="splash-mast" x="74" y="34" width="5" height="84" />
        <rect className="splash-mast" x="82" y="34" width="5" height="84" />
        <rect className="splash-carriage" x="79" y="96" width="9" height="22" />
        <rect className="splash-fork" x="86" y="98" width="6" height="20" rx="1" />
        <rect className="splash-fork" x="86" y="112" width="44" height="6" rx="2" />
      </g>
    </svg>
  );
}
