import { readProducts, appendOrder, readConfig, readCategories, updateConfig } from './sheets-client.js';
import { ORDER_RULES, isValidEmail } from './utils.js';

// Version: Stock numeric display fix - 2026-02-14

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;

        try {
            // API ROUTES
            if (path === '/api/products') {
                return await handleGetProducts(request, env, url);
            }
            if (path === '/api/categories') {
                return await handleGetCategories(env);
            }
            if (path === '/api/config') {
                if (request.method === 'GET') {
                    return await handleGetConfig(env);
                } else if (request.method === 'PUT') {
                    return await handleUpdateConfig(request, env);
                }
            }
            if (path === '/api/orders' && request.method === 'POST') {
                return await handleSaveOrder(request, env);
            }



            // FRONTEND (Static Assets + HTMLRewriter)
            const categoryParam = url.searchParams.get('category');

            // Root path without category -> show categories page
            if (path === '/' && !categoryParam) {
                const categoriesUrl = new URL('/categories.html', request.url);
                return await env.ASSETS.fetch(new Request(categoriesUrl, request));
            }

            // Root path with category -> redirect to /catalog?category=XXX
            if (path === '/' && categoryParam) {
                const redirectUrl = new URL('/catalog', request.url);
                redirectUrl.searchParams.set('category', categoryParam);
                return Response.redirect(redirectUrl.toString(), 302);
            }

            // Catalog path - serve catalog.html (category is in URL params)
            if (path === '/catalog' || path === '/catalog.html') {
                const catalogUrl = new URL('/catalog.html', request.url);
                return await env.ASSETS.fetch(new Request(catalogUrl, request));
            }

            // Serve static assets from the binding for other paths
            return await env.ASSETS.fetch(request);

        } catch (e) {
            return new Response(JSON.stringify({ error: e.message }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }
};

/**
 * GET /api/products
 * Query: page, pageSize, search
 */
async function handleGetProducts(request, env, url) {
    const params = url.searchParams;
    const page = Number(params.get('page') || 1);
    const pageSize = Number(params.get('pageSize') || 24);
    const search = (params.get('search') || '').toLowerCase().trim();
    const category = params.get('category') || env.DEFAULT_CATEGORY || 'LIBRERIA';

    // Parallel fetch: Products + Config
    const [products, configData] = await Promise.all([
        readProducts(env, category),
        readConfig(env)
    ]);

    // Merge Config: Start with defaults, then global config, then category-specific overrides
    let config = { ...ORDER_RULES };

    if (configData) {
        // Apply global config
        config = { ...config, ...configData.global };

        // Apply category-specific overrides if they exist
        if (configData.categories && configData.categories[category]) {
            config = { ...config, ...configData.categories[category] };
        }
    }

    let filteredProducts = products;

    // Filter by Search (Local filter after fetching all products from sheet)
    if (search) {
        filteredProducts = products.filter(p =>
            (p.name || '').toLowerCase().includes(search) ||
            (p.code || '').toLowerCase().includes(search)
        );
    }

    // Pagination
    const total = filteredProducts.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(Math.max(1, page), totalPages);
    const start = (safePage - 1) * pageSize;
    const end = start + pageSize;

    return new Response(JSON.stringify({
        items: filteredProducts.slice(start, end),
        page: safePage,
        pageSize,
        total,
        totalPages,
        category,
        config
    }), {
        headers: { 'Content-Type': 'application/json' }
    });
}

/**
 * POST /api/orders
 * Body: { client, items }
 */
async function handleSaveOrder(request, env) {
    const order = await request.json();

    if (!order || !order.client || !order.items || !order.items.length) {
        return new Response(JSON.stringify({ error: 'Pedido vacío o datos incompletos' }), { status: 400 });
    }

    if (!order.client.name || !order.client.phone || !order.client.email) {
        return new Response(JSON.stringify({ error: 'Faltan datos del cliente' }), { status: 400 });
    }

    // Re-calculate totals server-side for security using Dynamic Config
    const sheetConfig = await readConfig(env);
    const rules = { ...ORDER_RULES, ...sheetConfig };

    const rawTotal = order.items.reduce((s, it) => s + (Number(it.price) * Number(it.qty)), 0);

    if (rawTotal < rules.MIN_TOTAL) {
        return new Response(JSON.stringify({
            error: `Compra mínima no alcanzada. Mínimo: $${rules.MIN_TOTAL}`
        }), { status: 400 });
    }

    const discount = (rawTotal >= rules.DISCOUNT_THRESHOLD)
        ? (rawTotal * rules.DISCOUNT_RATE)
        : 0;

    const finalTotal = rawTotal - discount;

    // Enhance order object with server-calculated totals
    const orderPayload = {
        ...order,
        total: finalTotal
    };

    const currentCategory = env.DEFAULT_CATEGORY || 'LIBRERIA';

    // Append to Sheets
    await appendOrder(env, orderPayload, currentCategory);

    return new Response(JSON.stringify({
        ok: true,
        rawTotal,
        discount,
        total: finalTotal,
        items: order.items.length
    }), {
        headers: { 'Content-Type': 'application/json' }
    });
}


async function handleGetCategories(env) {
    const categories = await readCategories(env);
    return new Response(JSON.stringify({ categories }), {
        headers: { 'Content-Type': 'application/json' }
    });
}

async function handleGetConfig(env) {
    const configData = await readConfig(env);
    return new Response(JSON.stringify(configData || { global: {}, categories: {} }), {
        headers: { 'Content-Type': 'application/json' }
    });
}

async function handleUpdateConfig(request, env) {
    try {
        const configData = await request.json();

        // Validate structure
        if (!configData || typeof configData !== 'object') {
            return new Response(JSON.stringify({ error: 'Invalid config data' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Update the Config sheet
        await updateConfig(env, configData);

        return new Response(JSON.stringify({ ok: true, message: 'Configuration updated successfully' }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
