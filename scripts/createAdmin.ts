// scripts/createAdmin.ts
import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "../src/models/User";

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI;
if (!MONGO_URI) {
    throw new Error("MONGO_URI is not defined");
}
async function createAdmin() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected to MongoDB");

    const email = "admin@system.com";
    const password = "Admin@123";

    const existing = await User.findOne({ email });
    if (existing) {
      console.log("⚠️ Admin already exists:", existing.email);
      process.exit(0);
    }

    // IMPORTANT: give plain password here, pre-save hook will hash it ONCE
    const admin = new User({
      fullName: "System Admin",
      cnicNumber: "0000000000000",
      phone: "03000000000",
      email,
      passwordHash: password,   // ⬅️ plain text; hook will hash it
      address: "Admin HQ",
      city: "Islamabad",
      province: "Punjab",
      monthlyIncome: 999999,
      employmentType: "BUSINESS_OWNER",
      status: "APPROVED",
      role: "ADMIN",
    });

    await admin.save();

    console.log("🎉 ADMIN CREATED SUCCESSFULLY!");
    console.log("Email:", email);
    console.log("Password:", password);
    process.exit(0);
  } catch (err) {
    console.error("❌ Error creating admin:", err);
    process.exit(1);
  }
}

createAdmin();
