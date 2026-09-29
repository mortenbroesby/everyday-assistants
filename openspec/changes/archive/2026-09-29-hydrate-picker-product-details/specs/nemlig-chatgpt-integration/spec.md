## ADDED Requirements

### Requirement: Current product-view evidence in visual comparison

When the user requests visual product comparison, the integration SHALL resolve
each proposed product and alternative against Nemlig's current exact-product
view and SHALL expose its bounded description, declaration, and visible item
attributes as separate evidence categories when Nemlig supplies them. The
integration SHALL accept up to nine ordered alternatives per ingredient and
SHALL keep the alternative list and each evidence category folded by default.

#### Scenario: Exact product supplies all evidence categories

- **WHEN** a reviewed product's current Nemlig product view supplies a
  description, declaration, and visible item attributes
- **THEN** the picker presents all three categories under independently folded
  controls associated with that exact product

#### Scenario: Exact product omits an evidence category

- **WHEN** Nemlig's current exact-product view omits a description,
  declaration, or visible item attributes
- **THEN** the picker omits only that category instead of rendering a
  misleading empty section or inventing content

#### Scenario: Normal search page contains many alternatives

- **WHEN** one ingredient review supplies nine distinct suitable alternatives
  in catalogue order
- **THEN** the picker retains and displays all nine inside the folded
  alternative section for that ingredient without changing the selected item

#### Scenario: Product detail cannot be resolved

- **WHEN** the proposed exact product disappears from the current catalogue
- **THEN** that ingredient remains unresolved, while a disappeared alternative
  is omitted and unrelated ingredients remain reviewable

