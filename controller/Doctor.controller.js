import express from "express";
import bcrypt from "bcrypt";
import mongoose from "mongoose";
import { User } from "../model/user.model.js";
import jwt from "jsonwebtoken"
import { sendPasswordResetEmail, sendRegistrationEmail } from "../services/mail.service.js";
import { Slot } from "../model/slot.model.js";
import { DoctorProfile } from "../model/doctorProfile.model.js";
import { getBucket } from "../config/gridfs.js";
import Razorpay from "razorpay";
import crypto from "crypto";
import { Payment } from "../model/payment.model.js";
import { Appointment } from "../model/appointment.model.js";
import cron from "node-cron";
const getTodayDate = () => {
    return new Date().toLocaleDateString("en-CA", {
        timeZone: "Asia/Kolkata"
    });
};

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

const cleanupExpiredPayments = async () => {
    try {
        const expiredPayments = await Payment.find({
            status: "created",
            expiresAt: { $lte: new Date() }
        });

        for (const payment of expiredPayments) {
            try {
                // Check Razorpay before releasing the slot
                const orderPayments =
                    await razorpay.orders.fetchPayments(
                        payment.razorpayOrderId
                    );

                const capturedPayment = orderPayments.items?.find(
                    (item) => item.status === "captured"
                );

                const authorizedPayment = orderPayments.items?.find(
                    (item) => item.status === "authorized"
                );

                // Payment captured: keep the reservation and mark paid
                if (capturedPayment) {
                    const updatedPayment =
                        await Payment.findOneAndUpdate(
                            {
                                _id: payment._id,
                                status: "created"
                            },
                            {
                                $set: {
                                    status: "paid",
                                    razorpayPaymentId: capturedPayment.id
                                }
                            },
                            { new: true }
                        );

                    // If another request already changed the payment,
                    // don't overwrite that result.
                    if (!updatedPayment) continue;

                    continue;
                }

                // Authorized payments may still be captured.
                // Give them another 2 minutes before checking again.
                if (authorizedPayment) {
                    await Payment.findOneAndUpdate(
                        {
                            _id: payment._id,
                            status: "created"
                        },
                        {
                            $set: {
                                expiresAt: new Date(
                                    Date.now() + 2 * 60 * 1000
                                )
                            }
                        }
                    );

                    continue;
                }

                // No successful payment: mark it failed first.
                const failedPayment =
                    await Payment.findOneAndUpdate(
                        {
                            _id: payment._id,
                            status: "created"
                        },
                        {
                            $set: {
                                status: "failed"
                            }
                        },
                        { new: true }
                    );

                // Another request may have verified payment meanwhile.
                if (!failedPayment) continue;

                // Cancel appointment history
                await Appointment.findOneAndUpdate(
                    {
                        paymentId: payment._id,
                        status: "pending"
                    },
                    {
                        $set: {
                            status: "cancelled",
                            cancelledBy: "patient",
                            cancelledAt: new Date()
                        }
                    }
                );

                // Release only this patient's original reservation
                await Slot.findOneAndUpdate(
                    {
                        _id: payment.slotId,
                        patientId: payment.patientId,
                        status: "booked",
                        appointmentStatus: "pending"
                    },
                    {
                        $set: {
                            status: "available",
                            patientId: null,
                            appointmentStatus: "cancelled"
                        }
                    }
                );

                console.log(
                    "Expired payment cleaned:",
                    payment.razorpayOrderId
                );

            } catch (error) {
                console.log(
                    "Individual payment cleanup error:",
                    payment.razorpayOrderId,
                    error
                );
            }
        }

    } catch (error) {
        console.log("Payment cleanup error:", error);
    }
};
cron.schedule("* * * * *", () => {
    cleanupExpiredPayments();
});
export const Register = async (req, res) => {
    try {
        const { name, email, password } = req.body;

        // 1. Basic validation 
        if (!name || !email || !password) {
            return res.status(400).json({ message: "All fields are required" });
        }

        // 2. Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: "User already exists with this email" });
        }

        // 3. Hash the password
        const encrypted = await bcrypt.hash(password, 10);

        // 4. Save to database using Mongoose create()
        const newUser = await User.create({
            name,
            email,
            password: encrypted
        });
        const activationToken = jwt.sign(
            {
                id: newUser._id,
                purpose: "email-activation"
            },
            process.env.JWT_SECRET,
            { expiresIn: "1d" }
        );

        await sendRegistrationEmail(
            newUser.email,
            newUser.name,
            activationToken
        );
        // 5. Send success response back to frontend
        return res.status(201).json({
            message: "User registered successfully! Please check your email to activate.",
            userId: newUser._id
        });

    } catch (error) {
        console.error("Registration error:", error);
        return res.status(500).json({ message: "Server error during registration" });
    }
};



