/**
 * Food Order Bridge - Menu Catalog, Sticky Scrollspy & Category Tabs
 */
import { API } from '../common/api.js';
import { formatVND, buildAltText, showToast, escapeHTML } from '../common/utils.js';
import { cart } from './cart.js';
import { openQuickView } from './quick-view-drawer.js';

let menuItems = [];
let categoriesList = [];
let activeScrollspyObserver = null;

export async function loadMenuCatalog() {
  const catalogContainer = document.getElementById('catalog-container');
  if (!catalogContainer) return;

  // Render Skeleton Screens during initial fetch
  renderSkeleton(catalogContainer);

  try {
    const [menuRes, catRes] = await Promise.all([
      API.get('/api/menu'),
      API.get('/api/categories')
    ]);

    const rawCategories = catRes.categories || [];
    categoriesList = rawCategories.filter(c => c.active !== false);

    const rawItems = menuRes.items || [];
    // Only active items whose category is active (or legacy fallback)
    menuItems = rawItems.filter(item => {
      if (item.active === false) return false;

      if (item.categoryId) {
        const cat = categoriesList.find(c => c.id === item.categoryId);
        return Boolean(cat);
      } else if (item.category) {
        const cat = categoriesList.find(c => c.name === item.category);
        // If legacy item category name is found in active categories or default fallback
        return cat ? cat.active !== false : true;
      }
      return true;
    });

    renderCategories();
    renderGrid(menuItems);
    setupSearchFilter();
  } catch (error) {
    showToast('Không thể tải menu. Vui lòng thử lại sau.', 'error');
    catalogContainer.innerHTML = `<p style="text-align: center; color: var(--color-accent-spicy); padding: var(--space-8);">Lỗi tải dữ liệu thực đơn.</p>`;
  }
}

function renderSkeleton(container) {
  let skeletonsHtml = `<div class="food-grid">`;
  for (let i = 0; i < 6; i++) {
    skeletonsHtml += `
      <div class="skeleton-card">
        <div class="skeleton skeleton-img"></div>
        <div class="skeleton skeleton-title"></div>
        <div class="skeleton skeleton-text"></div>
        <div class="skeleton skeleton-price"></div>
      </div>
    `;
  }
  skeletonsHtml += `</div>`;
  container.innerHTML = skeletonsHtml;
}

function getActiveCategoriesWithItems(items) {
  // Determine which categories have active items
  const catMap = new Map();

  categoriesList.forEach(cat => {
    catMap.set(cat.id, { ...cat, items: [] });
  });

  const uncategorizedItems = [];

  items.forEach(item => {
    let catObj = null;
    if (item.categoryId && catMap.has(item.categoryId)) {
      catObj = catMap.get(item.categoryId);
    } else if (item.category) {
      catObj = Array.from(catMap.values()).find(c => c.name === item.category);
    }

    if (catObj) {
      catObj.items.push(item);
    } else {
      uncategorizedItems.push(item);
    }
  });

  // Filter out categories with 0 items
  const result = Array.from(catMap.values()).filter(c => c.items.length > 0);

  if (uncategorizedItems.length > 0) {
    result.push({
      id: 'OTHER',
      name: 'Món khác',
      slug: 'mon-khac',
      sortOrder: 999,
      active: true,
      items: uncategorizedItems
    });
  }

  return result.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

function renderCategories() {
  const categoryNav = document.getElementById('category-nav');
  if (!categoryNav) return;

  const validCategories = getActiveCategoriesWithItems(menuItems);

  categoryNav.innerHTML = `
    <button class="category-tab active" data-category-id="ALL">Tất cả</button>
    ${validCategories.map(cat => `
      <button class="category-tab" data-category-id="${escapeHTML(cat.id)}" data-category-slug="${escapeHTML(cat.slug)}">
        ${escapeHTML(cat.name)}
      </button>
    `).join('')}
  `;

  categoryNav.querySelectorAll('.category-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const catId = tab.dataset.categoryId;
      categoryNav.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      if (catId === 'ALL') {
        renderGrid(menuItems);
      } else {
        const cat = validCategories.find(c => c.id === catId);
        renderGrid(cat ? cat.items : []);
      }
    });
  });
}

