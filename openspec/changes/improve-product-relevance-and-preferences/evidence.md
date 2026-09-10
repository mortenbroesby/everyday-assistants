# Production evidence

- Revision `95c088657559368cc4b4369adab9a131f8ab19b7` passed exact-main CI run `34406730530`.
- Protected cutover run `34438702613` deployed Worker version `9c9fc3c0-26dd-4f91-875e-ab491f7ab500`, reused one Container image, passed edge and service fixture acceptance, and left the basket unchanged.
- Live edge readback observed the exact source revision.
- ChatGPT acceptance found that explicit brand text was not promoted to `preferred_brands` and loose catalogue matches still admitted incompatible products. Task 5.2 remains open until the tested hotfix is deployed and the same read-only conversation passes.