export const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email });

        if (!user) {
            return res.status(404).json({
                message: "User not found"
            });
        }

        const ismatch = await bcrypt.compare(
            password,
            user.password
        );

        if (!ismatch) {
            return res.status(400).json({
                message: "Password does not match"
            });
        }

        // Check whether the email is verified
        if (!user.isverified) {
            return res.status(403).json({
                message: "Please verify your email before logging in."
            });
        }

        const token = jwt.sign(
            {
                id: user._id,
                role: user.role
            },
            process.env.JWT_SECRET,
            { expiresIn: "1d" }
        );

        return res.status(200).json({
            status: true,
            token: token,
            role: user.role,
            message: "Sign in successful"
        });

    } catch (error) {
        console.log("Login error:", error);

        return res.status(500).json({
            message: "Internal server error"
        });
    }
};


export const activation = async (req, res) => {
    try {
        // Check whether this is an activation token
        if (req.user.purpose !== "email-activation") {
            return res.status(403).json({
                message: "Invalid activation token"
            });
        }

        // Find the user using the ID from the verified token
        const user = await User.findById(req.user.id);

        if (!user) {
            return res.status(404).json({
                message: "User not found"
            });
        }

        // Check whether the account is already activated
        if (user.isverified) {
            return res.status(200).json({
                message: "Account is already activated"
            });
        }

        // Activate the account
        user.isverified = true;
        await user.save();

        return res.status(200).json({
            message: "Email verified successfully!"
        });

    } catch (error) {
        console.error("Activation error:", error);

        return res.status(500).json({
            message: "Account activation failed"
        });
    }
};

export const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                message: "Email is required"
            });
        }

        // Find patient or doctor using the same User model
        const user = await User.findOne({
            email: email.toLowerCase().trim()
        });

        // Do not reveal whether an email is registered
        if (!user) {
            return res.status(200).json({
                message: "If this email is registered, a reset link will be sent."
            });
        }

        // Generate password reset token
        const resetToken = jwt.sign(
            {
                id: user._id,
                purpose: "password-reset"
            },
            process.env.JWT_SECRET,
            { expiresIn: "15m" }
        );

        // Send reset link through Brevo
        await sendPasswordResetEmail(
            user.email,
            user.name,
            resetToken
        );

        return res.status(200).json({
            message: "Password reset link sent to your email."
        });

    } catch (error) {
        console.log("Forgot password error:", error);

        return res.status(500).json({
            message: "Could not send password reset email"
        });
    }
};

export const resetPassword = async (req, res) => {
    try {
        const { token } = req.params;
        const { password } = req.body;

        if (!password) {
            return res.status(400).json({
                message: "New password is required"
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                message: "Password must contain at least 6 characters"
            });
        }

        // Verify reset token
        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET
        );

        // Check token purpose
        if (decoded.purpose !== "password-reset") {
            return res.status(400).json({
                message: "Invalid password reset token"
            });
        }

        // Find user
        const user = await User.findById(decoded.id);

        if (!user) {
            return res.status(404).json({
                message: "User not found"
            });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(password, 10);

        user.password = hashedPassword;

        await user.save();

        return res.status(200).json({
            message: "Password reset successfully. Please log in."
        });

    } catch (error) {
        console.log("Reset password error:", error);

        if (
            error.name === "TokenExpiredError" ||
            error.name === "JsonWebTokenError"
        ) {
            return res.status(400).json({
                message: "Reset link is invalid or expired. Please request a new one."
            });
        }

        return res.status(500).json({
            message: "Could not reset password"
        });
    }
};

export const getMe = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select("-password");

        if (!user) {
            return res.status(404).json({
                message: "User not found"
            });
        }

        let doctorProfile = null;

        if (user.role === "doctor") {
            doctorProfile = await DoctorProfile.findOne({
                doctorId: user._id
            });
        }

        return res.status(200).json({
            status: true,
            user,
            doctorProfile
        });

    } catch (error) {
        console.log(error);
        res.status(500).json({
            message: "Internal server error"
        });
    }
};

