
import mongoose from "mongoose";

const appointmentSchema = new mongoose.Schema({
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

    // Optional for the old booking flow.
    // New Razorpay bookings will always have a paymentId.
    paymentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Payment",
        default: null
    },

    date: {
        type: String,
        required: true
    },

    startTime: {
        type: String,
        required: true
    },

    endTime: {
        type: String,
        required: true
    },

    status: {
        type: String,
        enum: ["pending", "confirmed", "completed", "cancelled"],
        default: "pending"
    },

    cancelledBy: {
        type: String,
        enum: ["patient", "doctor", null],
        default: null
    },

    cancelledAt: {
        type: Date,
        default: null
    }

}, { timestamps: true });

export const Appointment = mongoose.model(
    "Appointment",
    appointmentSchema
);
