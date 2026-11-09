import { User } from "../model/user.model.js";
import { Appointment } from "../model/appointment.model.js";
import { sendDoctorCredentialsEmail } from "../services/mail.service.js";
import bcrypt from "bcrypt";
import { DoctorProfile } from "../model/doctorProfile.model.js";
export const getAdminDashboard = async (req, res) => {
    try {
        const totalUsers = await User.countDocuments({
            role: "user"
        });

        const totalDoctors = await User.countDocuments({
            role: "doctor"
        });

        const totalAppointments = await Appointment.countDocuments();

        return res.status(200).json({
            message: "Admin dashboard data fetched successfully",
            totalUsers,
            totalDoctors,
            totalAppointments
        });

    } catch (error) {
        console.log("Admin dashboard error:", error);

        return res.status(500).json({
            message: "Something went wrong"
        });
    }
};

// Get all patients
export const getAllUsers = async (req, res) => {
    try {
        const users = await User.find({ role: "user" })
            .select("-password")
            .sort({ createdAt: -1 });

        return res.status(200).json({
            message: "Users fetched successfully",
            users
        });

    } catch (error) {
        console.log("Get all users error:", error);

        return res.status(500).json({
            message: "Something went wrong"
        });
    }
};


// Activate or deactivate a patient account
export const updateUserStatus = async (req, res) => {
    try {
        const { userId } = req.params;
        const { isActive } = req.body;

        if (typeof isActive !== "boolean") {
            return res.status(400).json({
                message: "isActive must be true or false"
            });
        }

        const user = await User.findOneAndUpdate(
            {
                _id: userId,
                role: "user"
            },
            {
                isActive
            },
            {
                new: true
            }
        ).select("-password");

        if (!user) {
            return res.status(404).json({
                message: "User not found"
            });
        }

        return res.status(200).json({
            message: isActive
                ? "User activated successfully"
                : "User deactivated successfully",
            user
        });

    } catch (error) {
        console.log("Update user status error:", error);

        return res.status(500).json({
            message: "Something went wrong"
        });
    }
};

// Admin creates a doctor account
export const createDoctorAccount = async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({
                message: "Name, email and password are required"
            });
        }

        const existingUser = await User.findOne({ email });

        if (existingUser) {
            return res.status(409).json({
                message: "Email already exists"
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const doctor = await User.create({
            name,
            email,
            password: hashedPassword,
            role: "doctor",
            isverified: true,
            isActive: true
        });
        await sendDoctorCredentialsEmail(email, name, password);
        return res.status(201).json({
            message: "Doctor account created successfully",
            doctor: {
                _id: doctor._id,
                name: doctor.name,
                email: doctor.email,
                role: doctor.role,
                isActive: doctor.isActive
            }
        });

    } catch (error) {
        console.log("Create doctor account error:", error);

        return res.status(500).json({
            message: "Something went wrong"
        });
    }
};

// Get all doctors and their profiles
export const getAllDoctors = async (req, res) => {
    try {
        const doctors = await User.find({
            role: "doctor"
        })
        .select("-password")
        .sort({ createdAt: -1 });

        const doctorProfiles = await DoctorProfile.find()
            .populate("doctorId", "name email isActive isverified");

        const result = doctors.map((doctor) => {
            const profile = doctorProfiles.find(
                (item) => item.doctorId?._id.toString() === doctor._id.toString()
            );

            return {
                doctor,
                profile: profile || null
            };
        });

        return res.status(200).json({
            message: "Doctors fetched successfully",
            doctors: result
        });

    } catch (error) {
        console.log("Get all doctors error:", error);

        return res.status(500).json({
            message: "Something went wrong"
        });
    }
};

// Edit doctor account and profile
export const updateDoctorProfile = async (req, res) => {
    try {
        const { doctorId } = req.params;

        const {
            name,
            description,
            specialization,
            qualification,
            experience,
            consultationFee
        } = req.body;

        // Check whether doctor exists
        const doctor = await User.findOne({
            _id: doctorId,
            role: "doctor"
        });

        if (!doctor) {
            return res.status(404).json({
                message: "Doctor not found"
            });
        }

        // Update doctor's name if provided
        if (name !== undefined) {
            doctor.name = name;
            await doctor.save();
        }

        // Find doctor's professional profile
        const profile = await DoctorProfile.findOne({
            doctorId: doctorId
        });

        if (!profile) {
            return res.status(404).json({
                message: "Doctor profile not found. The doctor must create their profile first."
            });
        }

        // Update only the fields provided
        if (description !== undefined) {
            profile.description = description;
        }

        if (specialization !== undefined) {
            profile.specialization = specialization;
        }

        if (qualification !== undefined) {
            profile.qualification = qualification;
        }

        if (experience !== undefined) {
            profile.experience = experience;
        }

        if (consultationFee !== undefined) {
            profile.consultationFee = consultationFee;
        }

        await profile.save();

        return res.status(200).json({
            message: "Doctor profile updated successfully",
            doctor: {
                _id: doctor._id,
                name: doctor.name,
                email: doctor.email
            },
            profile
        });

    } catch (error) {
        console.log("Update doctor profile error:", error);

        return res.status(500).json({
            message: "Something went wrong"
        });
    }
};

// Activate or deactivate doctor
export const updateDoctorStatus = async (req, res) => {
    try {
        const { doctorId } = req.params;
        const { isActive } = req.body;

        if (typeof isActive !== "boolean") {
            return res.status(400).json({
                message: "isActive must be true or false"
            });
        }

        const doctor = await User.findOneAndUpdate(
            {
                _id: doctorId,
                role: "doctor"
            },
            {
                isActive: isActive
            },
            {
                new: true
            }
        ).select("-password");

        if (!doctor) {
            return res.status(404).json({
                message: "Doctor not found"
            });
        }

        return res.status(200).json({
            message: isActive
                ? "Doctor activated successfully"
                : "Doctor deactivated successfully",
            doctor
        });

    } catch (error) {
        console.log("Update doctor status error:", error);

        return res.status(500).json({
            message: "Something went wrong"
        });
    }
};

// manage all appoinments

// Get all appointments

export const getAllAppointments = async (req, res) => {
    try {
        const { status, date } = req.query;

        const filter = {};

        // Filter by status
        if (status) {
            const allowedStatus = [
                "pending",
                "confirmed",
                "completed",
                "cancelled"
            ];

            if (!allowedStatus.includes(status)) {
                return res.status(400).json({
                    message: "Invalid appointment status"
                });
            }

            filter.status = status;
        }

        // Filter by appointment date
        if (date) {
            filter.date = date;
        }

        const appointments = await Appointment.find(filter)
            .populate("patientId", "name email")
            .populate("doctorId", "name email")
            .populate("slotId", "date startTime endTime")
            .populate("paymentId", "amount status refundStatus")
            .sort({ date: 1, startTime: 1 });

        return res.status(200).json({
            message: "Appointments fetched successfully",
            totalAppointments: appointments.length,
            appointments
        });

    } catch (error) {
        console.log("Get all appointments error:", error);

        return res.status(500).json({
            message: "Something went wrong"
        });
    }
};