export const createSlot = async (req, res) => {
    try {
        const { date, startTime, endTime } = req.body;
        const doctorId = req.user.id;

        if (!date || !startTime || !endTime) {
            return res.status(400).json({
                message: "All fields are required"
            });
        }

        const datePattern = /^\d{4}-\d{2}-\d{2}$/;
        const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

        if (
            !datePattern.test(date) ||
            !timePattern.test(startTime) ||
            !timePattern.test(endTime)
        ) {
            return res.status(400).json({
                message: "Invalid date or time format"
            });
        }

        const [year, month, day] = date.split("-").map(Number);

        const isValidDate =
            year >= 1 &&
            month >= 1 &&
            month <= 12 &&
            day >= 1 &&
            day <= new Date(Date.UTC(year, month, 0)).getUTCDate();

        if (!isValidDate) {
            return res.status(400).json({
                message: "Please enter a valid date"
            });
        }

        // Prevent adding previous dates
        if (date < getTodayDate()) {
            return res.status(400).json({
                message: "You cannot add slots for previous dates"
            });
        }

        if (startTime >= endTime) {
            return res.status(400).json({
                message: "End time must be greater than start time"
            });
        }

        const existingSlot = await Slot.findOne({
            doctorId,
            date,
            startTime: { $lt: endTime },
            endTime: { $gt: startTime }
        });

        if (existingSlot) {
            return res.status(400).json({
                message: "This time overlaps with an existing slot"
            });
        }

        const newSlot = await Slot.create({
            doctorId,
            date,
            startTime,
            endTime
        });

        return res.status(201).json({
            message: "Slot added successfully",
            slot: newSlot
        });

    } catch (error) {
        console.log("Create slot error:", error);

        return res.status(500).json({
            message: "Error creating slot"
        });
    }
};



// Get slots of the logged-in doctor by selected date
export const getSlots = async (req, res) => {
    try {
        const doctorId = req.user.id;

        // Get selected date from frontend
        const { date } = req.query;

        // Find doctor's slots
        const slots = await Slot.find({
            doctorId,
            ...(date && { date })
        }).sort({ startTime: 1 });

        return res.status(200).json({
            status: true,
            count: slots.length,
            slots
        });

    } catch (error) {
        console.log("Get slots error:", error);

        return res.status(500).json({
            message: "Error fetching slots"
        });
    }
};

export const DeleteSlot = async (req, res) => {
    try {
        // Get slot ID from URL
        const { id } = req.params;

        // Get logged-in doctor's ID
        const doctorId = req.user.id;

        // Find the slot belonging to this doctor
        const slot = await Slot.findOne({
            _id: id,
            doctorId: doctorId
        });

        // Check whether slot exists
        if (!slot) {
            return res.status(404).json({
                message: "Slot not found"
            });
        }

        // Prevent deleting booked slots
        if (slot.status === "booked") {
            return res.status(400).json({
                message: "Cannot delete a booked slot"
            });
        }

        // Delete the slot
        await Slot.deleteOne({
            _id: id,
            doctorId: doctorId
        });

        return res.status(200).json({
            message: "Slot deleted successfully"
        });

    } catch (error) {
        console.log("Delete slot error:", error);

        return res.status(500).json({
            message: "Error deleting slot"
        });
    }
};

export const UpdateSlot = async (req, res) => {
    try {
        const { id } = req.params;
        const { date, startTime, endTime } = req.body;
        const doctorId = req.user.id;

        if (!date || !startTime || !endTime) {
            return res.status(400).json({
                message: "All fields are required"
            });
        }

        const datePattern = /^\d{4}-\d{2}-\d{2}$/;
        const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

        if (
            !datePattern.test(date) ||
            !timePattern.test(startTime) ||
            !timePattern.test(endTime)
        ) {
            return res.status(400).json({
                message: "Invalid date or time format"
            });
        }

        const [year, month, day] = date.split("-").map(Number);

        const isValidDate =
            year >= 1 &&
            month >= 1 &&
            month <= 12 &&
            day >= 1 &&
            day <= new Date(Date.UTC(year, month, 0)).getUTCDate();

        if (!isValidDate) {
            return res.status(400).json({
                message: "Please enter a valid date"
            });
        }

        // Prevent updating to previous dates
        if (date < getTodayDate()) {
            return res.status(400).json({
                message: "You cannot update slots to previous dates"
            });
        }

        if (startTime >= endTime) {
            return res.status(400).json({
                message: "End time must be greater than start time"
            });
        }

        const slotFound = await Slot.findOne({
            _id: id,
            doctorId
        });

        if (!slotFound) {
            return res.status(404).json({
                message: "Slot not found"
            });
        }

        if (slotFound.status === "booked") {
            return res.status(400).json({
                message: "Booked slots cannot be updated"
            });
        }

        const existingSlot = await Slot.findOne({
            _id: { $ne: id },
            doctorId,
            date,
            startTime: { $lt: endTime },
            endTime: { $gt: startTime }
        });

        if (existingSlot) {
            return res.status(400).json({
                message: "This time overlaps with another slot"
            });
        }

        slotFound.date = date;
        slotFound.startTime = startTime;
        slotFound.endTime = endTime;

        await slotFound.save();

        return res.status(200).json({
            message: "Slot updated successfully",
            slot: slotFound
        });

    } catch (error) {
        console.log("Update slot error:", error);

        return res.status(500).json({
            message: "Error updating slot"
        });
    }
};



//doctor

