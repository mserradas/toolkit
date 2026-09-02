export const catalog = [
  { id: "book", price: 12, stock: 3 },
  { id: "pen", price: 2, stock: 0 },
]

export function findItem(id) {
  return catalog.find((item) => item.id === id)
}
