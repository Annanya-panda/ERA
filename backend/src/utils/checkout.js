const COUPON_CODE = 'LEARN10';

function calculateTotals(items, couponCode = '') {
  const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const discount = couponCode.trim().toUpperCase() === COUPON_CODE ? Math.round(subtotal * 0.1 * 100) / 100 : 0;
  return { subtotal, discount, total: Math.max(0, subtotal - discount) };
}

function validAddress(address) {
  return address && ['name', 'line1', 'city', 'postalCode'].every((key) =>
    typeof address[key] === 'string' && address[key].trim().length > 0
  );
}

module.exports = { calculateTotals, validAddress, COUPON_CODE };
