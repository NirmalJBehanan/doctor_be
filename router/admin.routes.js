import express from "express";

import {
    createDoctorAccount,
    getAdminDashboard,
    getAllAppointments,
    getAllDoctors,
    getAllUsers,
    updateDoctorProfile,
    updateDoctorStatus,
    updateUserStatus
} from "../controller/Admin.controller.js";

import { middleware } from "../middleware/auth.middleware.js";
import { adminOnly } from "../middleware/role.middleware.js";

const router = express.Router();

router.get("/dashboard", middleware, adminOnly, getAdminDashboard);

// Manage users
router.get("/users", middleware, adminOnly, getAllUsers);
router.patch("/users/:userId/status", middleware, adminOnly, updateUserStatus);
router.post("/doctors", middleware, adminOnly, createDoctorAccount);
router.get("/doctors", middleware, adminOnly, getAllDoctors);

router.put(
    "/doctors/:doctorId",
    middleware,
    adminOnly,
    updateDoctorProfile
);

router.patch(
    "/doctors/:doctorId/status",
    middleware,
    adminOnly,
    updateDoctorStatus
);

// Manage all appointments
router.get("/appointments", middleware, adminOnly, getAllAppointments);
export default router;