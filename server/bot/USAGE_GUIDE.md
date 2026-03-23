# handleUserMessage() - Usage Guide

## Overview

`handleUserMessage(message, cart, availableProducts)` is a flexible message parser for the WhatsApp donut bot. It recognizes user intents and processes donut orders and payment commands.

---

## Function Signature

```javascript
handleUserMessage(message, cart, availableProducts);
```

### Parameters:

| Parameter           | Type     | Description                                                      |
| ------------------- | -------- | ---------------------------------------------------------------- |
| `message`           | `string` | User's WhatsApp message                                          |
| `cart`              | `object` | Shopping cart object with `items: []` and `total: number`        |
| `availableProducts` | `array`  | List of available donut products with `_id`, `nama`, and `harga` |

### Returns:

```javascript
{
  action: "add" | "checkout" | "error" | "unknown",
  message: string,              // Response message to send to user
  addedItem?: object,           // (if action === "add")
  cart: object                  // Updated cart
}
```

---

## Examples

### Initialize a Cart

```javascript
const cart = {
  items: [],
  total: 0,
};
```

### Example 1: Flexible Order Formats

```javascript
// User says: "donat coklat klasik 1 ya kak"
const result = handleUserMessage(
  "donat coklat klasik 1 ya kak",
  cart,
  products,
);

// Result:
// {
//   action: "add",
//   message: "Oke, sudah ditambahkan 1 Donat Coklat Klasik = Rp15000.\n\nTotal pesananmu: Rp15000.\nMau tambah varian lain atau langsung bayar?",
//   addedItem: { name: "Donat Coklat Klasik", quantity: 1, subTotal: 15000 },
//   cart: { items: [...], total: 15000 }
// }
```

### Example 2: Different Order Format

```javascript
// User says: "aku mau 2 donat stroberi"
const result = handleUserMessage("aku mau 2 donat stroberi", cart, products);

// Recognized! Adds 2 stroberi donuts to cart.
```

### Example 3: Another Variant

```javascript
// User says: "tambah donat coklat 1"
const result = handleUserMessage("tambah donat coklat 1", cart, products);

// Recognized! Adds 1 chocolate donut to cart.
```

### Example 4: Payment Command

```javascript
// User says: "bayar"
const result = handleUserMessage("bayar", cart, products);

// Result (if cart has items):
// {
//   action: "checkout",
//   message: "Pesananmu sudah dicatat. Total pembayaran: Rp30000. Silakan lakukan pembayaran. Terima kasih!",
//   cart: { items: [...], total: 30000 }
// }
```

### Example 5: Payment When Cart is Empty

```javascript
// User says: "bayar"
const emptyCart = { items: [], total: 0 };
const result = handleUserMessage("bayar", emptyCart, products);

// Result:
// {
//   action: "error",
//   message: 'Belum ada pesanan. Ketik "tambah [nama donat] [jumlah]" terlebih dahulu.',
//   cart: { items: [], total: 0 }
// }
```

### Example 6: Unrecognized Command

```javascript
// User says: "halo"
const result = handleUserMessage("halo", cart, products);

// Result:
// {
//   action: "unknown",
//   message: 'Maaf, saya tidak mengerti. Ketik "tambah [nama donat] [jumlah]" atau "bayar".',
//   cart: { items: [], total: 0 }
// }
```

---

## Supported Message Formats

### Order Formats

The function recognizes these flexible patterns:

1. **Quantity + Donut Name**: "2 donat stroberi"
2. **Quantity + Donut Name + Particles**: "2 donat stroberi ya kak", "3 donat coklat tolong"
3. **Donut Name + Quantity**: "donat coklat klasik 1"
4. **Donut Name + Quantity + Particles**: "donat coklat 1 ya kak"
5. **Imperative + Donut Name + Quantity**: "tambah donat coklat 1", "order donat kacang 3", "ambil 2 donat gulung"
6. **"I want" Format**: "aku mau 2 donat stroberi", "saya mau 3 donat original"

### Payment Commands

- "bayar"
- "langsung bayar"
- "selesai"
- "checkout"
- "lanjut bayar"
- "proses bayar"

### Recognized Particles (Filler Words)

These are automatically removed from parsing:

- "ya", "yak", "ya kak"
- "tolong", "mohon"
- "makasih", "pleaseee"

---

## Integration Example

```javascript
import { handleUserMessage } from "./bot/whatsapp.js";

// In your message handler:
const products = await productService.getAllProducts();

// Initialize or get existing cart
let cart = { items: [], total: 0 };

// Process user message
const result = handleUserMessage(userMessage, cart, products);

// Send response to user
await sendWhatsAppText(sock, userId, result.message);

// Update cart
cart = result.cart;

// Handle different actions
if (result.action === "add") {
  console.log(`Added: ${result.addedItem.name} x${result.addedItem.quantity}`);
} else if (result.action === "checkout") {
  // Proceed with payment
} else if (result.action === "unknown") {
  // User message not understood
}
```

---

## Features

✅ **Flexible Parsing**: Understands various order formats without strict syntax  
✅ **Case-Insensitive**: Works with uppercase, lowercase, or mixed case  
✅ **Partial Matching**: Recognizes "coklat" as "Donat Coklat Klasik"  
✅ **Filler Word Removal**: Ignores courtesy particles like "ya kak", "tolong"  
✅ **Cart Management**: Automatically updates cart totals  
✅ **Duplicate Prevention**: Updates existing items instead of duplicating  
✅ **Localized Formatting**: Uses Indonesian number formatting (Rp)

---

## Notes

- Product names are matched **case-insensitively**
- Partial product name matching is supported (e.g., "coklat" matches "Donat Coklat Klasik")
- Cart totals are automatically recalculated after each order
- The function is **synchronous** and doesn't require async/await
- All messages and responses are in Indonesian (Bahasa Indonesia)
