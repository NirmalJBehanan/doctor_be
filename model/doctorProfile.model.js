
import mongoose from "mongoose";

const doctorProfileSchema = new mongoose.Schema(
    {
        doctorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            unique: true
        },

        description: {
            type: String,
            required: true
        },

        specialization: {
            type: String,
            required: true
        },

        qualification: {
            type: String,
            required: true
        },

        experience: {
            type: Number,
            required: true
        },

        consultationFee: {
            type: Number,
            required: true
        },

        profileImage: {
            type: mongoose.Schema.Types.ObjectId,
            default: null
        },
        isApproved: {
            type: Boolean,
            default: false
        }
    },
    {
        timestamps: true
    }
);

export const DoctorProfile = mongoose.model(
    "DoctorProfile",
    doctorProfileSchema
);
