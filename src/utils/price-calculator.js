/**
 * Standard Price & Discount Utility for Food Order Bridge
 */

/**
 * Calculates the final sale price after applying discount percentage.
 * Single source of truth formula: Math.round(price * (100 - discountPercent) / 100)
 *
 * @param {number} price - Original base price (non-negative number)
 * @param {number} discountPercent - Discount percentage (0 to 100)
 * @returns {number} Rounded sale price
 */
function calculateSalePrice(price, discountPercent = 0) {
  const numPrice = Number(price);
  const numDiscount = Number(discountPercent);

  if (!Number.isFinite(numPrice) || numPrice < 0) {
    return 0;
  }

  const validDiscount = Number.isFinite(numDiscount)
    ? Math.max(0, Math.min(100, numDiscount))
    : 0;

  return Math.round(numPrice * (100 - validDiscount) / 100);
}

module.exports = {
  calculateSalePrice
};