export const createDoctorProfile = async (req, res) => {
    try {
        const {
            description,
            specialization,
            qualification,
            experience,
            consultationFee
        } = req.body;

        const doctorId = req.user.id;

        if (
            !description ||
            !specialization ||
            !qualification ||
            experience === undefined ||
            consultationFee === undefined
        ) {
            return res.status(400).json({
                message: "All fields are required"
            });
        }

        const existingProfile = await DoctorProfile.findOne({ doctorId });

        if (existingProfile) {
            return res.status(400).json({
                message: "Doctor profile already exists"
            });
        }

        // Upload image to GridFS
        let imageId = null;

        if (req.file) {
            const bucket = getBucket();

            const uploadStream = bucket.openUploadStream(
                req.file.originalname,
                {
                    metadata: {
                        contentType: req.file.mimetype
                    }
                }
            );

            await new Promise((resolve, reject) => {
                uploadStream.on("finish", resolve);
                uploadStream.on("error", reject);

                uploadStream.end(req.file.buffer);
            });

            imageId = uploadStream.id;
        }

        // Save image ID along with doctor profile
        const newProfile = await DoctorProfile.create({
            doctorId,
            description,
            specialization,
            qualification,
            experience,
            consultationFee,
            profileImage: imageId,
            isApproved: true
        });

        return res.status(201).json({
            message: "Doctor profile created successfully",
            profile: newProfile
        });

    } catch (error) {
        console.log("Create doctor profile error:", error);

        return res.status(500).json({
            message: "Error creating doctor profile"
        });
    }
};


export const updateMyDoctorProfile = async (req, res) => {
    try {
        const doctorId = req.user.id;

        // Find the logged-in doctor's profile
        const profile = await DoctorProfile.findOne({ doctorId });

        if (!profile) {
            return res.status(404).json({
                message: "Doctor profile not found"
            });
        }

        // Update profile details
        const {
            description,
            specialization,
            qualification,
            experience,
            consultationFee
        } = req.body;

        if (description !== undefined) profile.description = description;
        if (specialization !== undefined) profile.specialization = specialization;
        if (qualification !== undefined) profile.qualification = qualification;
        if (experience !== undefined) profile.experience = experience;
        if (consultationFee !== undefined) profile.consultationFee = consultationFee;

        // Update image if a new image is uploaded
        if (req.file) {
            const bucket = getBucket();

            const uploadStream = bucket.openUploadStream(
                req.file.originalname,
                {
                    metadata: {
                        contentType: req.file.mimetype
                    }
                }
            );

            uploadStream.end(req.file.buffer);

            await new Promise((resolve, reject) => {
                uploadStream.on("finish", resolve);
                uploadStream.on("error", reject);
            });

            profile.profileImage = uploadStream.id;
        }

        await profile.save();

        return res.status(200).json({
            message: "Doctor profile updated successfully",
            profile
        });

    } catch (error) {
        console.log("Update doctor profile error:", error);

        return res.status(500).json({
            message: "Internal server error"
        });
    }
};



export const getAllDoctors = async (req, res) => {
    try {
        const doctors = await DoctorProfile.find()
            .populate("doctorId", "name");

        return res.status(200).json({
            message: "Doctors fetched successfully",
            count: doctors.length,
            doctors
        });

    } catch (error) {
        console.log("Get doctors error:", error);

        return res.status(500).json({
            message: "Error fetching doctors"
        });
    }
};



export const getDoctorAvailableSlots = async (req, res) => {
    try {
        const { doctorId } = req.params;
        const { date } = req.query;

        const now = new Date();

        const today =
            `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

        // Start with the selected doctor's available slots
        const filter = {
            doctorId,
            status: "available",
            date: date ? date : { $gte: today }
        };

        // If the patient selects today, hide past time slots
        if (date === today) {
            const currentTime =
                `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

            filter.startTime = { $gt: currentTime };
        }

        const slots = await Slot.find(filter).sort({
            date: 1,
            startTime: 1
        });

        return res.status(200).json({
            message: "Available slots fetched successfully",
            count: slots.length,
            slots
        });

    } catch (error) {
        console.log("Get available slots error:", error);

        return res.status(500).json({
            message: "Error fetching available slots"
        });
    }
};




export const bookAppointment = async (req, res) => {
    try {
        const { slotId } = req.params;
        const patientId = req.user.id;

        // 1. Book available slot
        const slot = await Slot.findOneAndUpdate(
            {
                _id: slotId,
                status: "available"
            },
            {
                $set: {
                    status: "booked",
                    appointmentStatus: "pending",
                    patientId
                }
            },
            {
                new: true
            }
        );

        if (!slot) {
            return res.status(404).json({
                message: "Slot is not available or does not exist"
            });
        }

        // 2. Create Appointment history
        const appointment = await Appointment.create({
            patientId,
            doctorId: slot.doctorId,
            slotId: slot._id,
            paymentId: null,
            date: slot.date,
            startTime: slot.startTime,
            endTime: slot.endTime,
            status: "pending"
        });

        return res.status(200).json({
            message: "Appointment booked successfully",
            appointment
        });

    } catch (error) {
        console.log("Booking error:", error);

        return res.status(500).json({
            message: "Error booking appointment"
        });
    }
};




