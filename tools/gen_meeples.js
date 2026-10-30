// Generate 4 wooden-style cartoon-animal meeple PNGs (transparent bg) from SVG via sharp.
// Poses match the user's reference photo: panda & snow-leopard side-walking,
// otter upright-sitting, deer thin-legged standing. A thin wood-tone rim evokes
// the laser-cut plywood edge of real board-game meeples.
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const OUT = path.resolve("web/assets");
const S = 256;

// Visible dark-wood outline via two dilations of the alpha channel: the ring
// between outer(6) and inner(3) is flooded with a warm dark brown, giving a clean
// ~3px cut-edge outline that separates the meeple from any tile background.
const RIM = `<filter id="rim" x="-30%" y="-30%" width="160%" height="160%">
  <feMorphology in="SourceAlpha" operator="dilate" radius="6" result="outer"/>
  <feMorphology in="SourceAlpha" operator="dilate" radius="3" result="inner"/>
  <feFlood flood-color="#43331E" result="dk"/>
  <feComposite in="dk" in2="outer" operator="in" result="o1"/>
  <feComposite in="o1" in2="inner" operator="out" result="ring"/>
  <feMerge><feMergeNode in="ring"/><feMergeNode in="SourceGraphic"/></feMerge>
</filter>`;

function svg(inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 256 256">
    <defs>${RIM}</defs>
    <g filter="url(#rim)">${inner}</g></svg>`;
}

const animals = {
  // ===================== PANDA — side-walking, b/w =====================
  panda: svg(`
    <!-- tail -->
    <ellipse cx="200" cy="152" rx="15" ry="11" fill="#2B2B2B"/>
    <!-- far back legs -->
    <rect x="150" y="176" width="19" height="54" rx="9" fill="#1F1F1F"/>
    <rect x="170" y="180" width="17" height="50" rx="8" fill="#1F1F1F"/>
    <!-- body -->
    <ellipse cx="128" cy="150" rx="68" ry="47" fill="#F4F3EE"/>
    <!-- black shoulder saddle -->
    <ellipse cx="142" cy="120" rx="54" ry="24" fill="#2B2B2B" transform="rotate(-8 142 120)"/>
    <!-- near front legs -->
    <rect x="84" y="178" width="20" height="54" rx="10" fill="#2B2B2B"/>
    <rect x="104" y="182" width="17" height="50" rx="8" fill="#2B2B2B"/>
    <!-- head -->
    <circle cx="60" cy="118" r="45" fill="#F4F3EE"/>
    <!-- ears -->
    <circle cx="40" cy="80" r="17" fill="#2B2B2B"/>
    <circle cx="80" cy="74" r="17" fill="#2B2B2B"/>
    <!-- eye patch -->
    <ellipse cx="54" cy="120" rx="16" ry="20" fill="#2B2B2B" transform="rotate(-10 54 120)"/>
    <circle cx="54" cy="118" r="7" fill="#fff"/>
    <circle cx="54" cy="119" r="3.6" fill="#23201C"/>
    <!-- snout + nose -->
    <ellipse cx="26" cy="128" rx="12" ry="9" fill="#F4F3EE"/>
    <ellipse cx="18" cy="126" rx="6" ry="5" fill="#2B2B2B"/>
    <path d="M18 131 q0 8 8 8" stroke="#2B2B2B" stroke-width="3" fill="none" stroke-linecap="round"/>
  `),

  // ===================== MUSK DEER — standing, thin legs, antlers =====================
  musk: svg(`
    <!-- thin legs -->
    <rect x="98" y="150" width="10" height="76" rx="5" fill="#9C7748"/>
    <rect x="118" y="150" width="10" height="76" rx="5" fill="#9C7748"/>
    <rect x="140" y="150" width="10" height="76" rx="5" fill="#9C7748"/>
    <rect x="160" y="150" width="10" height="76" rx="5" fill="#9C7748"/>
    <rect x="98" y="216" width="10" height="12" rx="3" fill="#5E4126"/>
    <rect x="118" y="216" width="10" height="12" rx="3" fill="#5E4126"/>
    <rect x="140" y="216" width="10" height="12" rx="3" fill="#5E4126"/>
    <rect x="160" y="216" width="10" height="12" rx="3" fill="#5E4126"/>
    <!-- tail -->
    <ellipse cx="190" cy="142" rx="9" ry="14" fill="#A87F4C"/>
    <!-- body -->
    <ellipse cx="129" cy="138" rx="54" ry="33" fill="#C49A63"/>
    <!-- neck -->
    <path d="M150 124 L162 74 L184 76 L176 126 Z" fill="#C49A63"/>
    <!-- head + snout -->
    <ellipse cx="180" cy="66" rx="24" ry="18" fill="#C49A63"/>
    <ellipse cx="201" cy="70" rx="15" ry="11" fill="#D8B585"/>
    <!-- ears -->
    <ellipse cx="162" cy="52" rx="7" ry="13" fill="#A87F4C" transform="rotate(-25 162 52)"/>
    <ellipse cx="178" cy="48" rx="7" ry="13" fill="#A87F4C" transform="rotate(8 178 48)"/>
    <!-- antlers -->
    <path d="M172 46 q-5 -18 -14 -24 M158 22 q-7 -2 -8 -11 M164 28 q-3 -8 -10 -10
             M188 46 q5 -18 14 -24 M202 22 q7 -2 8 -11 M196 28 q3 -8 10 -10"
          stroke="#6B4A2B" stroke-width="5" fill="none" stroke-linecap="round"/>
    <!-- eye + nose -->
    <circle cx="174" cy="64" r="5" fill="#2B2018"/>
    <circle cx="212" cy="70" r="4.5" fill="#5A3A22"/>
    <!-- flank spot -->
    <circle cx="110" cy="136" r="4.5" fill="#A87F4C"/>
  `),

  // ===================== SNOW LEOPARD — side-walking, long curled tail up, spots =====================
  snow: svg(`
    <!-- long curling tail (signature), raised at back -->
    <path d="M188 168 q52 -8 46 -56 q-4 -34 -40 -26 q-26 6 -16 32 q8 18 26 10 q12 -6 4 -18"
          fill="none" stroke="#CDC6DA" stroke-width="22" stroke-linecap="round"/>
    <path d="M214 96 q6 6 2 16 M206 120 q9 1 11 11 M196 140 q9 -1 12 9"
          stroke="#7A7088" stroke-width="3" fill="none"/>
    <!-- far legs -->
    <rect x="150" y="178" width="18" height="52" rx="8" fill="#B7AFC8"/>
    <rect x="168" y="182" width="16" height="48" rx="8" fill="#B7AFC8"/>
    <!-- body -->
    <ellipse cx="126" cy="150" rx="64" ry="46" fill="#CDC6DA"/>
    <!-- near legs -->
    <rect x="78" y="180" width="19" height="52" rx="9" fill="#B7AFC8"/>
    <rect x="98" y="184" width="16" height="48" rx="8" fill="#B7AFC8"/>
    <!-- head -->
    <circle cx="54" cy="120" r="44" fill="#CDC6DA"/>
    <!-- pointed ears -->
    <path d="M30 92 L24 58 L54 80 Z" fill="#B3ABBF"/>
    <path d="M78 92 L84 58 L54 80 Z" fill="#B3ABBF"/>
    <!-- eye -->
    <ellipse cx="50" cy="120" rx="8" ry="9" fill="#3A3448"/>
    <circle cx="50" cy="119" r="3.2" fill="#0E0B14"/>
    <!-- muzzle -->
    <ellipse cx="22" cy="130" rx="14" ry="10" fill="#EAE6F0"/>
    <ellipse cx="14" cy="128" rx="5" ry="4" fill="#6E6478"/>
    <!-- rosette spots -->
    ${[[100,140],[150,142],[118,176],[158,178],[134,158],[104,190],[160,192]]
      .map(([x,y])=>`<circle cx="${x}" cy="${y}" r="7" fill="none" stroke="#7A7088" stroke-width="3"/>
        <circle cx="${x}" cy="${y}" r="2" fill="#7A7088"/>`).join("")}
  `),

  // ===================== OTTER — upright sitting, raised body, round ears, light belly =====================
  otter: svg(`
    <!-- tail along ground -->
    <path d="M150 200 q60 6 78 -18 q12 -16 -6 -24 q-16 -6 -20 10 q-4 14 -22 18 q-18 4 -30 2"
          fill="none" stroke="#7E93A6" stroke-width="20" stroke-linecap="round"/>
    <!-- sitting body (pear, wider at bottom) -->
    <path d="M128 70 Q176 96 176 156 Q176 222 128 222 Q80 222 80 156 Q80 96 128 70 Z" fill="#7E93A6"/>
    <!-- light belly -->
    <path d="M128 110 Q156 130 154 170 Q150 210 128 210 Q106 210 102 170 Q100 130 128 110 Z" fill="#C9D6DE"/>
    <!-- head -->
    <circle cx="128" cy="78" r="46" fill="#7E93A6"/>
    <!-- small round ears -->
    <circle cx="92" cy="48" r="13" fill="#6B7F92"/>
    <circle cx="164" cy="48" r="13" fill="#6B7F92"/>
    <!-- eyes -->
    <circle cx="112" cy="78" r="6.5" fill="#23201C"/>
    <circle cx="144" cy="78" r="6.5" fill="#23201C"/>
    <!-- muzzle -->
    <ellipse cx="128" cy="100" rx="22" ry="15" fill="#D8E2E8"/>
    <ellipse cx="128" cy="96" rx="6" ry="4.5" fill="#3A2414"/>
    <path d="M128 100 v8" stroke="#3A2414" stroke-width="2.5" stroke-linecap="round"/>
    <!-- whiskers -->
    <path d="M106 98 h-26 M108 104 h-24 M150 98 h26 M148 104 h24"
          stroke="#EAD9C2" stroke-width="1.8" stroke-linecap="round"/>
    <!-- front paws at chest -->
    <ellipse cx="108" cy="158" rx="14" ry="12" fill="#6B7F92"/>
    <ellipse cx="148" cy="158" rx="14" ry="12" fill="#6B7F92"/>
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
