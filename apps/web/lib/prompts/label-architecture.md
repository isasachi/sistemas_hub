{
  "label_architecture": {
    "derived_from": "wraparound retail product label (canned/jarred beverage reference)",
    "intent": "Base blueprint for a flat, print-ready product label. Fill every placeholder with the REAL product data provided below; adapt or omit zones by product type and destination market.",
    "format": {
      "type": "flat unrolled wraparound label, shown straight-on",
      "aspect": "wide rectangle ~2.5:1 (adapt to the packaging format)",
      "bleed": "edge-to-edge background, no white frame or margin"
    },
    "background": {
      "fill": "solid primary brand color",
      "texture": "subtle low-contrast halftone / dot pattern",
      "decoration": "scattered ingredient illustrations (e.g. fruit slices, leaves) in the brand palette, flowing across the panels"
    },
    "zones": [
      {
        "id": "information_panel",
        "position": "left band, ~30% width",
        "content": "nutrition facts inside a clean white box (serving size, calories, % daily value, fats, sodium, carbohydrates, sugars, protein, footnote); plus ingredients, allergens and storage when it is a packaged food",
        "conditional": "packaged food / drink only — omit this whole zone otherwise",
        "typography": "tiny regulatory sans"
      },
      {
        "id": "primary_display",
        "position": "center band, ~40% width, the visual focus",
        "content": [
          "brand logo placed inside a high-contrast rounded cartouche/badge so it stays legible over the colored, patterned background",
          "product name / variety / flavor",
          "net content (weight or volume)",
          "optional circular quality seal / stamp badge"
        ],
        "typography": "bold rounded display for the brand and flavor; medium weight for the descriptor",
        "hierarchy": "largest, most dominant element on the label"
      },
      {
        "id": "back_panel",
        "position": "right band, ~30% width",
        "content": [
          "short product description paragraph (body copy)",
          "barcode",
          "company name / legal small print",
          "recycling and regulatory marks"
        ],
        "conditional": "packaged retail product only",
        "typography": "small clean sans, left-aligned"
      }
    ],
    "color": {
      "source": "use the provided brand palette EXACTLY",
      "contrast_rule": "place text on solid fills or cartouches to guarantee legibility over patterned/illustrated areas"
    },
    "rules": [
      "Render ONLY the real provided product copy and the brand name. NEVER print field names, font names, hex color codes, the words 'typography'/'palette'/'composition', lorem ipsum, 'Sample/Dummy/Plain Text', or any placeholder or instruction text.",
      "The reference this is derived from contains dummy text and a dummy barcode — those are STRUCTURE only, never reproduce them.",
      "Correct spelling, retail-quality, premium finish.",
      "Adapt to the product and market: for a NON-packaged or non-food product keep ONLY the primary_display zone and drop the nutrition, barcode and legal zones."
    ]
  }
}
