/**
 * Food Order Bridge - Menu Catalog, Sticky Scrollspy, Discount Badges & Stock Management
 */
import { API } from '../common/api.js';
import { formatVND, buildAltText, showToast, escapeHTML } from '../common/utils.js';
import { renderSkeletonGrid, renderInlineError, renderEmptyState, FALLBACK_FOOD_IMAGE } from '../common/ui-state.js';
import { cart } from './cart.js';
import { openQuickView } from './quick-view-drawer.js';

let menuItems = [];
let categoriesList = [];
let activeScrollspyObserver = null;

function calculateSalePriceClient(price, discountPercent = 0) {
  const numPrice = Number(price) || 0;
  const numDiscount = Math.max(0, Math.min(100, Number(discountPercent) || 0));
  return Math.round(numPrice * (100 - numDiscount) / 100);
}

export async function loadStoreInfo() {
  try {
    const res = await API.get('/api/store/info');
    if (res && res.displayName) {
      const brandElem = document.getElementById('brand-shop-name');
      if (brandElem) {
        brandElem.textContent = `🍲 ${res.displayName}`;
      }
      document.title = `${res.displayName} - Đặt đồ ăn nhanh`;
    }
  } catch (err) {
    console.error('Error loading store info:', err);
  }
}

export async function loadMenuCatalog() {
  const catalogContainer = document.getElementById('catalog-container');
  if (!catalogContainer) return;

  catalogContainer.setAttribute('aria-busy', 'true');
  renderSkeletonGrid(catalogContainer, 6);

  try {
    loadStoreInfo();
    const [menuRes, catRes] = await Promise.all([
      API.get('/api/menu'),
      API.get('/api/categories')
    ]);

    const rawCategories = catRes.categories || [];
    categoriesList = rawCategories.filter(c => c.active !== false);

    const rawItems = menuRes.items || [];
    menuItems = rawItems.filter(item => {
      if (item.deletedAt != null) return false;

      if (item.categoryId) {
        const upperId = String(item.categoryId).trim().toUpperCase();
        const cat = categoriesList.find(c => String(c.id).trim().toUpperCase() === upperId || c.name === item.category);
        return Boolean(cat);
      } else if (item.category) {
        const cat = categoriesList.find(c => c.name === item.category);
        return cat ? cat.active !== false : true;
      }
      return true;
    });

    cart.reconcileWithMenu(menuItems);

    catalogContainer.removeAttribute('aria-busy');
    renderCategories();
    renderGrid(menuItems);
    setupSearchFilter();

    cart.subscribe(() => {
      menuItems.forEach(item => {
        const actionBox = document.getElementById(`action-box-${item.id}`);
        if (actionBox) {
          const qty = cart.getItemQuantity(item.id);
          actionBox.innerHTML = renderActionBtn(item, qty);
        }
      });
    });

  } catch (error) {
    catalogContainer.removeAttribute('aria-busy');
    showToast('Không thể tải menu. Vui lòng thử lại sau.', 'error');
    renderInlineError(
      catalogContainer,
      'Không thể tải dữ liệu thực đơn. Vui lòng kiểm tra kết nối mạng và thử lại.',
      loadMenuCatalog
    );
  }
}

