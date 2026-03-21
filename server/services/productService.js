import Product from "../models/Products.js";

// ✅ ambil semua produk
export const getAllProducts = async () => {
  return await Product.find().lean();
};

// ✅ cari berdasarkan nama
export const findByName = async (nama) => {
  return await Product.find({
    nama: { $regex: nama, $options: "i" },
  }).lean();
};

// ✅ ambil termurah
export const getCheapest = async () => {
  return await Product.findOne().sort({ harga: 1 }).lean();
};
