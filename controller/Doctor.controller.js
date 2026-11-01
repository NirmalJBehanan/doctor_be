import express from "express";
import bcrypt from "bcrypt";
import mongoose from "mongoose";
import { User } from "../model/user.model.js";
import jwt from "jsonwebtoken"
import { sendRegistrationEmail } from "../services/mail.service.js";
import { Slot } from "../model/slot.model.js";

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
            { expiresIn: "15m" }
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

export const getMe = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);

        if (!user) {
            return res.status(404).json({
                message: "User not found"
            });
        }

        res.status(200).json({
            status: true,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role
            }
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

        // 1. Check whether all fields are provided
        if (!date || !startTime || !endTime) {
            return res.status(400).json({
                message: "All fields are required"
            });
        }

        // 2. Check date and time formats
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

        // 3. Check whether the date actually exists
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

        // 4. Check whether end time is greater than start time
        if (startTime >= endTime) {
            return res.status(400).json({
                message: "End time must be greater than start time"
            });
        }

        // 5. Check whether the new slot overlaps with an existing slot
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

        // 6. Create the new slot
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
            message: "Error adding slot"
        });
    }
};

// Get all slots of the logged-in doctor
export const getSlots = async (req, res) => {
    try {
        const doctorId = req.user.id;

        const slots = await Slot.find({ doctorId })
            .sort({ date: 1, startTime: 1 });

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
        const { id } = req.params;
        const { doctorId } = req.user.id;
        const slotFound = await Slot.findOne({ _id: id, doctorId })
        if (!slotFound) {
            return res.status(500).json({
                message: "Error slots NOT FOUND"
            });
        }
        if (slotFound.status === "booked") {
            return res.status(500).json({
                message: "Error slot already booked"
            });
        }

        await Slot.findOneAndDelete({
            _id: id,
            doctorId
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

}


export const UpdateSlot = async (req, res) => {
    try {
        // Get slot ID from URL
        const { id } = req.params;

        // Get updated details from request body
        const { date, startTime, endTime } = req.body;

        // Get logged-in doctor's ID
        const doctorId = req.user.id;

        // 1. Check all fields
        if (!date || !startTime || !endTime) {
            return res.status(400).json({
                message: "All fields are required"
            });
        }

        // 2. Validate date and time format
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

        // 3. Check whether the date actually exists
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

        // 4. Check start and end time
        if (startTime >= endTime) {
            return res.status(400).json({
                message: "End time must be greater than start time"
            });
        }

        // 5. Find the slot belonging to this doctor
        const slotFound = await Slot.findOne({
            _id: id,
            doctorId
        });

        if (!slotFound) {
            return res.status(404).json({
                message: "Slot not found"
            });
        }

        // 6. Do not update booked slots
        if (slotFound.status === "booked") {
            return res.status(400).json({
                message: "Booked slots cannot be updated"
            });
        }

        // 7. Check whether the updated time overlaps another slot
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

        // 8. Update the slot values
        slotFound.date = date;
        slotFound.startTime = startTime;
        slotFound.endTime = endTime;

        // Save changes in MongoDB
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


