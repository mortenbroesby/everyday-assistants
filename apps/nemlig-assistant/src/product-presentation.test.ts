import assert from 'node:assert/strict';
import test from 'node:test';
import type { Product } from './client.js';
import {
  createProductView,
  createProductViewFromSummary,
  createProductViews,
  rankProducts,
} from './product-presentation.js';

const product = (overrides: Partial<Product> = {}): Product => ({
  id: 7,
  name: 'Mælk',
  price: 12,
  unit: '12 kr/l',
  unitPrice: 12,
  unitSize: '1 l',
  brand: 'Test',
  category: 'Køl',
  subcategory: 'Mælk',
  imageUrl: 'https://nemlig.com/images/milk.jpg',
  available: true,
  labels: [],
  isOrganic: false,
  isFrozen: false,
  isRefrigerated: true,
  isDairy: true,
  isLactoseFree: false,
  isGlutenFree: false,
  isVegan: false,
  isOnDiscount: false,
  ...overrides,
});

test('shared product view carries context without creating a second product or basket model', () => {
  const view = createProductView(product(), {
    kind: 'review',
    quantity: 2,
    line_total: 24,
    approved: false,
  });

  assert.equal(view.status, 'complete');
  assert.equal(view.context, 'review');
  if (view.status !== 'complete') {
    return;
  }
  assert.equal(view.product.id, 7);
  assert.deepEqual(view.review, {
    kind: 'review',
    quantity: 2,
    line_total: 24,
    approved: false,
  });
  assert.equal('basket' in view, false);
});

test('hydrated and direct products produce the same review view', () => {
  const item = product();
  const context = {
    kind: 'review' as const,
    quantity: 2,
    line_total: 24,
    approved: false,
  };
  assert.deepEqual(
    createProductView(
      { status: 'hydrated', productId: 7, product: item },
      context,
    ),
    createProductView(item, context),
  );
});

test('product projection keeps provider facts but never invents comparative rankings', () => {
  const views = createProductViews(
    [
      product({
        id: 7,
        name: 'Mælk',
        price: undefined,
        unit: 'per liter',
        labels: ['Øko', 'Dansk'],
      }),
      product({ id: 8, name: 'Fløde', price: undefined, labels: ['Tilbud'] }),
    ],
    { kind: 'search' },
  );

  assert.equal(views[0]?.status, 'complete');
  if (views[0]?.status !== 'complete') {
    return;
  }
  assert.deepEqual(views[0].product.labels, ['Øko', 'Dansk']);
  assert.equal(views[0].product.unit, 'per liter');
  assert.equal(views[0].product.currency, 'DKK');
  assert.deepEqual(views[0].product.tags, ['organic']);
  assert.ok(
    views.every(
      (view) =>
        view.status !== 'complete' ||
        !view.product.tags.some((tag) =>
          ['cheapest', 'recommended'].includes(tag),
        ),
    ),
  );
});

test('summary product views retain authoritative basket and review facts without a product fetch', () => {
  const basket = createProductViewFromSummary(
    { id: 7, name: 'Banan', quantity: 3, line_total: 7.5 },
    { kind: 'basket', quantity: 3, line_total: 7.5 },
  );
  const review = createProductViewFromSummary(
    { id: 7, name: 'Banan', quantity: 3, line_total: 7.5, price: 2.5 },
    { kind: 'review', quantity: 3, line_total: 7.5, approved: false },
  );

  assert.equal(basket.status, 'complete');
  if (basket.status === 'complete') {
    assert.equal(basket.product.price, undefined);
    assert.equal(basket.basket?.quantity, 3);
    assert.equal(basket.basket?.line_total, 7.5);
    assert.equal(basket.product.available, undefined);
    assert.equal(basket.product.is_organic, undefined);
    assert.equal(basket.product.is_frozen, undefined);
    assert.equal(basket.product.is_on_discount, undefined);
  }
  assert.equal(review.status, 'complete');
  if (review.status === 'complete') {
    assert.equal(review.product.price, 2.5);
    assert.equal(review.review?.approved, false);
  }
});

test('shared product view sanitizes images and represents detail failures explicitly', () => {
  const unsafe = createProductView(
    product({ imageUrl: 'https://tracking.example.test/image' }),
    { kind: 'search' },
  );
  assert.equal(unsafe.status, 'complete');
  if (unsafe.status === 'complete') {
    assert.equal(unsafe.product.image_url, undefined);
  }

  const unavailable = createProductView(
    { status: 'unavailable', productId: 9 },
    { kind: 'search' },
  );
  assert.deepEqual(unavailable, {
    context: 'search',
    status: 'unavailable',
    product_id: 9,
  });
});

test('shared product view never needs a provider client for rendering', () => {
  const invalid = createProductView(
    { status: 'invalid', productId: undefined },
    { kind: 'result' },
  );
  assert.deepEqual(invalid, { context: 'result', status: 'unavailable' });
});

test('plural product presentation preserves order and context without shared selection state', () => {
  const views = createProductViews(
    [product({ id: 7 }), { status: 'unavailable', productId: 8 }],
    { kind: 'search' },
  );

  assert.equal(views.length, 2);
  assert.equal(views[0]?.status, 'complete');
  assert.deepEqual(views[1], {
    context: 'search',
    status: 'unavailable',
    product_id: 8,
  });
});

