export function shippingFee(subtotal, zone) {
  if (zone === "remote") return 9
  if (subtotal >= 50) return 0
  return 4
}
