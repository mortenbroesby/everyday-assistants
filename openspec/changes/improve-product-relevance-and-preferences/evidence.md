# Production evidence

- Revision `95c088657559368cc4b4369adab9a131f8ab19b7` passed exact-main CI run `34406730530`.
- Protected cutover run `34438702613` deployed Worker version `9c9fc3c0-26dd-4f91-875e-ab491f7ab500`, reused one Container image, passed edge and service fixture acceptance, and left the basket unchanged.
- Live edge readback observed the exact source revision.
- ChatGPT acceptance found that explicit brand text was not promoted to `preferred_brands` and loose catalogue matches still admitted incompatible products. Task 5.2 remains open until the tested hotfix is deployed and the same read-only conversation passes.
- Hotfix revision `5c7d69058dca04218db42f4d872cdfe6ef50dd09` passed exact-main CI run `34439887641`; protected cutover run `34440231451` deployed Worker version `0b887f40-a2d8-4377-820b-e159f351c51a` under operation `d523f187-05d0-4869-bb2f-60c90c8ac88d`.
- Independent edge acceptance observed the exact hotfix revision. The supplied ChatGPT conversation then returned only relevant minced-beef candidates, showed current 500 g and 1 kg package trade-offs, ranked four Heinz ketchup products ahead of cheaper brands when `Heinz` appeared only in the line text, kept an unspecified cola brand unresolved, excluded the false `Colais` prefix match, and made no basket mutation. No 800 g minced-beef package was available in the returned catalogue results.
