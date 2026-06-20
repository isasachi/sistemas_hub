{
  "label_architecture": {
    "derived_from": "wraparound retail product label",
    "intent": "Base blueprint for a flat, print-ready product label. Fill every placeholder with the REAL product data provided below. Include or omit each zone INDEPENDENTLY based on the product — see 'adaptation'.",
    "format": {
      "type": "flat unrolled wraparound label, shown straight-on",
      "aspect": "wide rectangle ~2.5:1 (adapt to the packaging format)",
      "bleed": "edge-to-edge background, no white frame or margin"
    },
    "background": {
      "fill": "solid primary brand color",
      "texture": "subtle low-contrast halftone / dot pattern",
      "decoration": "motifs themed to THIS product, in the brand palette — ingredient illustrations for a food/drink, product or usage motifs / abstract shapes otherwise. NEVER use food imagery for a non-food product."
    },
    "zones": [
      {
        "id": "primary_display",
        "include_when": "ALWAYS",
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
        "id": "info_panel",
        "include_when": "consumable products only (food, drink, supplement, cosmetic) — omit for non-consumables and services",
        "position": "left band, ~30% width",
        "content_by_type": {
          "food_or_drink": "nutrition facts inside a clean white box (serving size, calories, % daily value, fats, sodium, carbohydrates, sugars, protein, footnote) + ingredients, allergens, storage",
          "supplement_or_cosmetic": "ingredients / composition, directions for use, and warnings / precautions — NO FDA nutrition-facts table"
        },
        "typography": "tiny regulatory sans"
      },
      {
        "id": "back_panel",
        "include_when": "any PACKAGED RETAIL product (food OR non-food) — omit for non-packaged / loose / a service",
        "position": "right band, ~30% width",
        "content": [
          "short product description paragraph (body copy)",
          "barcode",
          "company name / legal small print",
          "recycling and regulatory marks"
        ],
        "typography": "small clean sans, left-aligned"
      }
    ],
    "color": {
      "source": "use the provided brand palette EXACTLY",
      "contrast_rule": "place text on solid fills or cartouches to guarantee legibility over patterned/illustrated areas"
    },
    "adaptation": {
      "axis_food": "Food or drink → use the food_or_drink version of info_panel (nutrition table). Consumable but NOT food (supplement, cosmetic) → use the supplement_or_cosmetic version (ingredients/directions/warnings, NO nutrition table). Non-consumable → omit info_panel entirely.",
      "axis_packaged_retail": "Packaged retail product (food OR non-food) → include back_panel (barcode, legal, recycling). Non-packaged, loose, or a service → omit back_panel.",
      "minimal_case": "Service or a product with no regulatory/usage copy at all → keep ONLY primary_display.",
      "note": "The two axes are INDEPENDENT: a packaged non-food product (e.g. cosmetic, cleaning product) keeps back_panel even without a nutrition table; an unpackaged food keeps the nutrition info but drops the barcode/legal back_panel."
    },
    "rules": [
      "Render ONLY the real provided product copy and the brand name. NEVER print field names, font names, hex color codes, the words 'typography'/'palette'/'composition', lorem ipsum, 'Sample/Dummy/Plain Text', or any placeholder or instruction text.",
      "Any dummy text or dummy barcode in a reference is STRUCTURE only — never reproduce it.",
      "Correct spelling, retail-quality, premium finish."
    ]
  }
}
