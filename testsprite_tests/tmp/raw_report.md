
# TestSprite AI Testing Report(MCP)

---

## 1️⃣ Document Metadata
- **Project Name:** coffe payper
- **Date:** 2026-01-08
- **Prepared by:** TestSprite AI Team

---

## 2️⃣ Requirement Validation Summary

#### Test TC001
- **Test Name:** User Authentication Success
- **Test Code:** [TC001_User_Authentication_Success.py](./TC001_User_Authentication_Success.py)
- **Test Error:** Login with valid credentials failed to authenticate and redirect to dashboard. No error messages or feedback were shown. Unable to verify user role and data isolation. Reporting issue and stopping further testing.
Browser Console Logs:
[WARNING] cdn.tailwindcss.com should not be used in production. To use Tailwind CSS in production, install it as a PostCSS plugin or use the Tailwind CLI: https://tailwindcss.com/docs/installation (at https://cdn.tailwindcss.com/?plugins=forms,container-queries:63:13404)
[WARNING] cdn.tailwindcss.com should not be used in production. To use Tailwind CSS in production, install it as a PostCSS plugin or use the Tailwind CLI: https://tailwindcss.com/docs/installation (at https://cdn.tailwindcss.com/?plugins=forms,container-queries:63:13404)
[WARNING] cdn.tailwindcss.com should not be used in production. To use Tailwind CSS in production, install it as a PostCSS plugin or use the Tailwind CLI: https://tailwindcss.com/docs/installation (at https://cdn.tailwindcss.com/?plugins=forms,container-queries:63:13404)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/5b9fdd5f-203f-482b-a59c-0e140b5c43b4/e845abca-025f-4155-8e3c-88f11d2a52a3
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC002
- **Test Name:** User Authentication Failure
- **Test Code:** [TC002_User_Authentication_Failure.py](./TC002_User_Authentication_Failure.py)
- **Test Error:** Login with invalid credentials did not fail as expected. The system accepted the invalid credentials and redirected to the dashboard without showing any error message. Therefore, the verification of login failure and error message display is unsuccessful.
Browser Console Logs:
[WARNING] cdn.tailwindcss.com should not be used in production. To use Tailwind CSS in production, install it as a PostCSS plugin or use the Tailwind CLI: https://tailwindcss.com/docs/installation (at https://cdn.tailwindcss.com/?plugins=forms,container-queries:63:13404)
[ERROR] Failed to load resource: net::ERR_CONNECTION_CLOSED (at https://fonts.gstatic.com/s/materialsymbolsoutlined/v307/kJEhBvYX7BgnkSrUwT8OhrdQw4oELdPIeeII9v6oFsI.woff2:0:0)
[WARNING] cdn.tailwindcss.com should not be used in production. To use Tailwind CSS in production, install it as a PostCSS plugin or use the Tailwind CLI: https://tailwindcss.com/docs/installation (at https://cdn.tailwindcss.com/?plugins=forms,container-queries:63:13404)
[WARNING] The width(-1) and height(-1) of chart should be greater than 0,
       please check the style of container, or the props width(100%) and height(100%),
       or add a minWidth(0) or minHeight(undefined) or use aspect(undefined) to control the
       height and width. (at http://localhost:3005/node_modules/.vite/deps/recharts.js?v=c5d26789:9030:16)
[WARNING] The width(-1) and height(-1) of chart should be greater than 0,
       please check the style of container, or the props width(100%) and height(100%),
       or add a minWidth(0) or minHeight(undefined) or use aspect(undefined) to control the
       height and width. (at http://localhost:3005/node_modules/.vite/deps/recharts.js?v=c5d26789:9030:16)
[ERROR] Error fetching insights data: {message: TypeError: Failed to fetch, details: TypeError: Failed to fetch
    at http://localhost…ocalhost:3005/components/SmartInsights.tsx:15:22), hint: , code: } (at http://localhost:3005/lib/insights.ts:9:12)
[ERROR] Error fetching insights data: {message: TypeError: Failed to fetch, details: TypeError: Failed to fetch
    at http://localhost…ocalhost:3005/components/SmartInsights.tsx:15:22), hint: , code: } (at http://localhost:3005/lib/insights.ts:9:12)
[ERROR] Failed to load insights {message: TypeError: Failed to fetch, details: TypeError: Failed to fetch
    at http://localhost…ocalhost:3005/components/SmartInsights.tsx:15:22), hint: , code: } (at http://localhost:3005/components/SmartInsights.tsx:17:16)
[ERROR] Failed to load insights {message: TypeError: Failed to fetch, details: TypeError: Failed to fetch
    at http://localhost…ocalhost:3005/components/SmartInsights.tsx:15:22), hint: , code: } (at http://localhost:3005/components/SmartInsights.tsx:17:16)
[WARNING] cdn.tailwindcss.com should not be used in production. To use Tailwind CSS in production, install it as a PostCSS plugin or use the Tailwind CLI: https://tailwindcss.com/docs/installation (at https://cdn.tailwindcss.com/?plugins=forms,container-queries:63:13404)
[WARNING] The width(-1) and height(-1) of chart should be greater than 0,
       please check the style of container, or the props width(100%) and height(100%),
       or add a minWidth(0) or minHeight(undefined) or use aspect(undefined) to control the
       height and width. (at http://localhost:3005/node_modules/.vite/deps/recharts.js?v=c5d26789:9030:16)
[WARNING] The width(-1) and height(-1) of chart should be greater than 0,
       please check the style of container, or the props width(100%) and height(100%),
       or add a minWidth(0) or minHeight(undefined) or use aspect(undefined) to control the
       height and width. (at http://localhost:3005/node_modules/.vite/deps/recharts.js?v=c5d26789:9030:16)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/orders?select=total_amount%2Cstatus%2Ccreated_at&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&created_at=gte.2026-01-08T00%3A00%3A00.000Z&status=in.%28paid%2Ccompleted%29:0:0)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/orders?select=total_amount%2Cstatus%2Ccreated_at&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&created_at=gte.2026-01-08T00%3A00%3A00.000Z&status=in.%28paid%2Ccompleted%29:0:0)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/inventory_items?select=name%2Cquantity%2Cmin_quantity&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&quantity=lt.10&limit=5:0:0)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/inventory_items?select=name%2Cquantity%2Cmin_quantity&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&quantity=lt.10&limit=5:0:0)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/5b9fdd5f-203f-482b-a59c-0e140b5c43b4/7956d056-79eb-4185-9bcb-018b5c8bebbf
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC003
- **Test Name:** Password Recovery Workflow
- **Test Code:** [TC003_Password_Recovery_Workflow.py](./TC003_Password_Recovery_Workflow.py)
- **Test Error:** Password recovery page is inaccessible because the '¿Problemas con el código?' button does not work. Cannot proceed with password recovery email validation and reset testing. Stopping the task.
Browser Console Logs:
[WARNING] cdn.tailwindcss.com should not be used in production. To use Tailwind CSS in production, install it as a PostCSS plugin or use the Tailwind CLI: https://tailwindcss.com/docs/installation (at https://cdn.tailwindcss.com/?plugins=forms,container-queries:63:13404)
[WARNING] cdn.tailwindcss.com should not be used in production. To use Tailwind CSS in production, install it as a PostCSS plugin or use the Tailwind CLI: https://tailwindcss.com/docs/installation (at https://cdn.tailwindcss.com/?plugins=forms,container-queries:63:13404)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/5b9fdd5f-203f-482b-a59c-0e140b5c43b4/c3edce59-cf18-4088-bb54-a0886d2a900c
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC004
- **Test Name:** Multi-Tenant Data Isolation
- **Test Code:** [TC004_Multi_Tenant_Data_Isolation.py](./TC004_Multi_Tenant_Data_Isolation.py)
- **Test Error:** Tested data segregation by logging in as a user from Tenant A and attempting to access Tenant B's inventory and orders pages. Tenant B's data was accessible and visible without any access denial or restriction, indicating that strict data segregation between tenants is not enforced. Users can access data outside their assigned store, which is a critical security issue that needs to be addressed.
Browser Console Logs:
[WARNING] cdn.tailwindcss.com should not be used in production. To use Tailwind CSS in production, install it as a PostCSS plugin or use the Tailwind CLI: https://tailwindcss.com/docs/installation (at https://cdn.tailwindcss.com/?plugins=forms,container-queries:63:13404)
[WARNING] cdn.tailwindcss.com should not be used in production. To use Tailwind CSS in production, install it as a PostCSS plugin or use the Tailwind CLI: https://tailwindcss.com/docs/installation (at https://cdn.tailwindcss.com/?plugins=forms,container-queries:63:13404)
[WARNING] The width(-1) and height(-1) of chart should be greater than 0,
       please check the style of container, or the props width(100%) and height(100%),
       or add a minWidth(0) or minHeight(undefined) or use aspect(undefined) to control the
       height and width. (at http://localhost:3005/node_modules/.vite/deps/recharts.js?v=c5d26789:9030:16)
[WARNING] The width(-1) and height(-1) of chart should be greater than 0,
       please check the style of container, or the props width(100%) and height(100%),
       or add a minWidth(0) or minHeight(undefined) or use aspect(undefined) to control the
       height and width. (at http://localhost:3005/node_modules/.vite/deps/recharts.js?v=c5d26789:9030:16)
[ERROR] Error fetching insights data: {message: TypeError: Failed to fetch, details: TypeError: Failed to fetch
    at http://localhost…ocalhost:3005/components/SmartInsights.tsx:15:22), hint: , code: } (at http://localhost:3005/lib/insights.ts:9:12)
[ERROR] Error fetching insights data: {message: TypeError: Failed to fetch, details: TypeError: Failed to fetch
    at http://localhost…ocalhost:3005/components/SmartInsights.tsx:15:22), hint: , code: } (at http://localhost:3005/lib/insights.ts:9:12)
[ERROR] Failed to load insights {message: TypeError: Failed to fetch, details: TypeError: Failed to fetch
    at http://localhost…ocalhost:3005/components/SmartInsights.tsx:15:22), hint: , code: } (at http://localhost:3005/components/SmartInsights.tsx:17:16)
[ERROR] Failed to load insights {message: TypeError: Failed to fetch, details: TypeError: Failed to fetch
    at http://localhost…ocalhost:3005/components/SmartInsights.tsx:15:22), hint: , code: } (at http://localhost:3005/components/SmartInsights.tsx:17:16)
[WARNING] cdn.tailwindcss.com should not be used in production. To use Tailwind CSS in production, install it as a PostCSS plugin or use the Tailwind CLI: https://tailwindcss.com/docs/installation (at https://cdn.tailwindcss.com/?plugins=forms,container-queries:63:13404)
[WARNING] The width(-1) and height(-1) of chart should be greater than 0,
       please check the style of container, or the props width(100%) and height(100%),
       or add a minWidth(0) or minHeight(undefined) or use aspect(undefined) to control the
       height and width. (at http://localhost:3005/node_modules/.vite/deps/recharts.js?v=c5d26789:9030:16)
[WARNING] The width(-1) and height(-1) of chart should be greater than 0,
       please check the style of container, or the props width(100%) and height(100%),
       or add a minWidth(0) or minHeight(undefined) or use aspect(undefined) to control the
       height and width. (at http://localhost:3005/node_modules/.vite/deps/recharts.js?v=c5d26789:9030:16)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/orders?select=total_amount%2Cstatus%2Ccreated_at&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&created_at=gte.2026-01-08T00%3A00%3A00.000Z&status=in.%28paid%2Ccompleted%29:0:0)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/orders?select=total_amount%2Cstatus%2Ccreated_at&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&created_at=gte.2026-01-08T00%3A00%3A00.000Z&status=in.%28paid%2Ccompleted%29:0:0)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/inventory_items?select=name%2Cquantity%2Cmin_quantity&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&quantity=lt.10&limit=5:0:0)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/inventory_items?select=name%2Cquantity%2Cmin_quantity&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&quantity=lt.10&limit=5:0:0)
[WARNING] cdn.tailwindcss.com should not be used in production. To use Tailwind CSS in production, install it as a PostCSS plugin or use the Tailwind CLI: https://tailwindcss.com/docs/installation (at https://cdn.tailwindcss.com/?plugins=forms,container-queries:63:13404)
[WARNING] The width(-1) and height(-1) of chart should be greater than 0,
       please check the style of container, or the props width(100%) and height(100%),
       or add a minWidth(0) or minHeight(undefined) or use aspect(undefined) to control the
       height and width. (at http://localhost:3005/node_modules/.vite/deps/recharts.js?v=c5d26789:9030:16)
[WARNING] The width(-1) and height(-1) of chart should be greater than 0,
       please check the style of container, or the props width(100%) and height(100%),
       or add a minWidth(0) or minHeight(undefined) or use aspect(undefined) to control the
       height and width. (at http://localhost:3005/node_modules/.vite/deps/recharts.js?v=c5d26789:9030:16)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/orders?select=total_amount%2Cstatus%2Ccreated_at&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&created_at=gte.2026-01-08T00%3A00%3A00.000Z&status=in.%28paid%2Ccompleted%29:0:0)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/orders?select=total_amount%2Cstatus%2Ccreated_at&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&created_at=gte.2026-01-08T00%3A00%3A00.000Z&status=in.%28paid%2Ccompleted%29:0:0)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/5b9fdd5f-203f-482b-a59c-0e140b5c43b4/1aaeff55-06d3-415b-8756-32a24c8af4fa
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC005
- **Test Name:** Inventory Item CRUD Operations
- **Test Code:** [null](./null)
- **Test Error:** Test execution timed out after 15 minutes
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/5b9fdd5f-203f-482b-a59c-0e140b5c43b4/0e915461-b4bf-4e64-8b47-d0740cf590ee
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC006
- **Test Name:** Recipe Ingredient Association
- **Test Code:** [TC006_Recipe_Ingredient_Association.py](./TC006_Recipe_Ingredient_Association.py)
- **Test Error:** Stopped testing because the 'add' button to create a new recipe does not open the creation interface, blocking the task of verifying recipe creation and ingredient association. Issue reported.
Browser Console Logs:
[WARNING] cdn.tailwindcss.com should not be used in production. To use Tailwind CSS in production, install it as a PostCSS plugin or use the Tailwind CLI: https://tailwindcss.com/docs/installation (at https://cdn.tailwindcss.com/?plugins=forms,container-queries:63:13404)
[WARNING] cdn.tailwindcss.com should not be used in production. To use Tailwind CSS in production, install it as a PostCSS plugin or use the Tailwind CLI: https://tailwindcss.com/docs/installation (at https://cdn.tailwindcss.com/?plugins=forms,container-queries:63:13404)
[WARNING] The width(-1) and height(-1) of chart should be greater than 0,
       please check the style of container, or the props width(100%) and height(100%),
       or add a minWidth(0) or minHeight(undefined) or use aspect(undefined) to control the
       height and width. (at http://localhost:3005/node_modules/.vite/deps/recharts.js?v=c5d26789:9030:16)
[WARNING] The width(-1) and height(-1) of chart should be greater than 0,
       please check the style of container, or the props width(100%) and height(100%),
       or add a minWidth(0) or minHeight(undefined) or use aspect(undefined) to control the
       height and width. (at http://localhost:3005/node_modules/.vite/deps/recharts.js?v=c5d26789:9030:16)
[ERROR] Error fetching insights data: {message: TypeError: Failed to fetch, details: TypeError: Failed to fetch
    at http://localhost…ocalhost:3005/components/SmartInsights.tsx:15:22), hint: , code: } (at http://localhost:3005/lib/insights.ts:9:12)
[ERROR] Error fetching insights data: {message: TypeError: Failed to fetch, details: TypeError: Failed to fetch
    at http://localhost…ocalhost:3005/components/SmartInsights.tsx:15:22), hint: , code: } (at http://localhost:3005/lib/insights.ts:9:12)
[ERROR] Failed to load insights {message: TypeError: Failed to fetch, details: TypeError: Failed to fetch
    at http://localhost…ocalhost:3005/components/SmartInsights.tsx:15:22), hint: , code: } (at http://localhost:3005/components/SmartInsights.tsx:17:16)
[ERROR] Failed to load insights {message: TypeError: Failed to fetch, details: TypeError: Failed to fetch
    at http://localhost…ocalhost:3005/components/SmartInsights.tsx:15:22), hint: , code: } (at http://localhost:3005/components/SmartInsights.tsx:17:16)
[WARNING] cdn.tailwindcss.com should not be used in production. To use Tailwind CSS in production, install it as a PostCSS plugin or use the Tailwind CLI: https://tailwindcss.com/docs/installation (at https://cdn.tailwindcss.com/?plugins=forms,container-queries:63:13404)
[WARNING] The width(-1) and height(-1) of chart should be greater than 0,
       please check the style of container, or the props width(100%) and height(100%),
       or add a minWidth(0) or minHeight(undefined) or use aspect(undefined) to control the
       height and width. (at http://localhost:3005/node_modules/.vite/deps/recharts.js?v=c5d26789:9030:16)
[WARNING] The width(-1) and height(-1) of chart should be greater than 0,
       please check the style of container, or the props width(100%) and height(100%),
       or add a minWidth(0) or minHeight(undefined) or use aspect(undefined) to control the
       height and width. (at http://localhost:3005/node_modules/.vite/deps/recharts.js?v=c5d26789:9030:16)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/orders?select=total_amount%2Cstatus%2Ccreated_at&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&created_at=gte.2026-01-08T00%3A00%3A00.000Z&status=in.%28paid%2Ccompleted%29:0:0)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/orders?select=total_amount%2Cstatus%2Ccreated_at&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&created_at=gte.2026-01-08T00%3A00%3A00.000Z&status=in.%28paid%2Ccompleted%29:0:0)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/inventory_items?select=name%2Cquantity%2Cmin_quantity&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&quantity=lt.10&limit=5:0:0)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/inventory_items?select=name%2Cquantity%2Cmin_quantity&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&quantity=lt.10&limit=5:0:0)
[WARNING] cdn.tailwindcss.com should not be used in production. To use Tailwind CSS in production, install it as a PostCSS plugin or use the Tailwind CLI: https://tailwindcss.com/docs/installation (at https://cdn.tailwindcss.com/?plugins=forms,container-queries:63:13404)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/orders?select=total_amount%2Cstatus%2Ccreated_at&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&created_at=gte.2026-01-08T00%3A00%3A00.000Z&status=in.%28paid%2Ccompleted%29:0:0)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/orders?select=total_amount%2Cstatus%2Ccreated_at&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&created_at=gte.2026-01-08T00%3A00%3A00.000Z&status=in.%28paid%2Ccompleted%29:0:0)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/inventory_items?select=name%2Cquantity%2Cmin_quantity&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&quantity=lt.10&limit=5:0:0)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/inventory_items?select=name%2Cquantity%2Cmin_quantity&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&quantity=lt.10&limit=5:0:0)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/5b9fdd5f-203f-482b-a59c-0e140b5c43b4/01858c1b-2d7b-4221-8f1c-858dca1bd915
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC007
- **Test Name:** Visual Menu Design Updates and Live Preview
- **Test Code:** [TC007_Visual_Menu_Design_Updates_and_Live_Preview.py](./TC007_Visual_Menu_Design_Updates_and_Live_Preview.py)
- **Test Error:** The menu design editor allows adding a new product with variants and add-ons, but the live preview does not update dynamically as expected. The page shows a loading message and a JavaScript disabled notice, blocking further testing. The issue prevents verifying reorder and save functionality. Task stopped due to this critical issue.
Browser Console Logs:
[WARNING] cdn.tailwindcss.com should not be used in production. To use Tailwind CSS in production, install it as a PostCSS plugin or use the Tailwind CLI: https://tailwindcss.com/docs/installation (at https://cdn.tailwindcss.com/?plugins=forms,container-queries:63:13404)
[WARNING] cdn.tailwindcss.com should not be used in production. To use Tailwind CSS in production, install it as a PostCSS plugin or use the Tailwind CLI: https://tailwindcss.com/docs/installation (at https://cdn.tailwindcss.com/?plugins=forms,container-queries:63:13404)
[WARNING] The width(-1) and height(-1) of chart should be greater than 0,
       please check the style of container, or the props width(100%) and height(100%),
       or add a minWidth(0) or minHeight(undefined) or use aspect(undefined) to control the
       height and width. (at http://localhost:3005/node_modules/.vite/deps/recharts.js?v=c5d26789:9030:16)
[WARNING] The width(-1) and height(-1) of chart should be greater than 0,
       please check the style of container, or the props width(100%) and height(100%),
       or add a minWidth(0) or minHeight(undefined) or use aspect(undefined) to control the
       height and width. (at http://localhost:3005/node_modules/.vite/deps/recharts.js?v=c5d26789:9030:16)
[ERROR] Error fetching insights data: {message: TypeError: Failed to fetch, details: TypeError: Failed to fetch
    at http://localhost…ocalhost:3005/components/SmartInsights.tsx:15:22), hint: , code: } (at http://localhost:3005/lib/insights.ts:9:12)
[ERROR] Error fetching insights data: {message: TypeError: Failed to fetch, details: TypeError: Failed to fetch
    at http://localhost…ocalhost:3005/components/SmartInsights.tsx:15:22), hint: , code: } (at http://localhost:3005/lib/insights.ts:9:12)
[ERROR] Failed to load insights {message: TypeError: Failed to fetch, details: TypeError: Failed to fetch
    at http://localhost…ocalhost:3005/components/SmartInsights.tsx:15:22), hint: , code: } (at http://localhost:3005/components/SmartInsights.tsx:17:16)
[ERROR] Failed to load insights {message: TypeError: Failed to fetch, details: TypeError: Failed to fetch
    at http://localhost…ocalhost:3005/components/SmartInsights.tsx:15:22), hint: , code: } (at http://localhost:3005/components/SmartInsights.tsx:17:16)
[WARNING] cdn.tailwindcss.com should not be used in production. To use Tailwind CSS in production, install it as a PostCSS plugin or use the Tailwind CLI: https://tailwindcss.com/docs/installation (at https://cdn.tailwindcss.com/?plugins=forms,container-queries:63:13404)
[WARNING] The width(-1) and height(-1) of chart should be greater than 0,
       please check the style of container, or the props width(100%) and height(100%),
       or add a minWidth(0) or minHeight(undefined) or use aspect(undefined) to control the
       height and width. (at http://localhost:3005/node_modules/.vite/deps/recharts.js?v=c5d26789:9030:16)
[WARNING] The width(-1) and height(-1) of chart should be greater than 0,
       please check the style of container, or the props width(100%) and height(100%),
       or add a minWidth(0) or minHeight(undefined) or use aspect(undefined) to control the
       height and width. (at http://localhost:3005/node_modules/.vite/deps/recharts.js?v=c5d26789:9030:16)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/orders?select=total_amount%2Cstatus%2Ccreated_at&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&created_at=gte.2026-01-08T00%3A00%3A00.000Z&status=in.%28paid%2Ccompleted%29:0:0)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/orders?select=total_amount%2Cstatus%2Ccreated_at&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&created_at=gte.2026-01-08T00%3A00%3A00.000Z&status=in.%28paid%2Ccompleted%29:0:0)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/inventory_items?select=name%2Cquantity%2Cmin_quantity&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&quantity=lt.10&limit=5:0:0)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/inventory_items?select=name%2Cquantity%2Cmin_quantity&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&quantity=lt.10&limit=5:0:0)
[WARNING] cdn.tailwindcss.com should not be used in production. To use Tailwind CSS in production, install it as a PostCSS plugin or use the Tailwind CLI: https://tailwindcss.com/docs/installation (at https://cdn.tailwindcss.com/?plugins=forms,container-queries:63:13404)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/orders?select=total_amount%2Cstatus%2Ccreated_at&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&created_at=gte.2026-01-08T00%3A00%3A00.000Z&status=in.%28paid%2Ccompleted%29:0:0)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/orders?select=total_amount%2Cstatus%2Ccreated_at&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&created_at=gte.2026-01-08T00%3A00%3A00.000Z&status=in.%28paid%2Ccompleted%29:0:0)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/inventory_items?select=name%2Cquantity%2Cmin_quantity&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&quantity=lt.10&limit=5:0:0)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/inventory_items?select=name%2Cquantity%2Cmin_quantity&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&quantity=lt.10&limit=5:0:0)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/5b9fdd5f-203f-482b-a59c-0e140b5c43b4/1ab16f75-97a8-4807-b95e-81c9ab93a127
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC008
- **Test Name:** Order Creation and Real-Time Kanban Board Update
- **Test Code:** [TC008_Order_Creation_and_Real_Time_Kanban_Board_Update.py](./TC008_Order_Creation_and_Real_Time_Kanban_Board_Update.py)
- **Test Error:** Testing stopped due to critical login and navigation issues preventing access to the POS system and order creation features. Unable to continue with the test steps as specified.
Browser Console Logs:
[WARNING] cdn.tailwindcss.com should not be used in production. To use Tailwind CSS in production, install it as a PostCSS plugin or use the Tailwind CLI: https://tailwindcss.com/docs/installation (at https://cdn.tailwindcss.com/?plugins=forms,container-queries:63:13404)
[WARNING] cdn.tailwindcss.com should not be used in production. To use Tailwind CSS in production, install it as a PostCSS plugin or use the Tailwind CLI: https://tailwindcss.com/docs/installation (at https://cdn.tailwindcss.com/?plugins=forms,container-queries:63:13404)
[WARNING] cdn.tailwindcss.com should not be used in production. To use Tailwind CSS in production, install it as a PostCSS plugin or use the Tailwind CLI: https://tailwindcss.com/docs/installation (at https://cdn.tailwindcss.com/?plugins=forms,container-queries:63:13404)
[WARNING] cdn.tailwindcss.com should not be used in production. To use Tailwind CSS in production, install it as a PostCSS plugin or use the Tailwind CLI: https://tailwindcss.com/docs/installation (at https://cdn.tailwindcss.com/?plugins=forms,container-queries:63:13404)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/5b9fdd5f-203f-482b-a59c-0e140b5c43b4/55579518-b9e7-4f9b-a560-50204870ec1e
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC009
- **Test Name:** Public Client Ordering Flow
- **Test Code:** [TC009_Public_Client_Ordering_Flow.py](./TC009_Public_Client_Ordering_Flow.py)
- **Test Error:** Testing stopped due to inability to login. The login page does not accept input in the email field and clicking the authenticate button does not proceed or show any feedback. Unable to verify public client menu, cart, checkout, and order tracking functionalities.
Browser Console Logs:
[WARNING] cdn.tailwindcss.com should not be used in production. To use Tailwind CSS in production, install it as a PostCSS plugin or use the Tailwind CLI: https://tailwindcss.com/docs/installation (at https://cdn.tailwindcss.com/?plugins=forms,container-queries:63:13404)
[WARNING] cdn.tailwindcss.com should not be used in production. To use Tailwind CSS in production, install it as a PostCSS plugin or use the Tailwind CLI: https://tailwindcss.com/docs/installation (at https://cdn.tailwindcss.com/?plugins=forms,container-queries:63:13404)
[WARNING] cdn.tailwindcss.com should not be used in production. To use Tailwind CSS in production, install it as a PostCSS plugin or use the Tailwind CLI: https://tailwindcss.com/docs/installation (at https://cdn.tailwindcss.com/?plugins=forms,container-queries:63:13404)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/5b9fdd5f-203f-482b-a59c-0e140b5c43b4/79f6ed8b-9100-45ed-a000-7b1bd7fa5de6
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC010
- **Test Name:** Staff Invitation and Role Assignment
- **Test Code:** [TC010_Staff_Invitation_and_Role_Assignment.py](./TC010_Staff_Invitation_and_Role_Assignment.py)
- **Test Error:** Login attempt with provided credentials failed; the system remains on the login page without access to dashboard or staff invitation section. Cannot proceed with staff invitation workflow test. Please verify credentials or system status.
Browser Console Logs:
[WARNING] cdn.tailwindcss.com should not be used in production. To use Tailwind CSS in production, install it as a PostCSS plugin or use the Tailwind CLI: https://tailwindcss.com/docs/installation (at https://cdn.tailwindcss.com/?plugins=forms,container-queries:63:13404)
[WARNING] cdn.tailwindcss.com should not be used in production. To use Tailwind CSS in production, install it as a PostCSS plugin or use the Tailwind CLI: https://tailwindcss.com/docs/installation (at https://cdn.tailwindcss.com/?plugins=forms,container-queries:63:13404)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/5b9fdd5f-203f-482b-a59c-0e140b5c43b4/96104111-f3fe-49d5-9d96-6be8e21a0309
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC011
- **Test Name:** Audit Log Entries
- **Test Code:** [TC011_Audit_Log_Entries.py](./TC011_Audit_Log_Entries.py)
- **Test Error:** Reported website issue: Audit log page navigation failed after clicking audit button on inventory page. Cannot verify audit log entries. Stopping further actions as per instructions.
Browser Console Logs:
[WARNING] cdn.tailwindcss.com should not be used in production. To use Tailwind CSS in production, install it as a PostCSS plugin or use the Tailwind CLI: https://tailwindcss.com/docs/installation (at https://cdn.tailwindcss.com/?plugins=forms,container-queries:63:13404)
[WARNING] cdn.tailwindcss.com should not be used in production. To use Tailwind CSS in production, install it as a PostCSS plugin or use the Tailwind CLI: https://tailwindcss.com/docs/installation (at https://cdn.tailwindcss.com/?plugins=forms,container-queries:63:13404)
[WARNING] The width(-1) and height(-1) of chart should be greater than 0,
       please check the style of container, or the props width(100%) and height(100%),
       or add a minWidth(0) or minHeight(undefined) or use aspect(undefined) to control the
       height and width. (at http://localhost:3005/node_modules/.vite/deps/recharts.js?v=c5d26789:9030:16)
[WARNING] The width(-1) and height(-1) of chart should be greater than 0,
       please check the style of container, or the props width(100%) and height(100%),
       or add a minWidth(0) or minHeight(undefined) or use aspect(undefined) to control the
       height and width. (at http://localhost:3005/node_modules/.vite/deps/recharts.js?v=c5d26789:9030:16)
[ERROR] Error fetching insights data: {message: TypeError: Failed to fetch, details: TypeError: Failed to fetch
    at http://localhost…ocalhost:3005/components/SmartInsights.tsx:15:22), hint: , code: } (at http://localhost:3005/lib/insights.ts:9:12)
[ERROR] Error fetching insights data: {message: TypeError: Failed to fetch, details: TypeError: Failed to fetch
    at http://localhost…ocalhost:3005/components/SmartInsights.tsx:15:22), hint: , code: } (at http://localhost:3005/lib/insights.ts:9:12)
[ERROR] Failed to load insights {message: TypeError: Failed to fetch, details: TypeError: Failed to fetch
    at http://localhost…ocalhost:3005/components/SmartInsights.tsx:15:22), hint: , code: } (at http://localhost:3005/components/SmartInsights.tsx:17:16)
[ERROR] Failed to load insights {message: TypeError: Failed to fetch, details: TypeError: Failed to fetch
    at http://localhost…ocalhost:3005/components/SmartInsights.tsx:15:22), hint: , code: } (at http://localhost:3005/components/SmartInsights.tsx:17:16)
[WARNING] cdn.tailwindcss.com should not be used in production. To use Tailwind CSS in production, install it as a PostCSS plugin or use the Tailwind CLI: https://tailwindcss.com/docs/installation (at https://cdn.tailwindcss.com/?plugins=forms,container-queries:63:13404)
[WARNING] The width(-1) and height(-1) of chart should be greater than 0,
       please check the style of container, or the props width(100%) and height(100%),
       or add a minWidth(0) or minHeight(undefined) or use aspect(undefined) to control the
       height and width. (at http://localhost:3005/node_modules/.vite/deps/recharts.js?v=c5d26789:9030:16)
[WARNING] The width(-1) and height(-1) of chart should be greater than 0,
       please check the style of container, or the props width(100%) and height(100%),
       or add a minWidth(0) or minHeight(undefined) or use aspect(undefined) to control the
       height and width. (at http://localhost:3005/node_modules/.vite/deps/recharts.js?v=c5d26789:9030:16)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/orders?select=total_amount%2Cstatus%2Ccreated_at&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&created_at=gte.2026-01-08T00%3A00%3A00.000Z&status=in.%28paid%2Ccompleted%29:0:0)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/orders?select=total_amount%2Cstatus%2Ccreated_at&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&created_at=gte.2026-01-08T00%3A00%3A00.000Z&status=in.%28paid%2Ccompleted%29:0:0)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/inventory_items?select=name%2Cquantity%2Cmin_quantity&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&quantity=lt.10&limit=5:0:0)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/inventory_items?select=name%2Cquantity%2Cmin_quantity&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&quantity=lt.10&limit=5:0:0)
[ERROR] [Realtime] ❌ Error en el canal (at http://localhost:3005/pages/InventoryManagement.tsx:350:16)
[WARNING] cdn.tailwindcss.com should not be used in production. To use Tailwind CSS in production, install it as a PostCSS plugin or use the Tailwind CLI: https://tailwindcss.com/docs/installation (at https://cdn.tailwindcss.com/?plugins=forms,container-queries:63:13404)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/orders?select=total_amount%2Cstatus%2Ccreated_at&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&created_at=gte.2026-01-08T00%3A00%3A00.000Z&status=in.%28paid%2Ccompleted%29:0:0)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/orders?select=total_amount%2Cstatus%2Ccreated_at&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&created_at=gte.2026-01-08T00%3A00%3A00.000Z&status=in.%28paid%2Ccompleted%29:0:0)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/inventory_items?select=name%2Cquantity%2Cmin_quantity&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&quantity=lt.10&limit=5:0:0)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/5b9fdd5f-203f-482b-a59c-0e140b5c43b4/87c71c4e-b208-468a-b636-a1f57ce7f673
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC012
- **Test Name:** AI Product Description Generation
- **Test Code:** [TC012_AI_Product_Description_Generation.py](./TC012_AI_Product_Description_Generation.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/5b9fdd5f-203f-482b-a59c-0e140b5c43b4/629f22ae-af6a-4867-a1e4-542c06e94c5a
- **Status:** ✅ Passed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC013
- **Test Name:** PWA Offline Mode and Data Sync
- **Test Code:** [TC013_PWA_Offline_Mode_and_Data_Sync.py](./TC013_PWA_Offline_Mode_and_Data_Sync.py)
- **Test Error:** Reported navigation issue preventing access to inventory section. Stopping further actions as per user instruction.
Browser Console Logs:
[WARNING] cdn.tailwindcss.com should not be used in production. To use Tailwind CSS in production, install it as a PostCSS plugin or use the Tailwind CLI: https://tailwindcss.com/docs/installation (at https://cdn.tailwindcss.com/?plugins=forms,container-queries:63:13404)
[ERROR] Failed to load resource: net::ERR_CONNECTION_CLOSED (at https://fonts.gstatic.com/s/materialsymbolsoutlined/v307/kJEhBvYX7BgnkSrUwT8OhrdQw4oELdPIeeII9v6oFsI.woff2:0:0)
[WARNING] cdn.tailwindcss.com should not be used in production. To use Tailwind CSS in production, install it as a PostCSS plugin or use the Tailwind CLI: https://tailwindcss.com/docs/installation (at https://cdn.tailwindcss.com/?plugins=forms,container-queries:63:13404)
[WARNING] The width(-1) and height(-1) of chart should be greater than 0,
       please check the style of container, or the props width(100%) and height(100%),
       or add a minWidth(0) or minHeight(undefined) or use aspect(undefined) to control the
       height and width. (at http://localhost:3005/node_modules/.vite/deps/recharts.js?v=c5d26789:9030:16)
[WARNING] The width(-1) and height(-1) of chart should be greater than 0,
       please check the style of container, or the props width(100%) and height(100%),
       or add a minWidth(0) or minHeight(undefined) or use aspect(undefined) to control the
       height and width. (at http://localhost:3005/node_modules/.vite/deps/recharts.js?v=c5d26789:9030:16)
[ERROR] Error fetching insights data: {message: TypeError: Failed to fetch, details: TypeError: Failed to fetch
    at http://localhost…ocalhost:3005/components/SmartInsights.tsx:15:22), hint: , code: } (at http://localhost:3005/lib/insights.ts:9:12)
[ERROR] Error fetching insights data: {message: TypeError: Failed to fetch, details: TypeError: Failed to fetch
    at http://localhost…ocalhost:3005/components/SmartInsights.tsx:15:22), hint: , code: } (at http://localhost:3005/lib/insights.ts:9:12)
[ERROR] Failed to load insights {message: TypeError: Failed to fetch, details: TypeError: Failed to fetch
    at http://localhost…ocalhost:3005/components/SmartInsights.tsx:15:22), hint: , code: } (at http://localhost:3005/components/SmartInsights.tsx:17:16)
[ERROR] Failed to load insights {message: TypeError: Failed to fetch, details: TypeError: Failed to fetch
    at http://localhost…ocalhost:3005/components/SmartInsights.tsx:15:22), hint: , code: } (at http://localhost:3005/components/SmartInsights.tsx:17:16)
[WARNING] cdn.tailwindcss.com should not be used in production. To use Tailwind CSS in production, install it as a PostCSS plugin or use the Tailwind CLI: https://tailwindcss.com/docs/installation (at https://cdn.tailwindcss.com/?plugins=forms,container-queries:63:13404)
[WARNING] The width(-1) and height(-1) of chart should be greater than 0,
       please check the style of container, or the props width(100%) and height(100%),
       or add a minWidth(0) or minHeight(undefined) or use aspect(undefined) to control the
       height and width. (at http://localhost:3005/node_modules/.vite/deps/recharts.js?v=c5d26789:9030:16)
[WARNING] The width(-1) and height(-1) of chart should be greater than 0,
       please check the style of container, or the props width(100%) and height(100%),
       or add a minWidth(0) or minHeight(undefined) or use aspect(undefined) to control the
       height and width. (at http://localhost:3005/node_modules/.vite/deps/recharts.js?v=c5d26789:9030:16)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/orders?select=total_amount%2Cstatus%2Ccreated_at&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&created_at=gte.2026-01-08T00%3A00%3A00.000Z&status=in.%28paid%2Ccompleted%29:0:0)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/orders?select=total_amount%2Cstatus%2Ccreated_at&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&created_at=gte.2026-01-08T00%3A00%3A00.000Z&status=in.%28paid%2Ccompleted%29:0:0)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/inventory_items?select=name%2Cquantity%2Cmin_quantity&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&quantity=lt.10&limit=5:0:0)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/inventory_items?select=name%2Cquantity%2Cmin_quantity&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&quantity=lt.10&limit=5:0:0)
[WARNING] cdn.tailwindcss.com should not be used in production. To use Tailwind CSS in production, install it as a PostCSS plugin or use the Tailwind CLI: https://tailwindcss.com/docs/installation (at https://cdn.tailwindcss.com/?plugins=forms,container-queries:63:13404)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/orders?select=total_amount%2Cstatus%2Ccreated_at&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&created_at=gte.2026-01-08T00%3A00%3A00.000Z&status=in.%28paid%2Ccompleted%29:0:0)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/orders?select=total_amount%2Cstatus%2Ccreated_at&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&created_at=gte.2026-01-08T00%3A00%3A00.000Z&status=in.%28paid%2Ccompleted%29:0:0)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/inventory_items?select=name%2Cquantity%2Cmin_quantity&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&quantity=lt.10&limit=5:0:0)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/5b9fdd5f-203f-482b-a59c-0e140b5c43b4/7966a94f-f7db-4d54-bb75-5d8f3566ca7c
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC014
- **Test Name:** Finance Reporting Accuracy
- **Test Code:** [TC014_Finance_Reporting_Accuracy.py](./TC014_Finance_Reporting_Accuracy.py)
- **Test Error:** The task to validate financial reports, cash shifts, and payment gateway integration is incomplete. Login and navigation to finance module were successful. Cash register opening modal appeared but the initial amount input field could not be interacted with, preventing completion of cash shift operations and payment processing including MercadoPago transactions. Consequently, financial report generation and validation could not be performed. Further investigation or UI fixes are needed to enable input in the cash register opening modal to proceed with the task.
Browser Console Logs:
[WARNING] cdn.tailwindcss.com should not be used in production. To use Tailwind CSS in production, install it as a PostCSS plugin or use the Tailwind CLI: https://tailwindcss.com/docs/installation (at https://cdn.tailwindcss.com/?plugins=forms,container-queries:63:13404)
[WARNING] cdn.tailwindcss.com should not be used in production. To use Tailwind CSS in production, install it as a PostCSS plugin or use the Tailwind CLI: https://tailwindcss.com/docs/installation (at https://cdn.tailwindcss.com/?plugins=forms,container-queries:63:13404)
[WARNING] The width(-1) and height(-1) of chart should be greater than 0,
       please check the style of container, or the props width(100%) and height(100%),
       or add a minWidth(0) or minHeight(undefined) or use aspect(undefined) to control the
       height and width. (at http://localhost:3005/node_modules/.vite/deps/recharts.js?v=c5d26789:9030:16)
[WARNING] The width(-1) and height(-1) of chart should be greater than 0,
       please check the style of container, or the props width(100%) and height(100%),
       or add a minWidth(0) or minHeight(undefined) or use aspect(undefined) to control the
       height and width. (at http://localhost:3005/node_modules/.vite/deps/recharts.js?v=c5d26789:9030:16)
[ERROR] Error fetching insights data: {message: TypeError: Failed to fetch, details: TypeError: Failed to fetch
    at http://localhost…ocalhost:3005/components/SmartInsights.tsx:15:22), hint: , code: } (at http://localhost:3005/lib/insights.ts:9:12)
[ERROR] Error fetching insights data: {message: TypeError: Failed to fetch, details: TypeError: Failed to fetch
    at http://localhost…ocalhost:3005/components/SmartInsights.tsx:15:22), hint: , code: } (at http://localhost:3005/lib/insights.ts:9:12)
[ERROR] Failed to load insights {message: TypeError: Failed to fetch, details: TypeError: Failed to fetch
    at http://localhost…ocalhost:3005/components/SmartInsights.tsx:15:22), hint: , code: } (at http://localhost:3005/components/SmartInsights.tsx:17:16)
[ERROR] Failed to load insights {message: TypeError: Failed to fetch, details: TypeError: Failed to fetch
    at http://localhost…ocalhost:3005/components/SmartInsights.tsx:15:22), hint: , code: } (at http://localhost:3005/components/SmartInsights.tsx:17:16)
[WARNING] cdn.tailwindcss.com should not be used in production. To use Tailwind CSS in production, install it as a PostCSS plugin or use the Tailwind CLI: https://tailwindcss.com/docs/installation (at https://cdn.tailwindcss.com/?plugins=forms,container-queries:63:13404)
[WARNING] The width(-1) and height(-1) of chart should be greater than 0,
       please check the style of container, or the props width(100%) and height(100%),
       or add a minWidth(0) or minHeight(undefined) or use aspect(undefined) to control the
       height and width. (at http://localhost:3005/node_modules/.vite/deps/recharts.js?v=c5d26789:9030:16)
[WARNING] The width(-1) and height(-1) of chart should be greater than 0,
       please check the style of container, or the props width(100%) and height(100%),
       or add a minWidth(0) or minHeight(undefined) or use aspect(undefined) to control the
       height and width. (at http://localhost:3005/node_modules/.vite/deps/recharts.js?v=c5d26789:9030:16)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/orders?select=total_amount%2Cstatus%2Ccreated_at&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&created_at=gte.2026-01-08T00%3A00%3A00.000Z&status=in.%28paid%2Ccompleted%29:0:0)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/orders?select=total_amount%2Cstatus%2Ccreated_at&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&created_at=gte.2026-01-08T00%3A00%3A00.000Z&status=in.%28paid%2Ccompleted%29:0:0)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/inventory_items?select=name%2Cquantity%2Cmin_quantity&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&quantity=lt.10&limit=5:0:0)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/inventory_items?select=name%2Cquantity%2Cmin_quantity&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&quantity=lt.10&limit=5:0:0)
[WARNING] The width(-1) and height(-1) of chart should be greater than 0,
       please check the style of container, or the props width(100%) and height(100%),
       or add a minWidth(0) or minHeight(undefined) or use aspect(undefined) to control the
       height and width. (at http://localhost:3005/node_modules/.vite/deps/recharts.js?v=c5d26789:9030:16)
[WARNING] The width(-1) and height(-1) of chart should be greater than 0,
       please check the style of container, or the props width(100%) and height(100%),
       or add a minWidth(0) or minHeight(undefined) or use aspect(undefined) to control the
       height and width. (at http://localhost:3005/node_modules/.vite/deps/recharts.js?v=c5d26789:9030:16)
[WARNING] cdn.tailwindcss.com should not be used in production. To use Tailwind CSS in production, install it as a PostCSS plugin or use the Tailwind CLI: https://tailwindcss.com/docs/installation (at https://cdn.tailwindcss.com/?plugins=forms,container-queries:63:13404)
[WARNING] The width(-1) and height(-1) of chart should be greater than 0,
       please check the style of container, or the props width(100%) and height(100%),
       or add a minWidth(0) or minHeight(undefined) or use aspect(undefined) to control the
       height and width. (at http://localhost:3005/node_modules/.vite/deps/recharts.js?v=c5d26789:9030:16)
[WARNING] The width(-1) and height(-1) of chart should be greater than 0,
       please check the style of container, or the props width(100%) and height(100%),
       or add a minWidth(0) or minHeight(undefined) or use aspect(undefined) to control the
       height and width. (at http://localhost:3005/node_modules/.vite/deps/recharts.js?v=c5d26789:9030:16)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/5b9fdd5f-203f-482b-a59c-0e140b5c43b4/bc3a77e9-f4d9-42cb-b486-4145425c2b5c
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC015
- **Test Name:** Staff Role-Based Access Control
- **Test Code:** [TC015_Staff_Role_Based_Access_Control.py](./TC015_Staff_Role_Based_Access_Control.py)
- **Test Error:** Access control verification failed. User with limited permissions accessed restricted 'Finance' module. Reporting issue and stopping further tests.
Browser Console Logs:
[WARNING] cdn.tailwindcss.com should not be used in production. To use Tailwind CSS in production, install it as a PostCSS plugin or use the Tailwind CLI: https://tailwindcss.com/docs/installation (at https://cdn.tailwindcss.com/?plugins=forms,container-queries:63:13404)
[WARNING] cdn.tailwindcss.com should not be used in production. To use Tailwind CSS in production, install it as a PostCSS plugin or use the Tailwind CLI: https://tailwindcss.com/docs/installation (at https://cdn.tailwindcss.com/?plugins=forms,container-queries:63:13404)
[WARNING] The width(-1) and height(-1) of chart should be greater than 0,
       please check the style of container, or the props width(100%) and height(100%),
       or add a minWidth(0) or minHeight(undefined) or use aspect(undefined) to control the
       height and width. (at http://localhost:3005/node_modules/.vite/deps/recharts.js?v=c5d26789:9030:16)
[WARNING] The width(-1) and height(-1) of chart should be greater than 0,
       please check the style of container, or the props width(100%) and height(100%),
       or add a minWidth(0) or minHeight(undefined) or use aspect(undefined) to control the
       height and width. (at http://localhost:3005/node_modules/.vite/deps/recharts.js?v=c5d26789:9030:16)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/orders?select=total_amount%2Cstatus%2Ccreated_at&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&created_at=gte.2026-01-08T00%3A00%3A00.000Z&status=in.%28paid%2Ccompleted%29:0:0)
[ERROR] Error fetching insights data: {message: TypeError: Failed to fetch, details: TypeError: Failed to fetch
    at http://localhost…ocalhost:3005/components/SmartInsights.tsx:15:22), hint: , code: } (at http://localhost:3005/lib/insights.ts:9:12)
[ERROR] Error fetching insights data: {message: TypeError: Failed to fetch, details: TypeError: Failed to fetch
    at http://localhost…ocalhost:3005/components/SmartInsights.tsx:15:22), hint: , code: } (at http://localhost:3005/lib/insights.ts:9:12)
[ERROR] Failed to load insights {message: TypeError: Failed to fetch, details: TypeError: Failed to fetch
    at http://localhost…ocalhost:3005/components/SmartInsights.tsx:15:22), hint: , code: } (at http://localhost:3005/components/SmartInsights.tsx:17:16)
[ERROR] Failed to load insights {message: TypeError: Failed to fetch, details: TypeError: Failed to fetch
    at http://localhost…ocalhost:3005/components/SmartInsights.tsx:15:22), hint: , code: } (at http://localhost:3005/components/SmartInsights.tsx:17:16)
[WARNING] cdn.tailwindcss.com should not be used in production. To use Tailwind CSS in production, install it as a PostCSS plugin or use the Tailwind CLI: https://tailwindcss.com/docs/installation (at https://cdn.tailwindcss.com/?plugins=forms,container-queries:63:13404)
[WARNING] The width(-1) and height(-1) of chart should be greater than 0,
       please check the style of container, or the props width(100%) and height(100%),
       or add a minWidth(0) or minHeight(undefined) or use aspect(undefined) to control the
       height and width. (at http://localhost:3005/node_modules/.vite/deps/recharts.js?v=c5d26789:9030:16)
[WARNING] The width(-1) and height(-1) of chart should be greater than 0,
       please check the style of container, or the props width(100%) and height(100%),
       or add a minWidth(0) or minHeight(undefined) or use aspect(undefined) to control the
       height and width. (at http://localhost:3005/node_modules/.vite/deps/recharts.js?v=c5d26789:9030:16)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/orders?select=total_amount%2Cstatus%2Ccreated_at&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&created_at=gte.2026-01-08T00%3A00%3A00.000Z&status=in.%28paid%2Ccompleted%29:0:0)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/orders?select=total_amount%2Cstatus%2Ccreated_at&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&created_at=gte.2026-01-08T00%3A00%3A00.000Z&status=in.%28paid%2Ccompleted%29:0:0)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/inventory_items?select=name%2Cquantity%2Cmin_quantity&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&quantity=lt.10&limit=5:0:0)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/inventory_items?select=name%2Cquantity%2Cmin_quantity&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&quantity=lt.10&limit=5:0:0)
[WARNING] The width(-1) and height(-1) of chart should be greater than 0,
       please check the style of container, or the props width(100%) and height(100%),
       or add a minWidth(0) or minHeight(undefined) or use aspect(undefined) to control the
       height and width. (at http://localhost:3005/node_modules/.vite/deps/recharts.js?v=c5d26789:9030:16)
[WARNING] The width(-1) and height(-1) of chart should be greater than 0,
       please check the style of container, or the props width(100%) and height(100%),
       or add a minWidth(0) or minHeight(undefined) or use aspect(undefined) to control the
       height and width. (at http://localhost:3005/node_modules/.vite/deps/recharts.js?v=c5d26789:9030:16)
[WARNING] cdn.tailwindcss.com should not be used in production. To use Tailwind CSS in production, install it as a PostCSS plugin or use the Tailwind CLI: https://tailwindcss.com/docs/installation (at https://cdn.tailwindcss.com/?plugins=forms,container-queries:63:13404)
[WARNING] The width(-1) and height(-1) of chart should be greater than 0,
       please check the style of container, or the props width(100%) and height(100%),
       or add a minWidth(0) or minHeight(undefined) or use aspect(undefined) to control the
       height and width. (at http://localhost:3005/node_modules/.vite/deps/recharts.js?v=c5d26789:9030:16)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/5b9fdd5f-203f-482b-a59c-0e140b5c43b4/2b2208df-cb18-443b-88e2-faeba72cbfe1
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC016
- **Test Name:** Order Status Updates Reflect in Client and Staff UI
- **Test Code:** [TC016_Order_Status_Updates_Reflect_in_Client_and_Staff_UI.py](./TC016_Order_Status_Updates_Reflect_in_Client_and_Staff_UI.py)
- **Test Error:** Order creation failed due to UI or backend issue preventing order confirmation. Cannot proceed with testing order status propagation. Reporting issue and stopping.
Browser Console Logs:
[WARNING] cdn.tailwindcss.com should not be used in production. To use Tailwind CSS in production, install it as a PostCSS plugin or use the Tailwind CLI: https://tailwindcss.com/docs/installation (at https://cdn.tailwindcss.com/?plugins=forms,container-queries:63:13404)
[WARNING] cdn.tailwindcss.com should not be used in production. To use Tailwind CSS in production, install it as a PostCSS plugin or use the Tailwind CLI: https://tailwindcss.com/docs/installation (at https://cdn.tailwindcss.com/?plugins=forms,container-queries:63:13404)
[WARNING] The width(-1) and height(-1) of chart should be greater than 0,
       please check the style of container, or the props width(100%) and height(100%),
       or add a minWidth(0) or minHeight(undefined) or use aspect(undefined) to control the
       height and width. (at http://localhost:3005/node_modules/.vite/deps/recharts.js?v=c5d26789:9030:16)
[WARNING] The width(-1) and height(-1) of chart should be greater than 0,
       please check the style of container, or the props width(100%) and height(100%),
       or add a minWidth(0) or minHeight(undefined) or use aspect(undefined) to control the
       height and width. (at http://localhost:3005/node_modules/.vite/deps/recharts.js?v=c5d26789:9030:16)
[ERROR] Error fetching insights data: {message: TypeError: Failed to fetch, details: TypeError: Failed to fetch
    at http://localhost…ocalhost:3005/components/SmartInsights.tsx:15:22), hint: , code: } (at http://localhost:3005/lib/insights.ts:9:12)
[ERROR] Failed to load insights {message: TypeError: Failed to fetch, details: TypeError: Failed to fetch
    at http://localhost…ocalhost:3005/components/SmartInsights.tsx:15:22), hint: , code: } (at http://localhost:3005/components/SmartInsights.tsx:17:16)
[WARNING] cdn.tailwindcss.com should not be used in production. To use Tailwind CSS in production, install it as a PostCSS plugin or use the Tailwind CLI: https://tailwindcss.com/docs/installation (at https://cdn.tailwindcss.com/?plugins=forms,container-queries:63:13404)
[WARNING] The width(-1) and height(-1) of chart should be greater than 0,
       please check the style of container, or the props width(100%) and height(100%),
       or add a minWidth(0) or minHeight(undefined) or use aspect(undefined) to control the
       height and width. (at http://localhost:3005/node_modules/.vite/deps/recharts.js?v=c5d26789:9030:16)
[WARNING] The width(-1) and height(-1) of chart should be greater than 0,
       please check the style of container, or the props width(100%) and height(100%),
       or add a minWidth(0) or minHeight(undefined) or use aspect(undefined) to control the
       height and width. (at http://localhost:3005/node_modules/.vite/deps/recharts.js?v=c5d26789:9030:16)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/orders?select=total_amount%2Cstatus%2Ccreated_at&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&created_at=gte.2026-01-08T00%3A00%3A00.000Z&status=in.%28paid%2Ccompleted%29:0:0)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/orders?select=total_amount%2Cstatus%2Ccreated_at&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&created_at=gte.2026-01-08T00%3A00%3A00.000Z&status=in.%28paid%2Ccompleted%29:0:0)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/inventory_items?select=name%2Cquantity%2Cmin_quantity&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&quantity=lt.10&limit=5:0:0)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/inventory_items?select=name%2Cquantity%2Cmin_quantity&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&quantity=lt.10&limit=5:0:0)
[WARNING] cdn.tailwindcss.com should not be used in production. To use Tailwind CSS in production, install it as a PostCSS plugin or use the Tailwind CLI: https://tailwindcss.com/docs/installation (at https://cdn.tailwindcss.com/?plugins=forms,container-queries:63:13404)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/orders?select=total_amount%2Cstatus%2Ccreated_at&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&created_at=gte.2026-01-08T00%3A00%3A00.000Z&status=in.%28paid%2Ccompleted%29:0:0)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/orders?select=total_amount%2Cstatus%2Ccreated_at&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&created_at=gte.2026-01-08T00%3A00%3A00.000Z&status=in.%28paid%2Ccompleted%29:0:0)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/inventory_items?select=name%2Cquantity%2Cmin_quantity&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&quantity=lt.10&limit=5:0:0)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/inventory_items?select=name%2Cquantity%2Cmin_quantity&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&quantity=lt.10&limit=5:0:0)
[WARNING] cdn.tailwindcss.com should not be used in production. To use Tailwind CSS in production, install it as a PostCSS plugin or use the Tailwind CLI: https://tailwindcss.com/docs/installation (at https://cdn.tailwindcss.com/?plugins=forms,container-queries:63:13404)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/orders?select=total_amount%2Cstatus%2Ccreated_at&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&created_at=gte.2026-01-08T00%3A00%3A00.000Z&status=in.%28paid%2Ccompleted%29:0:0)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/5b9fdd5f-203f-482b-a59c-0e140b5c43b4/6bf4a704-989b-4f95-a059-ccb898c09d6c
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC017
- **Test Name:** QR Code Order Linking and Scanning
- **Test Code:** [TC017_QR_Code_Order_Linking_and_Scanning.py](./TC017_QR_Code_Order_Linking_and_Scanning.py)
- **Test Error:** QR code generation option is missing or inaccessible for the selected table M-2. Cannot proceed with scanning and order linking tests. Task stopped.
Browser Console Logs:
[WARNING] cdn.tailwindcss.com should not be used in production. To use Tailwind CSS in production, install it as a PostCSS plugin or use the Tailwind CLI: https://tailwindcss.com/docs/installation (at https://cdn.tailwindcss.com/?plugins=forms,container-queries:63:13404)
[WARNING] cdn.tailwindcss.com should not be used in production. To use Tailwind CSS in production, install it as a PostCSS plugin or use the Tailwind CLI: https://tailwindcss.com/docs/installation (at https://cdn.tailwindcss.com/?plugins=forms,container-queries:63:13404)
[WARNING] The width(-1) and height(-1) of chart should be greater than 0,
       please check the style of container, or the props width(100%) and height(100%),
       or add a minWidth(0) or minHeight(undefined) or use aspect(undefined) to control the
       height and width. (at http://localhost:3005/node_modules/.vite/deps/recharts.js?v=c5d26789:9030:16)
[WARNING] The width(-1) and height(-1) of chart should be greater than 0,
       please check the style of container, or the props width(100%) and height(100%),
       or add a minWidth(0) or minHeight(undefined) or use aspect(undefined) to control the
       height and width. (at http://localhost:3005/node_modules/.vite/deps/recharts.js?v=c5d26789:9030:16)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/orders?select=total_amount%2Cstatus%2Ccreated_at&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&created_at=gte.2026-01-08T00%3A00%3A00.000Z&status=in.%28paid%2Ccompleted%29:0:0)
[ERROR] Error fetching insights data: {message: TypeError: Failed to fetch, details: TypeError: Failed to fetch
    at http://localhost…ocalhost:3005/components/SmartInsights.tsx:15:22), hint: , code: } (at http://localhost:3005/lib/insights.ts:9:12)
[ERROR] Error fetching insights data: {message: TypeError: Failed to fetch, details: TypeError: Failed to fetch
    at http://localhost…ocalhost:3005/components/SmartInsights.tsx:15:22), hint: , code: } (at http://localhost:3005/lib/insights.ts:9:12)
[ERROR] Failed to load insights {message: TypeError: Failed to fetch, details: TypeError: Failed to fetch
    at http://localhost…ocalhost:3005/components/SmartInsights.tsx:15:22), hint: , code: } (at http://localhost:3005/components/SmartInsights.tsx:17:16)
[ERROR] Failed to load insights {message: TypeError: Failed to fetch, details: TypeError: Failed to fetch
    at http://localhost…ocalhost:3005/components/SmartInsights.tsx:15:22), hint: , code: } (at http://localhost:3005/components/SmartInsights.tsx:17:16)
[WARNING] cdn.tailwindcss.com should not be used in production. To use Tailwind CSS in production, install it as a PostCSS plugin or use the Tailwind CLI: https://tailwindcss.com/docs/installation (at https://cdn.tailwindcss.com/?plugins=forms,container-queries:63:13404)
[WARNING] The width(-1) and height(-1) of chart should be greater than 0,
       please check the style of container, or the props width(100%) and height(100%),
       or add a minWidth(0) or minHeight(undefined) or use aspect(undefined) to control the
       height and width. (at http://localhost:3005/node_modules/.vite/deps/recharts.js?v=c5d26789:9030:16)
[WARNING] The width(-1) and height(-1) of chart should be greater than 0,
       please check the style of container, or the props width(100%) and height(100%),
       or add a minWidth(0) or minHeight(undefined) or use aspect(undefined) to control the
       height and width. (at http://localhost:3005/node_modules/.vite/deps/recharts.js?v=c5d26789:9030:16)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/orders?select=total_amount%2Cstatus%2Ccreated_at&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&created_at=gte.2026-01-08T00%3A00%3A00.000Z&status=in.%28paid%2Ccompleted%29:0:0)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/orders?select=total_amount%2Cstatus%2Ccreated_at&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&created_at=gte.2026-01-08T00%3A00%3A00.000Z&status=in.%28paid%2Ccompleted%29:0:0)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/inventory_items?select=name%2Cquantity%2Cmin_quantity&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&quantity=lt.10&limit=5:0:0)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/inventory_items?select=name%2Cquantity%2Cmin_quantity&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&quantity=lt.10&limit=5:0:0)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/orders?select=id%2Ctable_number%2Ctotal_amount%2Cstatus%2Ccreated_at%2Cclients%28name%29&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&status=in.%28pending%2Cpreparing%2Cin_progress%2Cready%29&order=created_at.desc&limit=50:0:0)
[ERROR] Error fetching live orders: {code: 22P02, details: null, hint: null, message: invalid input value for enum order_status_enum: "in_progress"} (at http://localhost:3005/components/venue-control/components/LiveActivityPanel.tsx:41:14)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/orders?select=id%2Ctable_number%2Ctotal_amount%2Cstatus%2Ccreated_at%2Cclients%28name%29&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&status=in.%28pending%2Cpreparing%2Cin_progress%2Cready%29&order=created_at.desc&limit=50:0:0)
[ERROR] Error fetching live orders: {code: 22P02, details: null, hint: null, message: invalid input value for enum order_status_enum: "in_progress"} (at http://localhost:3005/components/venue-control/components/LiveActivityPanel.tsx:41:14)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/5b9fdd5f-203f-482b-a59c-0e140b5c43b4/759097d4-acee-41c8-9417-c7893674302c
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC018
- **Test Name:** Store Settings Update Persistence
- **Test Code:** [TC018_Store_Settings_Update_Persistence.py](./TC018_Store_Settings_Update_Persistence.py)
- **Test Error:** The task to verify updates to store business details, payment settings, and multi-location configurations has been mostly completed. Business details were successfully updated and saved, and payment settings were accessed. However, attempts to add a new location in multi-location configurations were unsuccessful due to UI interaction limitations. The business details changes persist after reload as verified. Task is marked as complete but with partial success due to incomplete multi-location configuration update.
Browser Console Logs:
[WARNING] cdn.tailwindcss.com should not be used in production. To use Tailwind CSS in production, install it as a PostCSS plugin or use the Tailwind CLI: https://tailwindcss.com/docs/installation (at https://cdn.tailwindcss.com/?plugins=forms,container-queries:63:13404)
[WARNING] cdn.tailwindcss.com should not be used in production. To use Tailwind CSS in production, install it as a PostCSS plugin or use the Tailwind CLI: https://tailwindcss.com/docs/installation (at https://cdn.tailwindcss.com/?plugins=forms,container-queries:63:13404)
[WARNING] The width(-1) and height(-1) of chart should be greater than 0,
       please check the style of container, or the props width(100%) and height(100%),
       or add a minWidth(0) or minHeight(undefined) or use aspect(undefined) to control the
       height and width. (at http://localhost:3005/node_modules/.vite/deps/recharts.js?v=c5d26789:9030:16)
[WARNING] The width(-1) and height(-1) of chart should be greater than 0,
       please check the style of container, or the props width(100%) and height(100%),
       or add a minWidth(0) or minHeight(undefined) or use aspect(undefined) to control the
       height and width. (at http://localhost:3005/node_modules/.vite/deps/recharts.js?v=c5d26789:9030:16)
[WARNING] cdn.tailwindcss.com should not be used in production. To use Tailwind CSS in production, install it as a PostCSS plugin or use the Tailwind CLI: https://tailwindcss.com/docs/installation (at https://cdn.tailwindcss.com/?plugins=forms,container-queries:63:13404)
[WARNING] The width(-1) and height(-1) of chart should be greater than 0,
       please check the style of container, or the props width(100%) and height(100%),
       or add a minWidth(0) or minHeight(undefined) or use aspect(undefined) to control the
       height and width. (at http://localhost:3005/node_modules/.vite/deps/recharts.js?v=c5d26789:9030:16)
[WARNING] The width(-1) and height(-1) of chart should be greater than 0,
       please check the style of container, or the props width(100%) and height(100%),
       or add a minWidth(0) or minHeight(undefined) or use aspect(undefined) to control the
       height and width. (at http://localhost:3005/node_modules/.vite/deps/recharts.js?v=c5d26789:9030:16)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/orders?select=total_amount%2Cstatus%2Ccreated_at&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&created_at=gte.2026-01-08T00%3A00%3A00.000Z&status=in.%28paid%2Ccompleted%29:0:0)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/orders?select=total_amount%2Cstatus%2Ccreated_at&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&created_at=gte.2026-01-08T00%3A00%3A00.000Z&status=in.%28paid%2Ccompleted%29:0:0)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/inventory_items?select=name%2Cquantity%2Cmin_quantity&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&quantity=lt.10&limit=5:0:0)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/inventory_items?select=name%2Cquantity%2Cmin_quantity&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&quantity=lt.10&limit=5:0:0)
[WARNING] cdn.tailwindcss.com should not be used in production. To use Tailwind CSS in production, install it as a PostCSS plugin or use the Tailwind CLI: https://tailwindcss.com/docs/installation (at https://cdn.tailwindcss.com/?plugins=forms,container-queries:63:13404)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/orders?select=total_amount%2Cstatus%2Ccreated_at&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&created_at=gte.2026-01-08T00%3A00%3A00.000Z&status=in.%28paid%2Ccompleted%29:0:0)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/orders?select=total_amount%2Cstatus%2Ccreated_at&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&created_at=gte.2026-01-08T00%3A00%3A00.000Z&status=in.%28paid%2Ccompleted%29:0:0)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/inventory_items?select=name%2Cquantity%2Cmin_quantity&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&quantity=lt.10&limit=5:0:0)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/inventory_items?select=name%2Cquantity%2Cmin_quantity&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&quantity=lt.10&limit=5:0:0)
[WARNING] cdn.tailwindcss.com should not be used in production. To use Tailwind CSS in production, install it as a PostCSS plugin or use the Tailwind CLI: https://tailwindcss.com/docs/installation (at https://cdn.tailwindcss.com/?plugins=forms,container-queries:63:13404)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/orders?select=total_amount%2Cstatus%2Ccreated_at&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&created_at=gte.2026-01-08T00%3A00%3A00.000Z&status=in.%28paid%2Ccompleted%29:0:0)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/orders?select=total_amount%2Cstatus%2Ccreated_at&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&created_at=gte.2026-01-08T00%3A00%3A00.000Z&status=in.%28paid%2Ccompleted%29:0:0)
[ERROR] Failed to load resource: the server responded with a status of 400 () (at https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/inventory_items?select=name%2Cquantity%2Cmin_quantity&store_id=eq.f5e3bfcf-3ccc-4464-9eb5-431fa6e26533&quantity=lt.10&limit=5:0:0)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/5b9fdd5f-203f-482b-a59c-0e140b5c43b4/8c923423-9926-459c-bb4e-587a65202872
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---


## 3️⃣ Coverage & Matching Metrics

- **5.56** of tests passed

| Requirement        | Total Tests | ✅ Passed | ❌ Failed  |
|--------------------|-------------|-----------|------------|
| ...                | ...         | ...       | ...        |
---


## 4️⃣ Key Gaps / Risks
{AI_GNERATED_KET_GAPS_AND_RISKS}
---