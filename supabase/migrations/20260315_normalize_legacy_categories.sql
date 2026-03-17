-- ============================================================
-- Normalize legacy product categories to official 16-category standard.
-- Maps all non-standard category names found in existing data
-- to the canonical categories defined in categoryDetector.ts.
-- ============================================================

-- Dairy variants → חלב וביצים
UPDATE public.products SET category = 'חלב וביצים' WHERE category IN (
  'מוצרי חלב',
  'מוצרי חלב וביצים',
  'ביצים',
  'חלב'
);

-- Produce variants → פירות וירקות
UPDATE public.products SET category = 'פירות וירקות' WHERE category IN (
  'ירקות',
  'פירות'
);

-- Meat variants → בשר, עוף ודגים
UPDATE public.products SET category = 'בשר, עוף ודגים' WHERE category IN (
  'בשר ועוף',
  'בשר',
  'עוף',
  'דגים',
  'דגים ופירות ים'
);

-- Bread variants → לחם ומאפים
UPDATE public.products SET category = 'לחם ומאפים' WHERE category IN (
  'מאפים',
  'לחם'
);

-- Drinks variants → שתייה
UPDATE public.products SET category = 'שתייה' WHERE category IN (
  'משקאות'
);

-- Snacks variants → חטיפים, ממתקים ודגנים
UPDATE public.products SET category = 'חטיפים, ממתקים ודגנים' WHERE category IN (
  'חטיפים וממתקים',
  'ממתקים',
  'ממתקים ואפייה',
  'חטיפים',
  'דגנים'
);

-- Canned / sauces variants → שימורים, רטבים וממרחים
UPDATE public.products SET category = 'שימורים, רטבים וממרחים' WHERE category IN (
  'שימורים ורטבים',
  'שימורים',
  'רטבים',
  'ממרחים'
);

-- Spices / oil variants → תבלינים, אפייה ושמנים
UPDATE public.products SET category = 'תבלינים, אפייה ושמנים' WHERE category IN (
  'תבלינים ושמנים',
  'תבלינים',
  'שמנים'
);

-- Pasta / rice variants → פסטה, אורז וקטניות
UPDATE public.products SET category = 'פסטה, אורז וקטניות' WHERE category IN (
  'דגנים, אורז ופסטה',
  'יבשים',
  'פסטה',
  'אורז',
  'קטניות'
);

-- Cleaning variants → ניקיון וחד פעמי
UPDATE public.products SET category = 'ניקיון וחד פעמי' WHERE category IN (
  'מוצרי ניקיון',
  'ניקיון',
  'חד פעמי'
);

-- Hygiene variants → טיפוח והיגיינה
UPDATE public.products SET category = 'טיפוח והיגיינה' WHERE category IN (
  'טיפוח אישי',
  'טיפוח',
  'היגיינה'
);

-- Baby variants → תינוקות
UPDATE public.products SET category = 'תינוקות' WHERE category IN (
  'מוצרים לתינוקות וילדים',
  'מוצרי תינוקות'
);

-- Frozen variants → קפואים
UPDATE public.products SET category = 'קפואים' WHERE category IN (
  'מזון קפוא',
  'קפוא'
);

-- Health variants → בריאות ואורגני
UPDATE public.products SET category = 'בריאות ואורגני' WHERE category IN (
  'מזון בריאות ואורגני',
  'אורגני'
);

-- Ready meals variants → ארוחות מוכנות
UPDATE public.products SET category = 'ארוחות מוכנות' WHERE category IN (
  'מזון מוכן וארוחות',
  'מזון מוכן'
);