test('product views do not attach heuristic comparison claims', () => {
  const views = createProductViews(
    [
      product({ id: 7, name: 'Prince kiks', price: 20 }),
      product({ id: 8, name: 'Billige kiks', price: 5 }),
    ],
    { kind: 'search' },
  );

  assert.equal(views[0]?.status, 'complete');
  assert.equal(views[1]?.status, 'complete');
  if (views[0]?.status !== 'complete' || views[1]?.status !== 'complete') {
    return;
  }
  assert.deepEqual(views[0].product.tags, []);
  assert.deepEqual(views[1].product.tags, []);

  const single = createProductView(product({ id: 7 }), { kind: 'details' });
  assert.equal(single.status, 'complete');
  if (single.status === 'complete') {
    assert.deepEqual(single.product.tags, []);
  }
});

test('product candidates preserve label order and current Danish organic and discount heuristics', () => {
  const organicLabels = [
    { name: 'empty labels', labels: [], matches: false },
    {
      name: 'uppercase Danish substring',
      labels: ['KAMPAGNE ØKOLOGISK'],
      matches: true,
    },
    {
      name: 'mixed-case Danish substring',
      labels: ['Mælk øKo-mærket'],
      matches: true,
    },
    {
      name: 'ordered multiple labels',
      labels: ['Dansk', 'ØKo valg', 'Tilbud'],
      matches: true,
    },
    { name: 'nonmatching label', labels: ['Dansk'], matches: false },
  ];
  for (const isOrganic of [true, false, undefined]) {
    for (const labelCase of organicLabels) {
      const candidate = rankProducts(
        [product({ isOrganic, labels: labelCase.labels })],
        '',
      )[0]!;
      const expectedOrganic = Boolean(isOrganic || labelCase.matches);
      assert.equal(
        candidate.is_organic,
        expectedOrganic,
        `${String(isOrganic)} with ${labelCase.name}`,
      );
      assert.deepEqual(
        candidate.tags,
        expectedOrganic ? ['organic'] : [],
        `${String(isOrganic)} with ${labelCase.name}`,
      );
      assert.deepEqual(candidate.labels, labelCase.labels);
      assert.notStrictEqual(candidate.labels, labelCase.labels);
    }
  }

  for (const isOnDiscount of [true, false, undefined]) {
    for (const labels of [['TILBUD'], ['Rabatkode']]) {
      const candidate = rankProducts(
        [product({ isOnDiscount, labels })],
        '',
      )[0]!;
      assert.equal(candidate.is_on_discount, isOnDiscount);
    }
  }
});

test('summary product views preserve optional labels and organic label precedence', () => {
  const organicLabels = [
    { name: 'absent labels', labels: undefined, matches: false },
    { name: 'empty labels', labels: [], matches: false },
    {
      name: 'uppercase Danish substring',
      labels: ['KAMPAGNE ØKOLOGISK'],
      matches: true,
    },
    {
      name: 'mixed-case Danish substring',
      labels: ['Mælk øKo-mærket'],
      matches: true,
    },
    {
      name: 'ordered multiple labels',
      labels: ['Dansk', 'ØKo valg', 'Tilbud'],
      matches: true,
    },
    { name: 'nonmatching label', labels: ['Dansk'], matches: false },
  ];
  for (const is_organic of [true, false, undefined]) {
    for (const labelCase of organicLabels) {
      const view = createProductViewFromSummary(
        { is_organic, labels: labelCase.labels },
        { kind: 'basket' },
      );
      assert.ok(view.status === 'complete');
      const expectedOrganic = labelCase.matches ? true : is_organic;
      const expectedTag = is_organic ?? labelCase.matches;
      assert.equal(
        view.product.is_organic,
        expectedOrganic,
        `${String(is_organic)} with ${labelCase.name}`,
      );
      assert.deepEqual(
        view.product.tags,
        expectedTag ? ['organic'] : [],
        `${String(is_organic)} with ${labelCase.name}`,
      );
      assert.deepEqual(view.product.labels, labelCase.labels ?? []);
      if (labelCase.labels) {
        assert.notStrictEqual(view.product.labels, labelCase.labels);
      }
    }
  }
});

test('summary organic label inference preserves the false-flag tag asymmetry', () => {
  const asymmetry = createProductViewFromSummary(
    { is_organic: false, labels: ['Øko-mærket'] },
    { kind: 'basket' },
  );
  assert.ok(asymmetry.status === 'complete');
  assert.equal(asymmetry.product.is_organic, true);
  assert.deepEqual(asymmetry.product.tags, []);
});

test('summary product views preserve discount flags ahead of Danish label fallback', () => {
  const discountLabels = [
    { name: 'absent labels', labels: undefined, matches: false },
    { name: 'empty labels', labels: [], matches: false },
    {
      name: 'uppercase TILBUD substring',
      labels: ['SOMMER TILBUD EXTRA'],
      matches: true,
    },
    {
      name: 'mixed-case TILBUD substring',
      labels: ['Sommer tIlBuD'],
      matches: true,
    },
    { name: 'nonmatching label', labels: ['Rabatkode'], matches: false },
  ];
  for (const is_on_discount of [true, false, undefined]) {
    for (const labelCase of discountLabels) {
      const view = createProductViewFromSummary(
        { is_on_discount, labels: labelCase.labels },
        { kind: 'basket' },
      );
      assert.ok(view.status === 'complete');
      assert.equal(
        view.product.is_on_discount,
        is_on_discount ?? (labelCase.matches || undefined),
        `${String(is_on_discount)} with ${labelCase.name}`,
      );
    }
  }
});