function getActiveCategoriesWithItems(items) {
  const catMap = new Map();

  categoriesList.forEach(cat => {
    catMap.set(cat.id, { ...cat, items: [] });
  });

  const uncategorizedItems = [];

  items.forEach(item => {
    let catObj = null;
    if (item.categoryId) {
      const upperId = String(item.categoryId).trim().toUpperCase();
      catObj = Array.from(catMap.values()).find(c => String(c.id).trim().toUpperCase() === upperId || c.name === item.category);
    } else if (item.category) {
      catObj = Array.from(catMap.values()).find(c => c.name === item.category);
    }

    if (catObj) {
      catObj.items.push(item);
    } else {
      uncategorizedItems.push(item);
    }
  });

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
    const searchInput = document.getElementById('search-food-input');
    const query = searchInput ? searchInput.value.trim() : '';

    if (query) {
      renderEmptyState(catalogContainer, {
        icon: '🔍',
        title: 'Không tìm thấy món ăn',
        description: `Không có món nào phù hợp với từ khóa "${escapeHTML(query)}"`,
        actionText: '❌ Xóa tìm kiếm',
        onAction: () => {
          if (searchInput) searchInput.value = '';
          renderGrid(menuItems);
        }
      });
    } else {
      renderEmptyState(catalogContainer, {
        icon: '🍲',
        title: 'Chưa có món ăn',
        description: 'Hiện chưa có món ăn nào trong danh mục này.'
      });
    }

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

  const price = Number(item.price) || 0;
  const discountPercent = item.discountPercent || 0;
  const salePrice = item.salePrice !== undefined ? item.salePrice : calculateSalePriceClient(price, discountPercent);
  const hasDiscount = discountPercent > 0 && price > salePrice;
  const savings = price - salePrice;

  const stock = item.stockQuantity ?? 0;
  const isLocked = item.active === false;
  const isOutOfStock = stock <= 0 && !isLocked;

  let stockText = '';
  let stockStyle = '';
  if (isLocked) {
    stockText = 'Tạm ngưng bán';
    stockStyle = 'color: #64748b; font-weight: 700;';
  } else if (isOutOfStock) {
    stockText = 'Hết hàng';
    stockStyle = 'color: #ef4444; font-weight: 700;';
  } else if (stock <= 3) {
    stockText = `Chỉ còn ${stock} phần`;
    stockStyle = 'color: #f59e0b; font-weight: 600;';
  } else {
    stockText = `Còn ${stock} phần`;
    stockStyle = 'color: var(--color-text-muted); font-size: 11px;';
  }

  const activeOpts = Array.isArray(item.customizationOptions) ? item.customizationOptions.filter(o => o.active !== false) : [];
  let customHintHtml = '';
  if (activeOpts.length > 0) {
    const names = activeOpts.slice(0, 3).map(o => escapeHTML(o.name));
    const extraCount = activeOpts.length - names.length;
    const label = `Tùy chọn: ${names.join(', ')}${extraCount > 0 ? ` +${extraCount}` : ''}`;
    const clickHandler = isLocked ? '' : `onclick="window.triggerQuickView('${escapeHTML(item.id)}')"` ;
    customHintHtml = `
      <div class="custom-options-hint" ${clickHandler} title="${isLocked ? 'Món hiện đang tạm ngưng bán' : 'Bấm để chọn thành phần'}">
        <span class="custom-hint-badge">⚙️ ${label}</span>
      </div>
    `;
  }

  const imageUrl = item.image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&auto=format&fit=crop&q=80';
  const imgClickHandler = isLocked ? '' : `onclick="window.triggerQuickView('${escapeHTML(item.id)}')"` ;

  return `
    <article class="food-card ${isLocked ? 'is-locked out-of-stock' : (isOutOfStock ? 'out-of-stock' : '')}" data-item-id="${escapeHTML(item.id)}" ${isLocked ? 'aria-disabled="true" title="Món hiện đang tạm ngưng bán"' : ''}>
      <div class="food-card-img-wrapper" ${imgClickHandler}>
        <img src="${imageUrl}" 
             alt="${altText}" 
             class="food-card-img" 
             loading="lazy" 
             style="${isLocked ? 'filter: grayscale(80%) opacity(0.6);' : ''}"
             onerror="this.onerror=null;this.src='${FALLBACK_FOOD_IMAGE}';" />
        
        <div class="food-card-badges">
          ${hasDiscount ? `<span class="badge badge-discount">-${discountPercent}%</span>` : ''}
          ${item.isBestseller ? `<span class="badge badge-bestseller">Bán chạy</span>` : ''}
          ${item.isSpicy ? `<span class="badge badge-spicy">🌶 Spicy</span>` : ''}
          ${isLocked ? `<span class="badge badge-locked" style="background:#475569; color:#fff;">Tạm ngưng</span>` : ''}
        </div>

        ${isLocked ? `<div class="out-of-stock-overlay locked-overlay" style="background: rgba(15, 23, 42, 0.65);"><span style="color:#f8fafc; font-weight:700;">Tạm ngưng bán</span></div>` : (isOutOfStock ? `<div class="out-of-stock-overlay"><span>Hết hàng</span></div>` : '')}
      </div>

      <div class="food-card-body">
        <h3 class="food-card-title line-clamp-1" ${imgClickHandler}>${safeName}</h3>
        <p class="food-card-desc line-clamp-2">${safeDesc}</p>
        
        ${customHintHtml}

        <div style="font-size: 11px; margin-top: 4px; margin-bottom: 4px; ${stockStyle}">
          ${stockText}
        </div>

        <div class="food-card-footer">
          <div class="price-box">
            ${hasDiscount ? `
              <div class="price-sale-container">
                <span class="price-current">${formatVND(salePrice)}</span>
                <span class="price-original">${formatVND(price)}</span>
              </div>
              <div class="price-savings">Tiết kiệm ${formatVND(savings)}</div>
            ` : `
              <span class="price-current">${formatVND(price)}</span>
            `}
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
  const safeName = escapeHTML(item.name);
  const stock = item.stockQuantity ?? 0;
  const isLocked = item.active === false;

  if (isLocked) {
    return `
      <button class="btn-quick-add disabled" disabled aria-disabled="true" title="Món hiện đang tạm ngưng bán">
        +
      </button>
    `;
  }

  if (stock <= 0) {
    return `
      <button class="btn-quick-add disabled" disabled aria-disabled="true" title="Món hiện đã hết hàng">
        +
      </button>
    `;
  }

  if (qty > 0) {
    const isAtMaxStock = qty >= stock;
    return `
      <div class="stepper">
        <button class="stepper-btn" onclick="window.handleCartChange('${safeId}', -1)" aria-label="Giảm số lượng">-</button>
        <span class="stepper-val">${qty}</span>
        <button class="stepper-btn ${isAtMaxStock ? 'disabled' : ''}" 
                onclick="window.handleCartChange('${safeId}', 1)" 
                ${isAtMaxStock ? 'disabled' : ''} 
                aria-label="Tăng số lượng">+</button>
      </div>
    `;
  }

  return `
    <button class="btn-quick-add" onclick="window.handleCartChange('${safeId}', 1)" aria-label="Thêm món ${safeName}" title="Thêm ${safeName} vào giỏ hàng">
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