export const getMyAppointments = async (req, res) => {
    try {
        const patientId = req.user.id;

        // 1. Find only successful payments
        const paidPayments = await Payment.find({
            patientId,
            status: "paid"
        }).select("slotId");

        // 2. Get slot IDs from successful payments
        const paidSlotIds = paidPayments.map(
            (payment) => payment.slotId
        );

        // 3. Fetch only booked slots with successful payments
        const appointments = await Slot.find({
            _id: { $in: paidSlotIds },
            patientId,
            status: "booked"
        })
            .populate("doctorId", "name")
            .sort({
                date: 1,
                startTime: 1
            });

        return res.status(200).json({
            message: "Appointments fetched successfully",
            count: appointments.length,
            appointments
        });

    } catch (error) {
        console.log("Get appointments error:", error);

        return res.status(500).json({
            message: "Error fetching appointments"
        });
    }
};





export const cancelAppointment = async (req, res) => {
    try {
        const { slotId } = req.params;
        const patientId = req.user.id;

        // 1. Find currently booked slot
        const slot = await Slot.findOne({
            _id: slotId,
            patientId,
            status: "booked"
        });

        if (!slot) {
            return res.status(404).json({
                message: "Appointment not found"
            });
        }

        if (
            slot.appointmentStatus === "completed" ||
            slot.appointmentStatus === "cancelled"
        ) {
            return res.status(400).json({
                message: "This appointment cannot be cancelled"
            });
        }

        // 2. Find the matching active Appointment
        const appointment = await Appointment.findOne({
            slotId: slot._id,
            patientId,
            doctorId: slot.doctorId,
            status: { $in: ["pending", "confirmed"] }
        }).sort({ createdAt: -1 });

        if (!appointment) {
            return res.status(404).json({
                message: "Appointment history record not found"
            });
        }

        // 3. Refund only this appointment's payment
        const refund = await refundAppointmentPayment(
            slot,
            appointment.paymentId
        );

        // 4. Update Appointment history
        appointment.status = "cancelled";
        appointment.cancelledBy = "patient";
        appointment.cancelledAt = new Date();

        await appointment.save();

        // 5. Release slot for another patient
        slot.status = "available";
        slot.patientId = null;
        slot.appointmentStatus = "cancelled";

        await slot.save();

        return res.status(200).json({
            message: "Appointment cancelled successfully",
            refundStatus: refund.refundStatus,
            appointment
        });

    } catch (error) {
        console.log("Cancel appointment error:", error);

        return res.status(500).json({
            message: error.message || "Error cancelling appointment"
        });
    }
};




export const getDoctorAppointments = async (req, res) => {
    try {
        const doctorId = req.user.id;

        // 1. Find all successful payments of this doctor
        const paidPayments = await Payment.find({
            doctorId,
            status: "paid"
        }).select("slotId");

        // 2. Get slot IDs from those payments
        const paidSlotIds = paidPayments.map(
            (payment) => payment.slotId
        );

        // 3. Find only appointments with successful payments
        const appointments = await Slot.find({
            _id: { $in: paidSlotIds },
            doctorId,
            status: "booked"
        }).populate("patientId", "name email");

        return res.status(200).json({
            message: "Appointments fetched successfully",
            count: appointments.length,
            appointments
        });

    } catch (error) {
        console.log("Get doctor appointments error:", error);

        return res.status(500).json({
            message: "Error fetching appointments"
        });
    }
};



export const getDoctorImage = async (req, res) => {
    try {
        const { imageId } = req.params;

        const bucket = getBucket();

        const objectId = new mongoose.Types.ObjectId(imageId);

        const files = await bucket.find({
            _id: objectId
        }).toArray();

        if (!files.length) {
            return res.status(404).json({
                message: "Image not found"
            });
        }

        res.set(
            "Content-Type",
            files[0].metadata?.contentType || "application/octet-stream"
        );

        const downloadStream = bucket.openDownloadStream(objectId);

        downloadStream.on("error", (error) => {
            console.log("Image download error:", error);

            if (!res.headersSent) {
                res.status(404).json({
                    message: "Image not found"
                });
            }
        });

        downloadStream.pipe(res);

    } catch (error) {
        console.log("Get doctor image error:", error);

        return res.status(500).json({
            message: "Error fetching image"
        });
    }
};



