
import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
    {
        patientId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },
        doctorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },
        slotId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Slot",
            required: true
        },
        amount: {
            type: Number,
            required: true
        },
        razorpayOrderId: {
            type: String,
            required: true
        },
        razorpayPaymentId: {
            type: String,
            default: null
        },
        razorpaySignature: {
            type: String,
            default: null
        },
        status: {
            type: String,
            enum: ["created", "paid", "failed"],
            default: "created"
        },
        refundStatus: {
            type: String,
            enum: ["not_requested", "pending", "processed", "failed"],
            default: "not_requested"
        },

        razorpayRefundId: {
            type: String,
            default: null
        }
    },
    {
        timestamps: true
    }
);

export const Payment = mongoose.model("Payment", paymentSchema);
