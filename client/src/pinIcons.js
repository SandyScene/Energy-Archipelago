// Classic teardrop map marker: colored body, white ring, white dot in the middle.
function pinSVG(color) {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="34" height="44" viewBox="0 0 34 44">
      <path d="M17 0C7.6 0 0 7.6 0 17c0 11.5 17 27 17 27s17-15.5 17-27C34 7.6 26.4 0 17 0z"
            fill="${color}" stroke="#ffffff" stroke-width="2"/>
      <circle cx="17" cy="17" r="6.5" fill="#ffffff"/>
    </svg>
  `.trim();
}

function svgToImage(svgMarkup) {
  const svgUrl = `data:image/svg+xml;base64,${btoa(svgMarkup)}`;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = svgUrl;
  });
}

// Registers one marker image per technology (plus a fallback) on the given
// Mapbox map instance. Call once after 'style.load'.
export async function loadPinIcons(map, technologyColors) {
  const entries = Object.entries(technologyColors);
  await Promise.all(
    entries.map(async ([label, color]) => {
      const image = await svgToImage(pinSVG(color));
      const iconName = `pin-${label}`;
      if (!map.hasImage(iconName)) map.addImage(iconName, image, { pixelRatio: 2 });
    }),
  );
}

export function pinIconName(label) {
  return `pin-${label}`;
}
