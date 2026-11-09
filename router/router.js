
import express from "express";
import {
    getMyAppointmentHistory
} from "../controller/Doctor.controller.js";
import {
    activation,
    bookAppointment,
    cancelAppointment,
    cancelPendingPayment,
    createDoctorProfile,
    createPaymentOrder,
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
    updateAppointmentStatus,
    UpdateSlot,
    verifyPayment
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

router.get("/myAppointments",middleware,getMyAppointments);
router.patch("/cancelAppointment/:slotId",middleware,cancelAppointment);
router.get("/doctorAppointments",middleware,doctorOnly,getDoctorAppointments);
router.get("/doctor-image/:imageId", getDoctorImage);
router.patch("/updateAppointmentStatus/:slotId",middleware,doctorOnly,updateAppointmentStatus);

router.post( "/createPaymentOrder/:slotId", middleware, createPaymentOrder);

router.post("/verifyPayment",middleware,verifyPayment);


router.patch(
    "/cancelPendingPayment/:slotId",
    middleware,
    cancelPendingPayment
);
router.get(
    "/myAppointmentHistory",
    middleware,
    getMyAppointmentHistory
);



export default router;
