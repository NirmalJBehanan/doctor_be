
import express from "express";
import {
    activation,
    bookAppointment,
    cancelAppointment,
    createDoctorProfile,
    createSlot,
    DeleteSlot,
    getAllDoctors,
    getDoctorAppointments,
    getDoctorAvailableSlots,
    getDoctorImage,
    getMe,
    getMyAppointments,
    getSlots,
    login,
    Register,
    UpdateSlot
} from "../controller/Doctor.controller.js";

import { middleware } from "../middleware/auth.middleware.js";
import { doctorOnly } from "../middleware/role.middleware.js";
import upload from "../middleware/upload.middleware.js";
const router = express.Router();

router.post("/register", Register);
router.post("/login", login);
router.post("/auth", middleware);
router.post("/activate", middleware, activation);
router.get("/me", middleware, getMe);
router.post("/createSlot", middleware, doctorOnly, createSlot)
router.get("/getSlots", middleware, doctorOnly, getSlots);
router.delete("/deleteSlot/:id", middleware, doctorOnly, DeleteSlot);
router.put("/updateSlot/:id", middleware, doctorOnly, UpdateSlot);
router.post("/createDoctorProfile",middleware,doctorOnly,upload.single("image"),createDoctorProfile);
router.get("/getAllDoctors", getAllDoctors);
router.get("/availableSlots/:doctorId",getDoctorAvailableSlots);
router.post("/bookAppointment/:slotId",middleware,bookAppointment);
router.get("/myAppointments",middleware,getMyAppointments);
router.patch("/cancelAppointment/:slotId",middleware,cancelAppointment);
router.get("/doctorAppointments",middleware,doctorOnly,getDoctorAppointments);
router.get("/doctor-image/:imageId", getDoctorImage);
export default router;
