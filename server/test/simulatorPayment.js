// services/midtransServices.js
import midtransClient from "midtrans-client";
import dotenv from "dotenv";
dotenv.config();

// ==========================
// KONFIGURASI MIDTRANS
// ==========================
const isProduction = false; // Force sandbox untuk testing

// Ambil key dari environment dan bersihkan dari whitespace
const serverKey = process.env.MIDTRANS_SERVER_KEY?.trim();
const clientKey = process.env.MIDTRANS_CLIENT_KEY?.trim();

// Validasi key
if (!serverKey) {
  console.error("❌ MIDTRANS_SERVER_KEY is not set in .env file");
  process.exit(1);
}

if (!clientKey) {
  console.error("❌ MIDTRANS_CLIENT_KEY is not set in .env file");
  process.exit(1);
}

console.log("=== MIDTRANS CONFIGURATION ===");
console.log("Mode: SANDBOX (Testing)");
console.log("Server Key exists: YES");
console.log("Server Key prefix:", serverKey.substring(0, 15) + "...");
console.log("Server Key length:", serverKey.length);
console.log("Client Key exists: YES");
console.log("Client Key prefix:", clientKey.substring(0, 15) + "...");
console.log("==============================\n");

// Inisialisasi Midtrans Client
const core = new midtransClient.CoreApi({
  isProduction: isProduction,
  serverKey: serverKey,
  clientKey: clientKey,
});

/**
 * Create QRIS Payment
 * @param {number} amount - Amount in IDR (minimum 1000)
 * @param {string} customOrderId - Optional custom order ID
 * @returns {Promise<Object>}
 */
