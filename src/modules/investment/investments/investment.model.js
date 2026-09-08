const mongoose = require("mongoose");

const investmentSchema = new mongoose.Schema(
  {
    investor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    startup: { type: mongoose.Schema.Types.ObjectId, ref: "Startup", required: true, index: true },
    amount: { type: Number, required: true, min: 1 },
    currency: { type: String, default: "usd" },
    status: { type: String, enum: ["pending", "paid", "failed", "refunded"], default: "pending" },
    stripePaymentIntentId: { type: String, unique: true, sparse: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Investment", investmentSchema);
