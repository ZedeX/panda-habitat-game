// Generate 4 cartoon-animal meeple PNGs (transparent bg) from SVG via sharp.
// Each animal gets a DISTINCT silhouette so they read clearly, not as teddy bears.
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const OUT = path.resolve("web/assets");
const S = 256;

function svg(inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 256 256">
    <g>${inner}</g></svg>`;
}

const animals = {
  // ===================== PANDA (chunky, unmistakable b/w) =====================
  panda: svg(`
    <ellipse cx="100" cy="214" rx="22" ry="26" fill="#F4F3EE"/>
    <ellipse cx="156" cy="214" rx="22" ry="26" fill="#F4F3EE"/>
    <ellipse cx="128" cy="168" rx="60" ry="64" fill="#F4F3EE"/>
    <ellipse cx="64" cy="158" rx="18" ry="42" fill="#F4F3EE" transform="rotate(18 64 158)"/>
    <ellipse cx="192" cy="158" rx="18" ry="42" fill="#F4F3EE" transform="rotate(-18 192 158)"/>
    <circle cx="128" cy="82" r="52" fill="#F4F3EE"/>
    <circle cx="92" cy="42" r="20" fill="#2B2B2B"/>
    <circle cx="164" cy="42" r="20" fill="#2B2B2B"/>
    <ellipse cx="110" cy="84" rx="17" ry="20" fill="#2B2B2B" transform="rotate(-12 110 84)"/>
    <ellipse cx="146" cy="84" rx="17" ry="20" fill="#2B2B2B" transform="rotate(12 146 84)"/>
    <circle cx="110" cy="84" r="6" fill="#fff"/>
    <circle cx="146" cy="84" r="6" fill="#fff"/>
    <circle cx="110" cy="85" r="3.2" fill="#23201C"/>
    <circle cx="146" cy="85" r="3.2" fill="#23201C"/>
    <ellipse cx="128" cy="104" rx="9" ry="6.5" fill="#2B2B2B"/>
    <path d="M128 110 q-10 12 -20 4 M128 110 q10 12 20 4" stroke="#2B2B2B" stroke-width="3" fill="none" stroke-linecap="round"/>
  `),

  // ===================== MUSK DEER (standing deer: antlers + neck + thin legs) =====================
  musk: svg(`
    <!-- thin legs -->
    <rect x="100" y="150" width="11" height="78" rx="5" fill="#9C7748"/>
    <rect x="118" y="150" width="11" height="78" rx="5" fill="#9C7748"/>
    <rect x="138" y="150" width="11" height="78" rx="5" fill="#9C7748"/>
    <rect x="156" y="150" width="11" height="78" rx="5" fill="#9C7748"/>
    <!-- hooves -->
    <rect x="100" y="218" width="11" height="12" rx="3" fill="#5E4126"/>
    <rect x="118" y="218" width="11" height="12" rx="3" fill="#5E4126"/>
    <rect x="138" y="218" width="11" height="12" rx="3" fill="#5E4126"/>
    <rect x="156" y="218" width="11" height="12" rx="3" fill="#5E4126"/>
    <!-- body -->
    <ellipse cx="128" cy="142" rx="50" ry="34" fill="#C49A63"/>
    <!-- neck -->
    <path d="M112 120 L120 70 L142 70 L150 120 Z" fill="#C49A63"/>
    <!-- head + snout -->
    <ellipse cx="131" cy="62" rx="26" ry="20" fill="#C49A63"/>
    <ellipse cx="152" cy="66" rx="16" ry="11" fill="#D8B585"/>
    <!-- ears -->
    <ellipse cx="112" cy="48" rx="8" ry="15" fill="#A87F4C" transform="rotate(-30 112 48)"/>
    <ellipse cx="124" cy="46" rx="8" ry="15" fill="#A87F4C" transform="rotate(-10 124 46)"/>
    <!-- antlers -->
    <path d="M120 44 q-6 -20 -16 -26 M104 18 q-7 -3 -9 -12 M110 24 q-3 -9 -10 -12
             M138 44 q6 -20 16 -26 M154 18 q7 -3 9 -12 M148 24 q3 -9 10 -12"
          stroke="#6B4A2B" stroke-width="5.5" fill="none" stroke-linecap="round"/>
    <!-- eye + nose -->
    <circle cx="126" cy="60" r="5.5" fill="#2B2018"/>
    <circle cx="162" cy="66" r="4.5" fill="#5A3A22"/>
    <!-- flank spots -->
    <circle cx="108" cy="140" r="4.5" fill="#A87F4C"/>
    <circle cx="150" cy="145" r="4.5" fill="#A87F4C"/>
  `),

  // ===================== SNOW LEOPARD (cat: pointed ears + long curling tail + rosettes) =====================
  snow: svg(`
    <!-- long curling tail (signature) -->
    <path d="M70 175 q-46 6 -42 -42 q4 -34 40 -28 q26 4 18 30 q-6 18 -22 12 q-12 -4 -6 -16"
          fill="none" stroke="#E2E6EA" stroke-width="20" stroke-linecap="round"/>
    <path d="M50 120 q-8 4 -6 14 M58 135 q-9 2 -10 12 M44 150 q-4 6 4 12"
          stroke="#7A8590" stroke-width="3" fill="none"/>
    <!-- body -->
    <ellipse cx="132" cy="170" rx="56" ry="58" fill="#E2E6EA"/>
    <!-- front paws -->
    <ellipse cx="108" cy="216" rx="16" ry="14" fill="#E2E6EA"/>
    <ellipse cx="156" cy="216" rx="16" ry="14" fill="#E2E6EA"/>
    <!-- head -->
    <circle cx="132" cy="86" r="46" fill="#E2E6EA"/>
    <!-- pointed ears -->
    <path d="M98 56 L92 24 L120 44 Z" fill="#CBD2D8"/>
    <path d="M166 56 L172 24 L144 44 Z" fill="#CBD2D8"/>
    <!-- eyes -->
    <circle cx="116" cy="86" r="6.5" fill="#23201C"/>
    <circle cx="148" cy="86" r="6.5" fill="#23201C"/>
    <!-- muzzle -->
    <ellipse cx="132" cy="106" rx="18" ry="13" fill="#F4F6F8"/>
    <path d="M126 104 l6 6 l6 -6" stroke="#5A6470" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <ellipse cx="132" cy="110" rx="5" ry="3.5" fill="#5A6470"/>
    <!-- rosette spots -->
    ${[[92,150],[150,150],[110,185],[156,188],[132,168],[100,200],[160,202]]
      .map(([x,y])=>`<circle cx="${x}" cy="${y}" r="7" fill="none" stroke="#7A8590" stroke-width="3.2"/>
        <circle cx="${x}" cy="${y}" r="2" fill="#7A8590"/>`).join("")}
  `),

  // ===================== OTTER (streamlined body + long tail + whiskers) =====================
  otter: svg(`
    <!-- long tail -->
    <path d="M76 180 q-44 18 -40 70 q3 26 28 22 q20 -3 10 -22 q-8 -14 -22 -8 q-10 4 -4 -10"
          fill="none" stroke="#8A5A33" stroke-width="18" stroke-linecap="round"/>
    <!-- body (leaning, streamlined) -->
    <ellipse cx="134" cy="166" rx="54" ry="62" fill="#8A5A33"/>
    <!-- belly -->
    <ellipse cx="134" cy="178" rx="32" ry="42" fill="#C99A6A"/>
    <!-- head -->
    <circle cx="134" cy="80" r="46" fill="#8A5A33"/>
    <!-- small round ears -->
    <circle cx="100" cy="50" r="12" fill="#6F4527"/>
    <circle cx="168" cy="50" r="12" fill="#6F4527"/>
    <!-- eyes -->
    <circle cx="118" cy="80" r="6.5" fill="#23201C"/>
    <circle cx="150" cy="80" r="6.5" fill="#23201C"/>
    <!-- muzzle -->
    <ellipse cx="134" cy="104" rx="22" ry="16" fill="#D8B088"/>
    <ellipse cx="134" cy="100" rx="6" ry="4.5" fill="#3A2414"/>
    <path d="M134 104 v7" stroke="#3A2414" stroke-width="2.5" stroke-linecap="round"/>
    <!-- whiskers -->
    <path d="M112 102 h-24 M114 108 h-22 M156 102 h24 M154 108 h22"
          stroke="#EAD9C2" stroke-width="1.8" stroke-linecap="round"/>
    <!-- front paws -->
    <ellipse cx="112" cy="214" rx="15" ry="13" fill="#6F4527"/>
    <ellipse cx="156" cy="214" rx="15" ry="13" fill="#6F4527"/>
  `),
};

(async () => {
  for (const [name, s] of Object.entries(animals)) {
    const buf = await sharp(Buffer.from(s)).png().toBuffer();
    const file = path.join(OUT, `meeple_${name}.png`);
    fs.writeFileSync(file, buf);
    console.log("wrote", file, buf.length, "bytes");
  }
})();
