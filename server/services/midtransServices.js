// services/midtransServices.js
import midtransClient from "midtrans-client";
import axios from "axios"; // Install axios jika belum: npm install axios

// ==========================
// KONFIGURASI MIDTRANS
// ==========================
const core = new midtransClient.CoreApi({
  isProduction: false, // Using sandbox mode - change to true for production
  serverKey: process.env.MIDTRANS_SERVER_KEY,
  clientKey: process.env.MIDTRANS_CLIENT_KEY,
});

// Cara 1: Set timeout melalui axios instance (jika menggunakan axios)
// Ini akan meng-override default timeout
if (core && core.apiConfig && core.apiConfig.request) {
  // Untuk Midtrans Client, timeout diatur melalui konfigurasi request
  core.apiConfig.request = {
    ...core.apiConfig.request,
    timeout: 30000, // 30 detik
  };
}

// Cara 2: Alternatif - buat wrapper dengan timeout sendiri
// (Lebih aman dan tidak error)

/**
 * Wrapper untuk menjalankan fungsi dengan timeout
 */
async function withTimeout(promise, timeoutMs = 30000) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Request timeout after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId);
    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * Create QRIS Payment
 * @param {number} amount - Amount in IDR
 * @param {string} customOrderId - Optional custom order ID
 * @returns {Promise<{orderId: string, qrUrl: string, expiry: string}>}
 */
export const createQRPayment = async (amount, customOrderId = null) => {
  try {
    const order_id =
      customOrderId ||
      `order-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

    const charge = await withTimeout(
      core.charge({
        payment_type: "qris",
        transaction_details: {
          order_id: order_id,
          gross_amount: amount,
        },
        // Optional: Set QRIS expiry (default 5 menit)
        qris: {
          acquirer: "gopay", // atau "airpay", "other"
        },
        // Custom expiry (dalam menit)
        expiry: {
          unit: "minute",
          duration: 10, // 10 menit expiry
        },
      }),
      30000,
    );

    // Cari deeplink URL (robust untuk beberapa format respons)
    const deeplinkAction = Array.isArray(charge.actions)
      ? charge.actions.find(
          (a) =>
            a.url &&
            (a.name?.toLowerCase().includes("deeplink") ||
              a.name?.toLowerCase().includes("qris") ||
              a.name?.toLowerCase().includes("redirect") ||
              a.name?.toLowerCase().includes("action")),
        )
      : null;

    const deeplinkUrl =
      deeplinkAction?.url ||
      charge.qris_url ||
      charge.redirect_url ||
      charge.url ||
      charge.actions?.[0]?.url;

    if (!deeplinkUrl) {
      console.error("❌ Charge object tidak memiliki URL deeplink:", charge);
      throw new Error("Deeplink URL not found in Midtrans response");
    }

    // Dapatkan waktu expired dari response
    const expiryTime =
      charge.expiry_time || new Date(Date.now() + 10 * 60000).toISOString();

    console.log("✅ QRIS Created:", {
      orderId: charge.order_id,
      amount: charge.gross_amount,
      expiry: expiryTime,
      deeplinkUrl,
    });

    return {
      orderId: charge.order_id,
      qrUrl: deeplinkUrl,
      expiry: expiryTime,
      transactionId: charge.transaction_id,
      status: charge.transaction_status,
      amount: charge.gross_amount,
    };
  } catch (error) {
    console.error(
      "❌ Error creating QRIS payment:",
      error.response?.data || error.message,
    );

    // Handle timeout error
    if (error.message === "Request timeout after 30000ms") {
      throw new Error("Koneksi timeout, silakan coba lagi");
    }

    throw new Error(
      `Failed to create QRIS payment: ${error.response?.data?.status_message || error.message}`,
    );
  }
};

/**
 * Check Payment Status
 * @param {string} orderId - Order ID to check
 * @returns {Promise<{status: string, paymentType: string, amount: number, raw: object}>}
 */
export const checkPaymentStatus = async (orderId) => {
  try {
    const status = await withTimeout(core.transaction.status(orderId), 30000);

    console.log(`📊 Payment Status Check [${orderId}]:`, {
      status: status.transaction_status,
      paymentType: status.payment_type,
      amount: status.gross_amount,
      fraudStatus: status.fraud_status,
    });

    return {
      status: status.transaction_status, // settlement, pending, deny, expire, cancel
      transactionStatus: status.transaction_status,
      paymentType: status.payment_type,
      amount: status.gross_amount,
      orderId: status.order_id,
      transactionId: status.transaction_id,
      fraudStatus: status.fraud_status,
      raw: status,
    };
  } catch (error) {
    console.error(
      `❌ Error checking payment status for ${orderId}:`,
      error.response?.data || error.message,
    );

    // Handle timeout error
    if (error.message === "Request timeout after 30000ms") {
      throw new Error("Timeout checking payment status");
    }

    // Jika order not found
    if (error.response?.data?.status_code === "404") {
      return {
        status: "not_found",
        error: "Transaction not found",
      };
    }

    throw new Error(
      `Failed to check payment status: ${error.response?.data?.status_message || error.message}`,
    );
  }
};

/**
 * Cancel/Expire Transaction
 * @param {string} orderId - Order ID to cancel
 * @returns {Promise<object>}
 */
export const cancelPayment = async (orderId) => {
  try {
    const result = await withTimeout(core.transaction.cancel(orderId), 30000);
    console.log(`✅ Payment cancelled [${orderId}]:`, result);
    return result;
  } catch (error) {
    console.error(
      `❌ Error cancelling payment ${orderId}:`,
      error.response?.data || error.message,
    );

    if (error.message === "Request timeout after 30000ms") {
      throw new Error("Timeout cancelling payment");
    }

    throw error;
  }
};

/**
 * Refund Transaction
 * @param {string} orderId - Order ID to refund
 * @param {number} amount - Amount to refund (optional)
 * @returns {Promise<object>}
 */
export const refundPayment = async (orderId, amount = null) => {
  try {
    const refundParams = {
      order_id: orderId,
    };

    if (amount) {
      refundParams.amount = amount;
    }

    const result = await withTimeout(
      core.transaction.refund(refundParams),
      30000,
    );
    console.log(`✅ Refund processed [${orderId}]:`, result);
    return result;
  } catch (error) {
    console.error(
      `❌ Error refunding payment ${orderId}:`,
      error.response?.data || error.message,
    );

    if (error.message === "Request timeout after 30000ms") {
      throw new Error("Timeout processing refund");
    }

    throw error;
  }
};

/**
 * Get QRIS QR Code as Base64/DataURL
 * @param {string} deeplinkUrl - Deeplink URL from createQRPayment
 * @returns {Promise<string>} - Base64 encoded QR code
 */
export const generateQRCodeImage = async (deeplinkUrl) => {
  try {
    // Gunakan API Midtrans untuk generate QR code image
    const response = await withTimeout(
      fetch(`https://api.midtrans.com/qris/generate-qr-code`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${Buffer.from(process.env.MIDTRANS_SERVER_KEY + ":").toString("base64")}`,
        },
        body: JSON.stringify({
          deeplink_url: deeplinkUrl,
        }),
      }),
      30000,
    );

    if (!response.ok) {
      console.error(
        `QR Code API error: ${response.status} ${response.statusText}`,
      );
      const errorText = await response.text();
      console.error("Error response body:", errorText);
      return null;
    }

    const data = await response.json();
    if (!data.qr_code) {
      console.error("QR Code API response missing qr_code field:", data);
      return null;
    }

    return data.qr_code; // Base64 image
  } catch (error) {
    console.error("Error generating QR code image:", error);
    return null;
  }
};

