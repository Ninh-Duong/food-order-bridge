/**
 * Food Order Bridge - Menu Catalog, Sticky Scrollspy & Category Tabs
 */
import { API } from '../common/api.js';
import { formatVND, buildAltText, showToast } from '../common/utils.js';
import { cart } from './cart.js';
import { openQuickView } from './quick-view-drawer.js';

let menuItems = [];

export async function loadMenuCatalog() {
  const catalogContainer = document.getElementById('catalog-container');
  const categoryNav = document.getElementById('category-nav');

  if (!catalogContainer) return;

  // Render Skeleton Screens during initial fetch
  renderSkeleton(catalogContainer);

  try {
    const data = await API.get('/api/menu');
    menuItems = (data.items || []).filter(item => item.active !== false); // Only display active items
    
    renderCategories(menuItems);
    renderGrid(menuItems);
    setupScrollspy();
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

function renderCategories(items) {
  const categoryNav = document.getElementById('category-nav');
  if (!categoryNav) return;

  const categories = ['Tất cả', ...new Set(items.map(i => i.category || 'Món chính'))];

  categoryNav.innerHTML = categories.map((cat, idx) => `
    <button class="category-tab ${idx === 0 ? 'active' : ''}" data-category="${cat}">
      ${cat}
    </button>
  `).join('');

  categoryNav.querySelectorAll('.category-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const cat = tab.dataset.category;
      categoryNav.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      if (cat === 'Tất cả') {
        renderGrid(menuItems);
      } else {
        const filtered = menuItems.filter(i => (i.category || 'Món chính') === cat);
        renderGrid(filtered);
      }
    });
  });
}

function renderGrid(items) {
  const catalogContainer = document.getElementById('catalog-container');
  if (!catalogContainer) return;

  if (items.length === 0) {
    catalogContainer.innerHTML = `<div style="text-align: center; padding: var(--space-8); color: var(--color-text-muted);">Không tìm thấy món ăn phù hợp.</div>`;
    return;
  }

  // Group items by category
  const grouped = {};
  items.forEach(item => {
    const cat = item.category || 'Món chính';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(item);
  });

  let html = '';
  for (const [catName, catItems] of Object.entries(grouped)) {
    const catId = `cat-${catName.replace(/\s+/g, '-').toLowerCase()}`;
    html += `
      <section class="category-section" id="${catId}" data-section-category="${catName}">
        <h2 class="section-title">
          <span>${catName}</span>
          <span style="font-size: var(--font-size-xs); font-weight: 500; color: var(--color-text-muted);">(${catItems.length} món)</span>
        </h2>
        <div class="food-grid">
          ${catItems.map(item => createCardHtml(item)).join('')}
        </div>
      </section>
    `;
  }

  catalogContainer.innerHTML = html;

  // Bind card action buttons & Steppers
  bindCardEvents(catalogContainer);
}

function createCardHtml(item) {
  const qty = cart.getItemQuantity(item.id);
  const altText = buildAltText(item.name, item.category);

  return `
    <article class="food-card" data-item-id="${item.id}">
      <div class="food-card-img-wrapper" onclick="window.triggerQuickView('${item.id}')">
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
        <h3 class="food-card-title line-clamp-1" onclick="window.triggerQuickView('${item.id}')">${item.name}</h3>
        <p class="food-card-desc line-clamp-2">${item.description || ''}</p>
        <div class="food-card-footer">
          <div class="price-box">
            <span class="price-current">${formatVND(item.price)}</span>
            ${item.originalPrice ? `<span class="price-original">${formatVND(item.originalPrice)}</span>` : ''}
          </div>
          <div class="action-box" id="action-box-${item.id}">
            ${renderActionBtn(item, qty)}
          </div>
        </div>
      </div>
    </article>
  `;
}

function renderActionBtn(item, qty) {
  if (qty > 0) {
    return `
      <div class="stepper">
        <button class="stepper-btn" onclick="window.handleCartChange('${item.id}', -1)" aria-label="Giảm số lượng">-</button>
        <span class="stepper-val">${qty}</span>
        <button class="stepper-btn" onclick="window.handleCartChange('${item.id}', 1)" aria-label="Tăng số lượng">+</button>
      </div>
    `;
  }
  return `
    <button class="btn-quick-add" onclick="window.handleCartChange('${item.id}', 1)" aria-label="Thêm món ${item.name}">
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
    
    // Update card action box instantly
    const actionBox = document.getElementById(`action-box-${itemId}`);
    if (actionBox) {
      actionBox.innerHTML = renderActionBtn(item, newQty);
    }
  };
}

function setupScrollspy() {
  const sections = document.querySelectorAll('.category-section');
  const navTabs = document.querySelectorAll('.category-tab');

  if (!('IntersectionObserver' in window) || sections.length === 0) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const category = entry.target.dataset.sectionCategory;
        navTabs.forEach(tab => {
          if (tab.dataset.category === category) {
            tab.classList.add('active');
            tab.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
          } else {
            tab.classList.remove('active');
          }
        });
      }
    });
  }, { rootMargin: '-130px 0px -60% 0px', threshold: 0 });

  sections.forEach(sec => observer.observe(sec));
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
