import midtransClient from "midtrans-client";
import dotenv from "dotenv";
dotenv.config();

// Konfigurasi Midtrans
const core = new midtransClient.CoreApi({
  isProduction: false,
  serverKey: process.env.MIDTRANS_SERVER_KEY?.trim(),
  clientKey: process.env.MIDTRANS_CLIENT_KEY?.trim(),
});

async function testQRIS() {
  try {
    console.log("🧪 Testing QRIS Payment Creation...");

    const charge = await core.charge({
      payment_type: "qris",
      transaction_details: {
        order_id: `test-${Date.now()}`,
        gross_amount: 10000,
      },
      qris: {
        acquirer: "gopay",
      },
      expiry: {
        unit: "minute",
        duration: 10,
      },
    });

    console.log("✅ Charge Response:");
    console.log(JSON.stringify(charge, null, 2));

    console.log("\n🔍 Actions Analysis:");
    if (charge.actions && Array.isArray(charge.actions)) {
      charge.actions.forEach((action, index) => {
        console.log(
          `${index + 1}. Name: "${action.name}", URL: ${action.url ? "YES" : "NO"}`,
        );
        if (action.name?.toLowerCase().includes("deeplink")) {
          console.log("   🎯 Found deeplink action!");
        }
      });
    } else {
      console.log("No actions array found");
    }

    // Test current logic from midtransServices.js
    console.log("\n🧪 Testing current logic from midtransServices.js:");
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

    if (deeplinkAction) {
      console.log("✅ Current logic found URL:", deeplinkAction.url);
    } else {
      console.log("❌ Current logic found no URL");
    }
  } catch (error) {
    console.error("❌ Error:", error.response?.data || error.message);
  }
}

testQRIS();