/**
 * Webhook Handler untuk Notifikasi Midtrans
 * @param {object} notification - Midtrans notification object
 * @returns {Promise<object>}
 */
export const handlePaymentNotification = async (notification) => {
  try {
    const orderId = notification.order_id;
    const transactionStatus = notification.transaction_status;
    const fraudStatus = notification.fraud_status;

    console.log(`🔔 Payment notification received:`, {
      orderId,
      transactionStatus,
      fraudStatus,
      paymentType: notification.payment_type,
    });

    let status = "pending";

    if (transactionStatus === "capture") {
      status = fraudStatus === "challenge" ? "challenge" : "success";
    } else if (transactionStatus === "settlement") {
      status = "success";
    } else if (transactionStatus === "deny") {
      status = "failed";
    } else if (
      transactionStatus === "cancel" ||
      transactionStatus === "expire"
    ) {
      status = "expired";
    } else if (transactionStatus === "pending") {
      status = "pending";
    }

    return {
      orderId,
      status,
      transactionStatus,
      fraudStatus,
      paymentType: notification.payment_type,
      amount: notification.gross_amount,
      raw: notification,
    };
  } catch (error) {
    console.error("Error handling payment notification:", error);
    throw error;
  }
};

// ==========================
// HELPER: Format Response untuk Bot
// ==========================
export const formatPaymentResponse = (paymentResult) => {
  const { status, amount, orderId, transactionId } = paymentResult;

  switch (status) {
    case "settlement":
    case "capture":
      return {
        success: true,
        message: `✅ Pembayaran Rp${amount?.toLocaleString() || "0"} berhasil! Terima kasih.`,
        status: "success",
        orderId,
        transactionId,
      };
    case "pending":
      return {
        success: false,
        message: `⏳ Menunggu pembayaran Rp${amount?.toLocaleString() || "0"}. Scan QR code untuk melanjutkan.`,
        status: "pending",
        orderId,
      };
    case "deny":
      return {
        success: false,
        message: `❌ Pembayaran Rp${amount?.toLocaleString() || "0"} ditolak. Silakan coba lagi.`,
        status: "failed",
        orderId,
      };
    case "expire":
      return {
        success: false,
        message: `⏰ Pembayaran Rp${amount?.toLocaleString() || "0"} telah kadaluarsa. Silakan buat pesanan baru.`,
        status: "expired",
        orderId,
      };
    case "not_found":
      return {
        success: false,
        message: `❌ Transaksi tidak ditemukan.`,
        status: "not_found",
        orderId,
      };
    default:
      return {
        success: false,
        message: `Status pembayaran tidak diketahui: ${status}`,
        status: "unknown",
        orderId,
      };
  }
};

// ==========================
// EXPORT DENGAN RETRY MECHANISM
// ==========================

/**
 * Retry mechanism untuk network issues
 */
async function retryOperation(fn, maxRetries = 3, delay = 1000) {
  let lastError;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      console.log(`Retry ${i + 1}/${maxRetries} after error:`, error.message);
      if (i < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, delay * (i + 1)));
      }
    }
  }

  throw lastError;
}

export const createQRPaymentWithRetry = async (
  amount,
  customOrderId = null,
) => {
  return retryOperation(() => createQRPayment(amount, customOrderId));
};

export const checkPaymentStatusWithRetry = async (orderId) => {
  return retryOperation(() => checkPaymentStatus(orderId));
};
