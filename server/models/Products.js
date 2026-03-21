import mongoose from "mongoose";

const productSchema = new mongoose.Schema({
  nama: String,
  harga: Number,
  stok: Number,
  kategori: String,
});

export default mongoose.model("Product", productSchema);