// Get patient profile
export const getPatientProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select("-password");

        res.status(200).json({
            message: "Profile fetched successfully",
            profile: user
        });

    } catch (error) {
        res.status(500).json({
            message: "Unable to fetch profile"
        });
    }
};












export const updateAppointmentStatus = async (req, res) => {
    try {
        const { slotId } = req.params;
        const { appointmentStatus } = req.body;
        const doctorId = req.user.id;

        const allowedStatuses = [
            "confirmed",
            "completed",
            "cancelled"
        ];

        if (!allowedStatuses.includes(appointmentStatus)) {
            return res.status(400).json({
                message: "Invalid appointment status"
            });
        }

        // 1. Find booked slot
        const slot = await Slot.findOne({
            _id: slotId,
            doctorId,
            status: "booked"
        });

        if (!slot) {
            return res.status(404).json({
                message: "Appointment not found"
            });
        }

        if (
            slot.appointmentStatus === "completed" ||
            slot.appointmentStatus === "cancelled"
        ) {
            return res.status(400).json({
                message: "This appointment can no longer be updated"
            });
        }

        // 2. Find corresponding Appointment history
        const appointment = await Appointment.findOne({
            slotId: slot._id,
            patientId: slot.patientId,
            doctorId,
            status: { $in: ["pending", "confirmed"] }
        }).sort({ createdAt: -1 });

        if (!appointment) {
            return res.status(404).json({
                message: "Appointment history record not found"
            });
        }

        let refundStatus = null;

        // 3. Doctor cancels appointment
        if (appointmentStatus === "cancelled") {
            const refund = await refundAppointmentPayment(
                slot,
                appointment.paymentId
            );

            refundStatus = refund.refundStatus;

            appointment.cancelledBy = "doctor";
            appointment.cancelledAt = new Date();
        }

        // 4. Confirm or complete only after successful payment
        if (
            appointmentStatus === "confirmed" ||
            appointmentStatus === "completed"
        ) {
            const payment = appointment.paymentId
                ? await Payment.findOne({
                    _id: appointment.paymentId,
                    patientId: slot.patientId,
                    doctorId,
                    slotId: slot._id,
                    status: "paid"
                })
                : null;

            if (!payment) {
                return res.status(400).json({
                    message: "Payment has not been completed"
                });
            }
        }

        // 5. Update Appointment history
        appointment.status = appointmentStatus;

        await appointment.save();

        // 6. Update current Slot
        slot.appointmentStatus = appointmentStatus;

        if (appointmentStatus === "cancelled") {
            slot.status = "available";
            slot.patientId = null;
        }

        await slot.save();

        return res.status(200).json({
            message: "Appointment status updated successfully",
            refundStatus,
            appointment
        });

    } catch (error) {
        console.log("Update appointment status error:", error);

        return res.status(500).json({
            message: error.message || "Error updating appointment status"
        });
    }
};