export const createQRPayment = async (amount, customOrderId = null) => {
  try {
    // Validasi amount
    if (!amount || amount < 1000) {
      throw new Error(`Invalid amount: Rp${amount}. Minimum amount is Rp1,000`);
    }

    // Generate order ID
    const order_id =
      customOrderId ||
      `order-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

    console.log(`💰 Creating QRIS Payment:`);
    console.log(`   Order ID: ${order_id}`);
    console.log(`   Amount: Rp${amount.toLocaleString()}`);

    // Prepare charge payload
    const chargePayload = {
      payment_type: "qris",
      transaction_details: {
        order_id: order_id,
        gross_amount: amount,
      },
      qris: {
        acquirer: "gopay",
      },
      expiry: {
        unit: "minute",
        duration: 10, // 10 menit expiry
      },
    };

    // Call Midtrans API
    const charge = await core.charge(chargePayload);

    // Find deeplink URL
    const deeplinkAction = charge.actions?.find((a) => a.name === "deeplink");

    if (!deeplinkAction || !deeplinkAction.url) {
      throw new Error("Deeplink URL not found in Midtrans response");
    }

    // Get expiry time
    const expiryTime =
      charge.expiry_time || new Date(Date.now() + 10 * 60000).toISOString();

    console.log(`✅ QRIS Created Successfully:`);
    console.log(`   Order ID: ${charge.order_id}`);
    console.log(`   Transaction ID: ${charge.transaction_id}`);
    console.log(`   Status: ${charge.transaction_status}`);
    console.log(`   Expiry: ${expiryTime}`);
    console.log(`   QR URL: ${deeplinkAction.url.substring(0, 80)}...\n`);

    return {
      orderId: charge.order_id,
      qrUrl: deeplinkAction.url,
      expiry: expiryTime,
      transactionId: charge.transaction_id,
      status: charge.transaction_status,
      amount: charge.gross_amount,
    };
  } catch (error) {
    console.error("❌ Error creating QRIS payment:");

    // Handle Midtrans API error
    if (error.response) {
      console.error(`   HTTP Status: ${error.response.status}`);
      console.error(`   Status Code: ${error.response.data?.status_code}`);
      console.error(
        `   Status Message: ${error.response.data?.status_message}`,
      );
      console.error(
        `   Full Response:`,
        JSON.stringify(error.response.data, null, 2),
      );

      // Specific error handling
      if (error.response.status === 401) {
        throw new Error(
          `Authentication failed! Please check your MIDTRANS_SERVER_KEY.\n` +
            `Current key: ${serverKey.substring(0, 15)}...\n` +
            `Expected format for Sandbox: SB-Mid-server-xxxxxxxxxxxxxx\n` +
            `Please get the correct key from Midtrans Dashboard (Sandbox mode).`,
        );
      } else if (error.response.data?.status_code === "402") {
        throw new Error(`Invalid amount. Minimum amount for QRIS is Rp1,000`);
      } else if (error.response.data?.status_code === "406") {
        throw new Error(
          `QRIS payment method is not activated for your account.`,
        );
      }
    }

    throw new Error(error.response?.data?.status_message || error.message);
  }
};

/**
 * Check Payment Status
 * @param {string} orderId - Order ID to check
 * @returns {Promise<Object>}
 */
export const checkPaymentStatus = async (orderId) => {
  try {
    console.log(`🔍 Checking payment status for: ${orderId}`);

    const status = await core.transaction.status(orderId);

    console.log(`   Status: ${status.transaction_status}`);
    console.log(`   Payment Type: ${status.payment_type || "N/A"}`);
    console.log(`   Amount: Rp${status.gross_amount?.toLocaleString() || "0"}`);

    return {
      status: status.transaction_status, // settlement, pending, deny, expire, cancel
      paymentType: status.payment_type,
      amount: status.gross_amount,
      orderId: status.order_id,
      transactionId: status.transaction_id,
      fraudStatus: status.fraud_status,
      raw: status,
    };
  } catch (error) {
    console.error(`❌ Error checking payment status for ${orderId}:`);

    if (error.response) {
      console.error(`   HTTP Status: ${error.response.status}`);
      console.error(
        `   Status Message: ${error.response.data?.status_message}`,
      );

      // Handle 404 - Transaction not found
      if (error.response.status === 404) {
        return {
          status: "not_found",
          paymentType: null,
          amount: 0,
          orderId: orderId,
          transactionId: null,
          fraudStatus: null,
          raw: null,
          error: "Transaction not found",
        };
      }
    }

    throw new Error(error.response?.data?.status_message || error.message);
  }
};

/**
 * Cancel Transaction
 * @param {string} orderId - Order ID to cancel
 * @returns {Promise<Object>}
 */
export const cancelPayment = async (orderId) => {
  try {
    console.log(`🗑️ Cancelling payment for: ${orderId}`);

    const result = await core.transaction.cancel(orderId);

    console.log(`✅ Payment cancelled: ${orderId}`);

    return result;
  } catch (error) {
    console.error(
      `❌ Error cancelling payment ${orderId}:`,
      error.response?.data || error.message,
    );
    throw error;
  }
};

/**
 * Format Payment Response for Bot
 * @param {Object} paymentResult - Result from checkPaymentStatus
 * @returns {Object} Formatted response
 */
export const formatPaymentResponse = (paymentResult) => {
  const { status, amount, orderId, transactionId } = paymentResult;

  switch (status) {
    case "settlement":
    case "capture":
      return {
        success: true,
        message: `✅ *PEMBAYARAN BERHASIL!*\n\nTerima kasih telah berbelanja sebesar *Rp${amount?.toLocaleString() || "0"}*.\n\nPesanan Anda akan segera diproses. 😊\n\n*Order ID:* ${orderId}`,
        status: "success",
        orderId,
        transactionId,
      };

    case "pending":
      return {
        success: false,
        message: `⏳ *MENUNGGU PEMBAYARAN*\n\nTotal: *Rp${amount?.toLocaleString() || "0"}*\n\nSilakan scan QR code yang telah dikirim untuk menyelesaikan pembayaran.\n\n*Order ID:* ${orderId}`,
        status: "pending",
        orderId,
      };

    case "deny":
      return {
        success: false,
        message: `❌ *PEMBAYARAN DITOLAK*\n\nPembayaran sebesar *Rp${amount?.toLocaleString() || "0"}* ditolak.\n\nSilakan coba lagi dengan pesanan baru.\n\n*Order ID:* ${orderId}`,
        status: "failed",
        orderId,
      };

    case "expire":
      return {
        success: false,
        message: `⏰ *PEMBAYARAN EXPIRED*\n\nWaktu pembayaran telah habis.\n\nSilakan buat pesanan baru untuk melanjutkan.\n\n*Order ID:* ${orderId}`,
        status: "expired",
        orderId,
      };

    case "cancel":
      return {
        success: false,
        message: `❌ *PEMBAYARAN DIBATALKAN*\n\nPembayaran telah dibatalkan.\n\n*Order ID:* ${orderId}`,
        status: "cancelled",
        orderId,
      };

    case "not_found":
      return {
        success: false,
        message: `❌ *TRANSAKSI TIDAK DITEMUKAN*\n\nOrder ID: ${orderId} tidak ditemukan.\n\nSilakan buat pesanan baru.`,
        status: "not_found",
        orderId,
      };

    default:
      return {
        success: false,
        message: `❓ *STATUS TIDAK DIKETAHUI*\n\nStatus: ${status}\nOrder ID: ${orderId}`,
        status: "unknown",
        orderId,
      };
  }
};

/**
 * Test Connection to Midtrans
 */
export const testConnection = async () => {
  try {
    console.log("🔌 Testing Midtrans connection...");
    const test = await createQRPayment(1000, `test-${Date.now()}`);
    console.log("✅ Connection successful!");
    return true;
  } catch (error) {
    console.error("❌ Connection failed:", error.message);
    return false;
  }
};
