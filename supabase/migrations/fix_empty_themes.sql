-- Set default menu_theme for stores that have it null or empty
UPDATE stores
SET menu_theme = '{
    "accentColor": "#4ADE80",
    "backgroundColor": "#0D0F0D",
    "surfaceColor": "#141714",
    "textColor": "#FFFFFF",
    "borderRadius": "xl",
    "fontStyle": "sans",
    "cardStyle": "solid",
    "layoutMode": "grid",
    "columns": 2,
    "showImages": true,
    "showPrices": true,
    "showDescription": true,
    "showAddButton": true,
    "showBadges": true,
    "headerAlignment": "left"
}'::jsonb
WHERE menu_theme IS NULL OR menu_theme::text = '{}'::text;