export const createPaymentOrder = async (req, res) => {
    let reservedSlotId = null;
    let createdPaymentId = null;
    let createdAppointmentId = null;

    const patientId = req.user.id;

    try {
        const { slotId } = req.params;

        // Check whether the patient already has an active payment
        const existingPayment = await Payment.findOne({
            patientId,
            status: "created",
            expiresAt: { $gt: new Date() }
        });

        if (existingPayment) {
            return res.status(400).json({
                message: "You already have a pending payment. Please complete it first."
            });
        }

        // 1. Find available slot
        const slot = await Slot.findOne({
            _id: slotId,
            status: "available"
        });

        // Continue with your existing code...
        if (!slot) {
            return res.status(404).json({
                message: "This slot is not available"
            });
        }

        // 2. Find doctor's profile
        const doctorProfile = await DoctorProfile.findOne({
            doctorId: slot.doctorId
        });

        if (!doctorProfile) {
            return res.status(404).json({
                message: "Doctor profile not found"
            });
        }

        // 3. Get consultation fee
        const amount = Number(doctorProfile.consultationFee);

        if (!Number.isFinite(amount) || amount <= 0) {
            return res.status(400).json({
                message: "Invalid consultation fee"
            });
        }

        // 4. Reserve slot
        const bookedSlot = await Slot.findOneAndUpdate(
            {
                _id: slotId,
                status: "available"
            },
            {
                $set: {
                    patientId,
                    status: "booked",
                    appointmentStatus: "pending"
                }
            },
            {
                new: true
            }
        );

        if (!bookedSlot) {
            return res.status(409).json({
                message: "Sorry, this slot was just booked by someone else"
            });
        }

        reservedSlotId = bookedSlot._id;

        // 5. Create Razorpay order
        const order = await razorpay.orders.create({
            amount: Math.round(amount * 100),
            currency: "INR",
            receipt: `slot_${bookedSlot._id}`
        });

        // Payment expires after 1 minute
        const expiresAt = new Date(Date.now() + 1 * 60 * 1000);
        // 6. Create Payment document
        const payment = await Payment.create({
            patientId,
            doctorId: bookedSlot.doctorId,
            slotId: bookedSlot._id,
            amount,
            razorpayOrderId: order.id,
            status: "created",
            expiresAt
        });

        createdPaymentId = payment._id;

        // 7. Create Appointment document
        const appointment = await Appointment.create({
            patientId,
            doctorId: bookedSlot.doctorId,
            slotId: bookedSlot._id,
            paymentId: payment._id,
            date: bookedSlot.date,
            startTime: bookedSlot.startTime,
            endTime: bookedSlot.endTime,
            status: "pending"
        });

        createdAppointmentId = appointment._id;

        // 8. Send order details to React
        return res.status(201).json({
            message: "Payment order created successfully",
            orderId: order.id,
            amount: order.amount,
            currency: order.currency,
            keyId: process.env.RAZORPAY_KEY_ID,
            expiresAt
        });
    } catch (error) {
        console.log("Create payment order error:", error);

        // Mark Payment as failed
        if (createdPaymentId) {
            await Payment.findByIdAndUpdate(
                createdPaymentId,
                { status: "failed" }
            );
        }

        // Mark Appointment as cancelled if it was created
        if (createdAppointmentId) {
            await Appointment.findByIdAndUpdate(
                createdAppointmentId,
                {
                    status: "cancelled",
                    cancelledBy: "patient",
                    cancelledAt: new Date()
                }
            );
        }

        // Release reserved slot
        if (reservedSlotId) {
            await Slot.findOneAndUpdate(
                {
                    _id: reservedSlotId,
                    patientId,
                    status: "booked",
                    appointmentStatus: "pending"
                },
                {
                    $set: {
                        patientId: null,
                        status: "available",
                        appointmentStatus: "cancelled"
                    }
                }
            );
        }

        return res.status(500).json({
            message: "Error creating payment order"
        });
    }
};


const refundLatePayment = async (payment) => {
    const existingRefunds =
        await razorpay.payments.fetchMultipleRefund(
            payment.razorpayPaymentId
        );

    if (existingRefunds.items?.length > 0) {
        const refund = existingRefunds.items[0];

        payment.razorpayRefundId = refund.id;
        payment.refundStatus =
            refund.status === "processed"
                ? "processed"
                : refund.status === "failed"
                    ? "failed"
                    : "pending";

        await payment.save();

        return;
    }

    const refund = await razorpay.payments.refund(
        payment.razorpayPaymentId
    );

    payment.razorpayRefundId = refund.id;
    payment.refundStatus =
        refund.status === "processed"
            ? "processed"
            : refund.status === "failed"
                ? "failed"
                : "pending";

    await payment.save();
};


export const verifyPayment = async (req, res) => {
    try {
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature
        } = req.body;

        const patientId = req.user.id;

        if (
            !razorpay_order_id ||
            !razorpay_payment_id ||
            !razorpay_signature
        ) {
            return res.status(400).json({
                message: "Payment details are required"
            });
        }

        // 1. Find payment
        const payment = await Payment.findOne({
            razorpayOrderId: razorpay_order_id,
            patientId
        });

        if (!payment) {
            return res.status(404).json({
                message: "Payment record not found"
            });
        }

        // 2. Verify signature
        const generatedSignature = crypto
            .createHmac(
                "sha256",
                process.env.RAZORPAY_KEY_SECRET
            )
            .update(
                razorpay_order_id + "|" + razorpay_payment_id
            )
            .digest("hex");

        const signatureBuffer = Buffer.from(generatedSignature);
        const receivedSignatureBuffer = Buffer.from(razorpay_signature);

        if (
            signatureBuffer.length !== receivedSignatureBuffer.length ||
            !crypto.timingSafeEqual(
                signatureBuffer,
                receivedSignatureBuffer
            )
        ) {
            return res.status(400).json({
                message: "Invalid payment signature"
            });
        }

        // 3. Verify actual payment with Razorpay
        const razorpayPayment = await razorpay.payments.fetch(
            razorpay_payment_id
        );

        if (
            razorpayPayment.order_id !== razorpay_order_id ||
            razorpayPayment.status !== "captured"
        ) {
            return res.status(400).json({
                message: "Payment is not captured"
            });
        }

        // 4. Find original appointment and slot
        const appointment = await Appointment.findOne({
            paymentId: payment._id,
            patientId
        });

        const slot = await Slot.findOne({
            _id: payment.slotId,
            patientId,
            status: "booked",
            appointmentStatus: "pending"
        });

        const isAppointmentActive =
            appointment &&
            appointment.status === "pending" &&
            slot &&
            payment.expiresAt > new Date();

        // 5. Record successful payment
        payment.razorpayPaymentId = razorpay_payment_id;
        payment.razorpaySignature = razorpay_signature;
        payment.status = "paid";

        await payment.save();

        // 6. If appointment was cancelled or expired, refund payment
        if (!isAppointmentActive) {
            if (appointment && appointment.status === "pending") {
                appointment.status = "cancelled";
                appointment.cancelledBy = "patient";
                appointment.cancelledAt = new Date();
                await appointment.save();
            }

            if (slot) {
                slot.status = "available";
                slot.patientId = null;
                slot.appointmentStatus = "cancelled";
                await slot.save();
            }

            await refundLatePayment(payment);

            return res.status(200).json({
                message: "Slot Booked.",
                paymentStatus: "paid",
                refundStatus: payment.refundStatus
            });
        }

        return res.status(200).json({
            message: "Payment successful",
            payment
        });

    } catch (error) {
        console.log("Verify payment error:", error);

        return res.status(500).json({
            message: "Error verifying payment"
        });
    }
};




