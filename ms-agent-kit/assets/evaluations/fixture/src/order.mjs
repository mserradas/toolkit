import { findItem } from "./catalog.mjs"

export function createOrder(id, quantity) {
  const item = findItem(id)
  if (!item) throw new Error("Producto desconocido")
  return { id, quantity, total: item.price * quantity }
}