function renderGrid(items) {
  const catalogContainer = document.getElementById('catalog-container');
  if (!catalogContainer) return;

  if (items.length === 0) {
    catalogContainer.innerHTML = `<div style="text-align: center; padding: var(--space-8); color: var(--color-text-muted);">Không tìm thấy món ăn phù hợp.</div>`;
    if (activeScrollspyObserver) {
      activeScrollspyObserver.disconnect();
      activeScrollspyObserver = null;
    }
    return;
  }

  const activeCategories = getActiveCategoriesWithItems(items);

  let html = '';
  activeCategories.forEach(cat => {
    const sectionDomId = `cat-${cat.slug || cat.id.toLowerCase()}`;
    html += `
      <section class="category-section" id="${sectionDomId}" data-section-category-id="${escapeHTML(cat.id)}">
        <h2 class="section-title">
          <span>${escapeHTML(cat.name)}</span>
          <span style="font-size: var(--font-size-xs); font-weight: 500; color: var(--color-text-muted);">(${cat.items.length} món)</span>
        </h2>
        <div class="food-grid">
          ${cat.items.map(item => createCardHtml(item)).join('')}
        </div>
      </section>
    `;
  });

  catalogContainer.innerHTML = html;

  bindCardEvents();
  setupScrollspy();
}

function createCardHtml(item) {
  const qty = cart.getItemQuantity(item.id);
  const safeName = escapeHTML(item.name);
  const safeCategory = escapeHTML(item.category);
  const safeDesc = escapeHTML(item.description || '');
  const altText = buildAltText(safeName, safeCategory);

  return `
    <article class="food-card" data-item-id="${escapeHTML(item.id)}">
      <div class="food-card-img-wrapper" onclick="window.triggerQuickView('${escapeHTML(item.id)}')">
        <img src="${item.image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&auto=format&fit=crop&q=80'}" 
             alt="${altText}" 
             class="food-card-img" 
             loading="lazy" />
        <div class="food-card-badges">
          ${item.isBestseller ? `<span class="badge badge-bestseller">Bán chạy</span>` : ''}
          ${item.isSpicy ? `<span class="badge badge-spicy">🌶 Spicy</span>` : ''}
        </div>
      </div>
      <div class="food-card-body">
        <h3 class="food-card-title line-clamp-1" onclick="window.triggerQuickView('${escapeHTML(item.id)}')">${safeName}</h3>
        <p class="food-card-desc line-clamp-2">${safeDesc}</p>
        <div class="food-card-footer">
          <div class="price-box">
            <span class="price-current">${formatVND(item.price)}</span>
            ${item.originalPrice ? `<span class="price-original">${formatVND(item.originalPrice)}</span>` : ''}
          </div>
          <div class="action-box" id="action-box-${escapeHTML(item.id)}">
            ${renderActionBtn(item, qty)}
          </div>
        </div>
      </div>
    </article>
  `;
}

function renderActionBtn(item, qty) {
  const safeId = escapeHTML(item.id);
  if (qty > 0) {
    return `
      <div class="stepper">
        <button class="stepper-btn" onclick="window.handleCartChange('${safeId}', -1)" aria-label="Giảm số lượng">-</button>
        <span class="stepper-val">${qty}</span>
        <button class="stepper-btn" onclick="window.handleCartChange('${safeId}', 1)" aria-label="Tăng số lượng">+</button>
      </div>
    `;
  }
  return `
    <button class="btn-quick-add" onclick="window.handleCartChange('${safeId}', 1)" aria-label="Thêm món ${escapeHTML(item.name)}">
      +
    </button>
  `;
}

function bindCardEvents() {
  window.triggerQuickView = (itemId) => {
    const item = menuItems.find(i => i.id === itemId);
    if (item) openQuickView(item);
  };

  window.handleCartChange = (itemId, delta) => {
    const item = menuItems.find(i => i.id === itemId);
    if (!item) return;

    cart.addItem(item, delta);
    const newQty = cart.getItemQuantity(itemId);
    
    const actionBox = document.getElementById(`action-box-${itemId}`);
    if (actionBox) {
      actionBox.innerHTML = renderActionBtn(item, newQty);
    }
  };
}

function setupScrollspy() {
  if (activeScrollspyObserver) {
    activeScrollspyObserver.disconnect();
    activeScrollspyObserver = null;
  }

  const sections = document.querySelectorAll('.category-section');
  const navTabs = document.querySelectorAll('.category-tab');

  if (!('IntersectionObserver' in window) || sections.length === 0) return;

  activeScrollspyObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const categoryId = entry.target.dataset.sectionCategoryId;
        navTabs.forEach(tab => {
          if (tab.dataset.categoryId === categoryId) {
            tab.classList.add('active');
            tab.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
          } else {
            tab.classList.remove('active');
          }
        });
      }
    });
  }, { rootMargin: '-130px 0px -60% 0px', threshold: 0 });

  sections.forEach(sec => activeScrollspyObserver.observe(sec));
}

function setupSearchFilter() {
  const searchInput = document.getElementById('search-food-input');
  if (!searchInput) return;

  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.trim().toLowerCase();
    if (!query) {
      renderGrid(menuItems);
      return;
    }

    const filtered = menuItems.filter(item => 
      item.name.toLowerCase().includes(query) || 
      (item.description && item.description.toLowerCase().includes(query))
    );
    renderGrid(filtered);
  });
}