const refundAppointmentPayment = async (slot, paymentId) => {

    // Legacy appointment without a payment
    if (!paymentId) {
        return {
            refundStatus: "not_required"
        };
    }

    // Find only the payment linked to this appointment
    const payment = await Payment.findOne({
        _id: paymentId,
        slotId: slot._id,
        patientId: slot.patientId,
        doctorId: slot.doctorId
    });

    if (!payment) {
        throw new Error("Payment record not found");
    }

    // No refund is needed for an unpaid or failed payment
    if (payment.status !== "paid") {
        return {
            refundStatus: "not_required"
        };
    }

    // Already processed
    if (payment.refundStatus === "processed") {
        return {
            refundStatus: "processed"
        };
    }

    // Already waiting for Razorpay
    if (payment.refundStatus === "pending") {
        return {
            refundStatus: "pending"
        };
    }

    try {
        if (!payment.razorpayPaymentId) {
            throw new Error("Razorpay payment ID not found");
        }

        // Check actual payment status
        const razorpayPayment = await razorpay.payments.fetch(
            payment.razorpayPaymentId
        );

        if (razorpayPayment.status !== "captured") {
            throw new Error(
                `Payment is not captured: ${razorpayPayment.status}`
            );
        }

        // Check whether a refund already exists
        const existingRefunds =
            await razorpay.payments.fetchMultipleRefund(
                payment.razorpayPaymentId
            );

        if (existingRefunds.items?.length > 0) {
            const existingRefund = existingRefunds.items[0];

            payment.razorpayRefundId = existingRefund.id;

            payment.refundStatus =
                existingRefund.status === "processed"
                    ? "processed"
                    : existingRefund.status === "failed"
                        ? "failed"
                        : "pending";

            await payment.save();

            return {
                refundStatus: payment.refundStatus
            };
        }

        // Request a new refund
        const refund = await razorpay.payments.refund(
            payment.razorpayPaymentId
        );

        payment.razorpayRefundId = refund.id;

        payment.refundStatus =
            refund.status === "processed"
                ? "processed"
                : refund.status === "failed"
                    ? "failed"
                    : "pending";

        await payment.save();

        return {
            refundStatus: payment.refundStatus
        };

    } catch (error) {
        console.log("Refund error:", error);

        // Do not assume the refund failed if Razorpay's response
        // was lost. Check Razorpay Dashboard before retrying.
        throw new Error(
            "Refund status could not be confirmed. Please check Razorpay."
        );
    }
};






export const cancelPendingPayment = async (req, res) => {
    try {
        const { slotId } = req.params;
        const patientId = req.user.id;

        const payment = await Payment.findOne({
            slotId,
            patientId,
            status: "created"
        }).sort({ createdAt: -1 });

        if (!payment) {
            return res.status(404).json({
                message: "Pending payment not found"
            });
        }

        return res.status(200).json({
            message: "Payment cancellation received. Your slot will remain reserved until the payment expiry time.",
            expiresAt: payment.expiresAt
        });

    } catch (error) {
        console.log("Cancel pending payment error:", error);

        return res.status(500).json({
            message: "Could not process payment cancellation"
        });
    }
};


export const getMyAppointmentHistory = async (req, res) => {
    try {
        const patientId = req.user.id;

        const appointments = await Appointment.find({
            patientId
        })
            .populate("doctorId", "name")
            .populate(
                "paymentId",
                "amount status refundStatus razorpayRefundId razorpayPaymentId"
            )
            .sort({ createdAt: -1 });

        return res.status(200).json({
            message: "Appointment history fetched successfully",
            count: appointments.length,
            appointments
        });

    } catch (error) {
        console.log("Get appointment history error:", error);

        return res.status(500).json({
            message: "Error fetching appointment history"
        });
    }
};
