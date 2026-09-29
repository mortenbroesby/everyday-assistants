## ADDED Requirements

### Requirement: Read-only visual view of the actual Nemlig basket
The server SHALL expose a distinct, read-only visual basket action that reads the current provider basket and presents every basket line with its current quantity and line total. It SHALL advertise the existing shared product viewer and retain a complete structured and text fallback. It SHALL only use exact product references from the current basket for image/detail lookup, bound additional provider reads, and never prepare or apply a basket mutation. Ordinary basket inspection SHALL not incur these extra detail reads.

#### Scenario: Basket has products with images
- **WHEN** the user requests a visual view of an actual Nemlig basket containing products with safe images
- **THEN** the action returns all basket lines, a bounded number of exact product details and safe image URLs, and viewer metadata for rendering without changing the basket

#### Scenario: Detail or image unavailable
- **WHEN** an exact detail lookup fails, has a mismatched ID, or has no supported HTTPS Nemlig image
- **THEN** the basket line remains visible with its known quantity and total, and the missing detail or image is labelled without substituting an unrelated product

#### Scenario: Large or empty basket
- **WHEN** the basket exceeds the detail-read bound or contains no products
- **THEN** all current lines remain available, the visual result identifies any lines not enriched, and no unbounded detail calls occur

#### Scenario: Normal basket read
- **WHEN** the user requests ordinary basket inspection
- **THEN** the server reads the basket without exact-product hydration or a viewer opening
