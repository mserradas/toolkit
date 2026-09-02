import { total } from "./src/money.mjs"
import { shippingFee } from "./src/shipping.mjs"

const subtotal = total([{ price: 12, quantity: 2 }])
const shipping = shippingFee(subtotal, "local")
console.log(JSON.stringify({ subtotal, shipping, total: subtotal + shipping }))
