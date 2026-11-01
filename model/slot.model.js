
import mongoose from "mongoose";

const slotModel = new mongoose.Schema({
    doctorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
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
        enum: ["available", "booked", "blocked"],
        default: "available",
        required: true
    }
},
    {
        timestamps: true
    });

export const Slot = mongoose.model("Slot", slotModel);
