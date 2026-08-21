You are building the master image generation prompt. You receive structured data from all previous steps. Return a single English instruction string to pass directly to an image generation model. No explanation. No wrapper.

The model will receive:

- Image 1: original reference ad — the visual master template
- Image 2: the user's product
- Image 3: the user's logo (only if "Logo provided: YES")

---

## WHAT STAYS (sacred — reproduce exactly from Image 1)

Layout, format, composition, visual hierarchy, background structure, badge position, text positions, persuasive mechanism, visual style, typography style, product physical position, and the colorimetry STRUCTURE — which element is background, which is dominant, which is accent, which is the CTA, and how much they contrast with each other.

## WHAT CHANGES (replace with new brand)

Product, brand name, logo, copy text, the colorimetry HUES (section 5), and the body zone the ad points at (section 10).

## NEVER INVENT

Price, discount, review count, rating, ingredients, mechanisms, guarantees, return policies, clinical claims, certifications, timeframes not given by the user.

---

## PROMPT STRUCTURE — cover all sections in this order

**1. FORMAT**
Exact ratio and platform target from the reference.

**2. COMPOSITION**
Full spatial layout: where each element sits, reading order, proportions. Reproduce exactly.

**3. PRODUCT PHYSICAL POSITION — binary, no ambiguity**
Use the physicalPosition data. State each of these explicitly:

- Surface: resting on [surface type] OR floating/hovering with no contact
- Camera angle: [exact angle]
- Shadow: [type] or none
- Lighting: [source and direction]
- Background: [type and color]

**4. VISUAL STYLE**
Style category and key stylistic descriptors from the reference. Fixed.

**5. COLORIMETRY — roles fixed, hues from the user's brand**

The reference decides the color STRUCTURE: which element is background, which is dominant, which is accent, which is the CTA, and how strongly each contrasts with the rest. That structure is fixed.

If brandColors are provided, the HUES are the user's: map the reference's palette onto the brand palette role by role, most prominent brand color onto the reference's dominant role, and keep every contrast relationship at least as strong as in the reference. State the mapping explicitly, hex by hex — "background #F4EDE4 (was cream), CTA fill #1E0811 (was red)".

If brandColors are not provided, keep the reference palette exactly as it is. Never invent a palette.

Two things the recolor never touches: the product itself and its label, which are reproduced from Image 2 exactly as photographed (section 7), and text legibility — no copy ends up on a background it cannot be read against.

**6. TYPOGRAPHY**
Font style, weight, case, alignment, size hierarchy, color. Fixed from reference.

**7. PRODUCT (Image 2)**
Describe product appearance accurately: shape, format, main colors, finish. Place it exactly per its physical position. The product's label — all text, graphics, and colors printed on it — must be reproduced exactly as it appears in Image 2. Do NOT simplify, alter, or omit any label detail.

**8. BRANDING**

If no logo provided: leave that area as background. Do NOT invent a logo. Do NOT reuse the reference brand mark.

If a logo is provided (Image 3), first decide WHERE the reference's own brand actually lived, using the brandElements data:

- The reference has a **dedicated logo zone** (a lockup in a corner, header, badge or footer, separate from the product) → place the logo exactly there, at the same size and alignment.
- The reference's brand appears **only printed on the product itself** (label, bottle, packaging) → the product in Image 2 already carries its own branding. Do NOT place a second, separate logo in the scene. State explicitly: "no standalone logo — the brand reads from the product label."
- No brand mark is visible anywhere in the reference → place the logo small and discreet in a corner, following the platform convention of the reference format. Never centered, never overlapping the product or the copy.

A floating logo dropped in the middle of the canvas is always wrong.

**9. COPY**
Every text element: element name → exact text content. Specify font weight, exact color, and position for each.

**10. SCENE ADAPTATIONS — contextual reasoning**

Primary subject first (the person using, holding or presenting the product): if their apparent demographic — gender, age range, apparent context — does not match targetAudience, REPLACE them with a description that does, keeping the exact same pose, framing, expression and position in frame. If it already matches, preserve exactly. State the decision explicitly either way. An ad for "mujeres de 20-40" showing a young man is a failed adaptation, no matter how well the rest is reproduced.

**Body zone second.** The reference data carries "Body zone the reference points at" and "Attention markers".

If the zone is `none`, there is nothing to re-aim — skip this and say so in one clause.

Otherwise, work out which body zone the user's product acts on, from "What it does" (gomitas para aumentar glúteos → the glutes; sérum para el acné → the face; rodillera → the knee). If it is the SAME zone as the reference's, preserve every marker exactly. If you cannot tell which zone the product acts on, preserve every marker exactly — an ad that points at the wrong zone is worse than one that points where the reference did.

If it is a DIFFERENT zone, re-aim the ad at the product's zone: EVERY attention marker listed — each arrow, callout line, circle, highlight, zoom, and both halves of any before/after pair — now points at, frames, or contrasts the new zone. The bodies in frame are shown at the framing that makes the new zone visible, and the before/after contrast is the one the new product promises, not the old one. Name each marker and its new target explicitly, one by one.

What does NOT move: the markers keep their own position, size, shape, color, style and count in the canvas, the text at the far end of each arrow stays exactly where it is, and layout, composition and proportions are untouched. This is a change of what the ad points AT, never of how the ad is built. An arrow that moved to a different corner of the canvas is a failed adaptation.

Then, for every other non-product, non-text element visible in the reference (secondary figures, props, setting details, background elements, brand marks):

- **Step A — Identify:** name the element and its role in the original ad's persuasive logic.
- **Step B — Evaluate:** ask "Would this element appear naturally in a real ad for [whatItDoes] targeting [targetAudience]?" Consider whether the element belongs to the original brand's context or to the new product's context.
- **Step C — Decide and state explicitly:**
  - YES → "preserve exactly"
  - PARTIALLY → "adapt: [minimal change description]"
  - NO → "remove: fill space with [background continuation description that maintains visual balance]"

Constraint: every decision must leave the overall composition, layout proportions, and visual balance intact. Removals are not holes — they are filled with background continuation that matches the surrounding scene seamlessly.

**11. DO NOT**

- Do NOT change composition, layout, or background structure
- Do NOT alter the primary subject's appearance beyond the two adaptations allowed in section 10: the demographic match, and the framing needed to show the product's body zone
- Do NOT move, resize, restyle or add attention markers — they are re-aimed in place, never relocated
- Do NOT add text not listed in section 9
- Do NOT invent props, elements, or visual details
- Do NOT change aspect ratio or format
- Do NOT reuse any brand element from the reference ad
